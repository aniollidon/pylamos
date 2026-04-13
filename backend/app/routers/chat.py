from fastapi import APIRouter, Depends, HTTPException
import re
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.submission import Submission, SubmissionStatus
from app.models.exercise import Exercise
from app.models.chat import (
    ChatConversation, ChatMessage,
    ConversationType, ConversationStatus, MessageRole, MessageVerdict,
)
from app.schemas.chat import (
    ConversationCreate, ConversationOut, ConversationDetailOut,
    MessageCreate, MessageOut, ExecutionInfo,
)
from app.services.llm_service import llm_service, ROLE_MAP
from app.utils.prompt_builder import build_system_prompt
from app.utils.security import get_current_user, require_role
from app.utils.submission_utils import save_code_version

router = APIRouter(prefix="/api", tags=["chat"])

BOT_MENTION_RE = re.compile(r"(^|\s)/bot\b", re.IGNORECASE)
TEACHER_DIRECTIVE_PROMPT = """
[MODE_ORDRE_PROFESSOR]
Estas en mode d'ordre directa del professor.

Regles prioritaries:
1) Si l'ultim missatge del professor dona una instruccio directa, segueix-la com a prioritat maxima.
2) Mantingues el context de l'exercici, la conversa i el codi de l'alumne per respondre amb precisio.
3) No ignoris la seguretat ni inventis dades, pero no desviis la resposta cap a altres objectius si el professor ha donat una ordre clara.
4) Respon de manera clara i accionable segons la peticio del professor.
""".strip()


def _format_execution_info(execution: ExecutionInfo | None) -> str | None:
    if not execution:
        return None

    lines = [
        "[ESTAT_D_EXECUCIO]",
        f"status: {execution.status}",
        f"compiled: {'yes' if execution.compiled else 'no'}",
        f"executed: {'yes' if execution.executed else 'no'}",
        f"can_mark_resolved: {'yes' if execution.can_mark_resolved else 'no'}",
    ]
    if execution.line is not None:
        lines.append(f"line: {execution.line}")
    if execution.error_type:
        lines.append(f"error_type: {execution.error_type}")
    if execution.error_message:
        lines.append(f"error_message: {execution.error_message}")
    lines.append("[/ESTAT_D_EXECUCIO]")
    return "\n".join(lines)


def _can_mark_resolved(execution: ExecutionInfo | None) -> bool:
    return bool(execution and execution.status == "ok" and execution.can_mark_resolved)


def _get_resolution_block_note(language: str, execution: ExecutionInfo | None) -> str:
    status = execution.status if execution else "unknown"

    if language == "es":
        reasons = {
            "compile_error": "el código actual tiene errores de compilación",
            "runtime_error": "el código actual falla en ejecución",
            "stdin_needed": "la ejecución actual aún espera entrada",
            "compile_ok": "el código compila, pero no consta una ejecución correcta del código actual",
            "unknown": "no consta una ejecución correcta del código actual",
        }
        return f"No se puede marcar como correcto porque {reasons.get(status, reasons['unknown'])}."

    if language == "en":
        reasons = {
            "compile_error": "the current code has compilation errors",
            "runtime_error": "the current code fails at runtime",
            "stdin_needed": "the current execution is still waiting for input",
            "compile_ok": "the code compiles, but there is no successful execution recorded for the current code",
            "unknown": "there is no successful execution recorded for the current code",
        }
        return f"It cannot be marked as correct because {reasons.get(status, reasons['unknown'])}."

    reasons = {
        "compile_error": "el codi actual té errors de compilació",
        "runtime_error": "el codi actual falla en execució",
        "stdin_needed": "l'execució actual encara està pendent d'entrada",
        "compile_ok": "el codi compila, però no consta una execució correcta del codi actual",
        "unknown": "no consta una execució correcta del codi actual",
    }
    return f"No es pot marcar com a correcte perquè {reasons.get(status, reasons['unknown'])}."


def _enforce_execution_guard(result: str | None, execution: ExecutionInfo | None) -> str | None:
    if result != "correct":
        return result
    return "correct" if _can_mark_resolved(execution) else "incorrect"


