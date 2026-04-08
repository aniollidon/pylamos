"""Static code analysis: uses compile() (no execution) + friendly-traceback
to produce human-friendly error explanations for student code."""

import asyncio
import io
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models.user import User
from app.utils.security import get_current_user

router = APIRouter(prefix="/api", tags=["code"])


class DiagnoseRequest(BaseModel):
    code: str


class DiagnoseResult(BaseModel):
    has_error: bool
    error_type: str | None = None
    line: int | None = None
    col: int | None = None
    message: str | None = None
    friendly: str | None = None


def _extract_friendly_part(full_output: str) -> str:
    """Keeps only the educational explanation from friendly-traceback output.

    friendly-traceback emits a standard Python traceback header followed by
    the plain-English explanation separated by a blank line.  We drop:
      - frames that reference the internal '<string>' module (our runner)
      - pure Python SyntaxError header lines
    and keep everything after the last SyntaxError/IndentationError line.
    """
    lines = full_output.split("\n")
    last_error_line = -1
    for i, line in enumerate(lines):
        if re.match(r"^\s*(Syntax|Indentation|Tab)Error:", line):
            last_error_line = i

    if last_error_line == -1:
        return full_output.strip()

    educational = "\n".join(lines[last_error_line + 1:]).strip()
    return educational if educational else full_output.strip()


def _run_diagnose(code: str) -> DiagnoseResult:
    """Run in a thread executor to avoid blocking the async loop."""
    try:
        compile(code, "codi_usuari.py", "exec")
        return DiagnoseResult(has_error=False)

    except SyntaxError as e:
        friendly_text: str | None = None
        try:
            import friendly_traceback as ft  # lazy import — only on error path

            ft.set_lang("en")

            # Register the source so friendly-traceback can annotate with the
            # actual line of code.
            try:
                ft.source_cache.add("codi_usuari.py", code)
            except Exception:
                pass

            buf = io.StringIO()
            ft.set_stream(buf.write)
            ft.explain_traceback()
            raw = buf.getvalue()
            ft.set_stream("stderr")  # restore default

            if raw.strip():
                friendly_text = _extract_friendly_part(raw)
        except Exception:
            pass  # friendly-traceback is best-effort; fall back to plain message

        return DiagnoseResult(
            has_error=True,
            error_type="SyntaxError",
            line=e.lineno,
            col=e.offset,
            message=e.msg if hasattr(e, "msg") else str(e),
            friendly=friendly_text or None,
        )

    except IndentationError as e:
        return DiagnoseResult(
            has_error=True,
            error_type="IndentationError",
            line=e.lineno,
            col=e.offset,
            message=e.msg if hasattr(e, "msg") else str(e),
        )

    except Exception as e:
        return DiagnoseResult(
            has_error=True,
            error_type=type(e).__name__,
            message=str(e),
        )


@router.post("/code/diagnose", response_model=DiagnoseResult)
async def diagnose_code(
    body: DiagnoseRequest,
    _: User = Depends(get_current_user),
) -> DiagnoseResult:
    """Analyse student code statically (no execution) and return a
    human-friendly explanation of any syntax/indentation error found."""
    return await asyncio.to_thread(_run_diagnose, body.code)
