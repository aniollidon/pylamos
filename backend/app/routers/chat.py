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
    MessageCreate, MessageOut,
)
from app.services.llm_service import llm_service, ROLE_MAP
from app.utils.prompt_builder import build_system_prompt
from app.utils.security import get_current_user, require_role

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

    # Save user message with code
    initial_text = "Avalua el meu codi" if mode == "evaluate" else "Necessito ajuda"
    user_msg = ChatMessage(
        conversation_id=conv.id,
        role=MessageRole.user,
        content=initial_text,
        code_snapshot=body.code,
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
        )
    except Exception as e:
        llm_response = f"Error connectant amb la IA: {str(e)}"

    display_response = llm_service.strip_result_markers(llm_response)
    result = llm_service.parse_result(llm_response)

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

    await db.flush()

    # Return conversation with messages
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

    # Determine role
    if current_user.role in (UserRole.teacher, UserRole.admin):
        msg_role = MessageRole.teacher
    else:
        msg_role = MessageRole.user

    # Save user/teacher message
    user_msg = ChatMessage(
        conversation_id=conversation_id,
        role=msg_role,
        content=body.content,
        code_snapshot=body.code,
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
        if msg.code_snapshot:
            content = f"Codi de l'alumne:\n```python\n{msg.code_snapshot}\n```\n\n{content}"
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
        )
    except Exception as e:
        llm_response = f"Error connectant amb la IA: {str(e)}"

    display_response = llm_service.strip_result_markers(llm_response)
    result = llm_service.parse_result(llm_response)

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