@router.post("/submissions/{submission_id}/conversations", response_model=ConversationDetailOut)
async def create_conversation(
    submission_id: int,
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load submission + exercise
    sub_result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = sub_result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == UserRole.student and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role == UserRole.student and submission.chat_blocked:
        raise HTTPException(status_code=403, detail="Chat blocked")

    ex_result = await db.execute(select(Exercise).where(Exercise.id == submission.exercise_id))
    exercise = ex_result.scalar_one()

    # Create conversation
    conv = ChatConversation(
        submission_id=submission_id,
        type=body.type,
        status=ConversationStatus.open,
    )
    db.add(conv)
    await db.flush()

    # Build system prompt
    mode = "evaluate" if body.type == ConversationType.evaluate else "help"
    system_prompt = build_system_prompt(
        mode=mode,
        exercise_title=exercise.title,
        exercise_description=exercise.description,
        exercise_solution=exercise.solution,
        language=current_user.language,
        system_prompt_override=exercise.system_prompt_override,
    )

    # Save system message
    sys_msg = ChatMessage(
        conversation_id=conv.id,
        role=MessageRole.system,
        content=system_prompt,
    )
    db.add(sys_msg)

    # Save user message with code version
    version = await save_code_version(db, submission_id, body.code)
    initial_text = "Avalua el meu codi" if mode == "evaluate" else "Necessito ajuda"
    user_msg = ChatMessage(
        conversation_id=conv.id,
        role=MessageRole.user,
        content=initial_text,
        version_id=version.id,
    )
    db.add(user_msg)
    await db.flush()

    # Call LLM
    try:
        llm_response = await llm_service.chat(
            system_prompt=system_prompt,
            history=[],
            user_message=initial_text,
            code_snapshot=body.code,
            execution_info=_format_execution_info(body.execution),
        )
    except Exception as e:
        llm_response = f"Error connectant amb la IA: {str(e)}"

    display_response = llm_service.strip_result_markers(llm_response)
    raw_result = llm_service.parse_result(llm_response)
    result = _enforce_execution_guard(raw_result, body.execution)
    if raw_result == "correct" and result != "correct":
        display_response = f"{display_response}\n\n{_get_resolution_block_note(current_user.language, body.execution)}"

    # Save assistant response
    assistant_msg = ChatMessage(
        conversation_id=conv.id,
        role=MessageRole.assistant,
        content=display_response,
        verdict=MessageVerdict(result) if result else None,
    )
    db.add(assistant_msg)

    # Update submission status based on LLM result
    if result == "correct":
        submission.status = SubmissionStatus.correct
    elif result == "incorrect":
        submission.status = SubmissionStatus.incorrect

    # Detect chat ended by bot
    if llm_service.has_chat_ended(llm_response):
        submission.chat_blocked = True

    await db.flush()
    conv_result = await db.execute(
        select(ChatConversation)
        .options(selectinload(ChatConversation.messages))
        .where(ChatConversation.id == conv.id)
    )
    return conv_result.scalar_one()


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatConversation)
        .options(selectinload(ChatConversation.messages))
        .where(ChatConversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("/submissions/{submission_id}/conversations", response_model=list[ConversationOut])
async def list_conversations(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.submission_id == submission_id)
        .order_by(ChatConversation.created_at)
    )
    return result.scalars().all()


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: int,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load conversation with messages
    conv_result = await db.execute(
        select(ChatConversation)
        .options(selectinload(ChatConversation.messages))
        .where(ChatConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status == ConversationStatus.closed:
        raise HTTPException(status_code=400, detail="Conversation is closed")

    # Check chat_blocked for students
    if current_user.role == UserRole.student:
        sub_blocked_check = await db.execute(
            select(Submission).where(Submission.id == conv.submission_id)
        )
        sub_blocked = sub_blocked_check.scalar_one()
        if sub_blocked.chat_blocked:
            raise HTTPException(status_code=403, detail="Chat blocked")

    # Determine role
    if current_user.role in (UserRole.teacher, UserRole.admin):
        msg_role = MessageRole.teacher
    else:
        msg_role = MessageRole.user

    # Save user/teacher message
    version_id = None
    if body.code is not None:
        sub_for_version = await db.execute(
            select(Submission).where(Submission.id == conv.submission_id)
        )
        sub_obj = sub_for_version.scalar_one()
        version = await save_code_version(db, sub_obj.id, body.code)
        version_id = version.id

    user_msg = ChatMessage(
        conversation_id=conversation_id,
        role=msg_role,
        content=body.content,
        version_id=version_id,
    )
    db.add(user_msg)
    await db.flush()

    # Only call the LLM when the message explicitly mentions /bot.
    should_invoke_llm = (
        bool(BOT_MENTION_RE.search(body.content or ""))
        if msg_role == MessageRole.teacher
        else True
    )
    if not should_invoke_llm:
        await db.refresh(user_msg)
        return user_msg

    # Build history for LLM
    system_prompt = ""
    history = []
    for msg in conv.messages:
        if msg.role == MessageRole.system:
            system_prompt = msg.content
            continue
        gemini_role = ROLE_MAP.get(msg.role, "user")
        content = msg.content
        if msg.role == MessageRole.teacher:
            content = f"[PROFESSOR: {content}]"
        # Get code from version (preferred) or fallback to code_snapshot
        msg_code = None
        if msg.version:
            msg_code = msg.version.code
        elif msg.code_snapshot:
            msg_code = msg.code_snapshot
        if msg_code:
            content = f"Codi de l'alumne:\n```python\n{msg_code}\n```\n\n{content}"
        history.append({"role": gemini_role, "content": content})

    # New message for LLM
    is_teacher_directive = msg_role == MessageRole.teacher
    new_content = (
        BOT_MENTION_RE.sub(" ", body.content or "").strip() or body.content
        if is_teacher_directive
        else body.content
    )

    llm_system_prompt = (
        f"{system_prompt}\n\n{TEACHER_DIRECTIVE_PROMPT}"
        if is_teacher_directive
        else system_prompt
    )

    # Call LLM
    try:
        llm_response = await llm_service.chat(
            system_prompt=llm_system_prompt,
            history=history,
            user_message=new_content,
            code_snapshot=body.code,
            execution_info=_format_execution_info(body.execution),
        )
    except Exception as e:
        llm_response = f"Error connectant amb la IA: {str(e)}"

    display_response = llm_service.strip_result_markers(llm_response)
    raw_result = llm_service.parse_result(llm_response)
    result = _enforce_execution_guard(raw_result, body.execution)
    if raw_result == "correct" and result != "correct":
        display_response = f"{display_response}\n\n{_get_resolution_block_note(current_user.language, body.execution)}"

    # Save assistant response
    assistant_msg = ChatMessage(
        conversation_id=conversation_id,
        role=MessageRole.assistant,
        content=display_response,
        verdict=MessageVerdict(result) if result else None,
    )
    db.add(assistant_msg)

    # Update submission status
    sub_result = await db.execute(
        select(Submission).where(Submission.id == conv.submission_id)
    )
    submission = sub_result.scalar_one()
    if result == "correct":
        submission.status = SubmissionStatus.correct
    elif result == "incorrect" and submission.status not in (
        SubmissionStatus.teacher_correct, SubmissionStatus.teacher_incorrect
    ):
        submission.status = SubmissionStatus.incorrect

    # Detect chat ended by bot
    if llm_service.has_chat_ended(llm_response):
        submission.chat_blocked = True

    await db.flush()
    await db.refresh(assistant_msg)
    return assistant_msg


@router.post("/conversations/{conversation_id}/close")
async def close_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.status = ConversationStatus.closed
    await db.flush()
    return {"detail": "Conversation closed"}


@router.post("/conversations/{conversation_id}/reopen")
async def reopen_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.status = ConversationStatus.reopened
    await db.flush()
    return {"detail": "Conversation reopened"}


@router.post("/submissions/{submission_id}/unblock-chat")
async def unblock_chat(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.chat_blocked = False
    await db.flush()
    return {"detail": "Chat unblocked"}
