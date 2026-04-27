"""Helpers for persistent teacher policy and /bot teacher directives."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.models.chat import MessageRole

BOT_MENTION_RE = re.compile(r"(^|\s)/bot\b", re.IGNORECASE)

TeacherResponseLanguage = Literal["inherit", "ca", "es", "en"]
TeacherHelpStyle = Literal["inherit", "socratic", "guided", "direct"]
TeacherSolutionPolicy = Literal["inherit", "hidden", "partial", "full"]
TeacherAlignment = Literal["inherit", "default", "prefer_teacher", "defend_teacher"]
TeacherOrthographyStrictness = Literal[
    "inherit", "off", "light", "normal", "strict", "very_strict"
]
TeacherInteractionFirmness = Literal["inherit", "normal", "firm", "very_firm"]
TeacherRespectEnforcement = Literal["inherit", "normal", "strict", "zero_tolerance"]
TeacherParticipationEnforcement = Literal["inherit", "normal", "strict"]
TeacherPolicyField = Literal[
    "response_language",
    "help_style",
    "solution_policy",
    "teacher_alignment",
    "orthography_strictness",
    "orthography_affects_verdict",
    "interaction_firmness",
    "respect_enforcement",
    "participation_enforcement",
    "warning_budget",
]


class TeacherPolicyState(BaseModel):
    response_language: TeacherResponseLanguage = "inherit"
    help_style: TeacherHelpStyle = "inherit"
    solution_policy: TeacherSolutionPolicy = "inherit"
    teacher_alignment: TeacherAlignment = "inherit"
    orthography_strictness: TeacherOrthographyStrictness = "inherit"
    orthography_affects_verdict: bool | None = None
    interaction_firmness: TeacherInteractionFirmness = "inherit"
    respect_enforcement: TeacherRespectEnforcement = "inherit"
    participation_enforcement: TeacherParticipationEnforcement = "inherit"
    warning_budget: int | None = None

    @field_validator("warning_budget")
    @classmethod
    def _validate_warning_budget(cls, value: int | None) -> int | None:
        if value is None:
            return value
        if 0 <= value <= 5:
            return value
        raise ValueError("warning_budget must be between 0 and 5")

    def active_overrides(self) -> dict[str, object]:
        overrides: dict[str, object] = {}
        for field_name, value in self.model_dump().items():
            if value not in (None, "inherit"):
                overrides[field_name] = value
        return overrides

    def is_default(self) -> bool:
        return not self.active_overrides()

    def reset_field(self, field_name: TeacherPolicyField) -> None:
        default_state = TeacherPolicyState()
        setattr(self, field_name, getattr(default_state, field_name))


class TeacherPolicyPatch(BaseModel):
    response_language: TeacherResponseLanguage | None = None
    help_style: TeacherHelpStyle | None = None
    solution_policy: TeacherSolutionPolicy | None = None
    teacher_alignment: TeacherAlignment | None = None
    orthography_strictness: TeacherOrthographyStrictness | None = None
    orthography_affects_verdict: bool | None = None
    interaction_firmness: TeacherInteractionFirmness | None = None
    respect_enforcement: TeacherRespectEnforcement | None = None
    participation_enforcement: TeacherParticipationEnforcement | None = None
    warning_budget: int | None = None

    @field_validator("warning_budget")
    @classmethod
    def _validate_warning_budget(cls, value: int | None) -> int | None:
        if value is None:
            return value
        if 0 <= value <= 5:
            return value
        raise ValueError("warning_budget must be between 0 and 5")


class TeacherCommandInterpretation(BaseModel):
    one_shot_instruction: str | None = None
    policy_patch: TeacherPolicyPatch = Field(default_factory=TeacherPolicyPatch)
    reset_fields: list[TeacherPolicyField] = Field(default_factory=list)
    reset_all: bool = False

    @field_validator("one_shot_instruction")
    @classmethod
    def _normalize_one_shot_instruction(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    def has_policy_changes(self) -> bool:
        return self.reset_all or bool(self.reset_fields) or bool(
            self.policy_patch.model_dump(exclude_none=True)
        )

    def has_effect(self) -> bool:
        return self.one_shot_instruction is not None or self.has_policy_changes()


def extract_teacher_command_text(content: str | None) -> str:
    normalized = BOT_MENTION_RE.sub(" ", content or "")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized or (content or "").strip()


def is_teacher_command(content: str | None) -> bool:
    return bool(BOT_MENTION_RE.search(content or ""))


def load_teacher_policy_state(raw_state: str | None) -> TeacherPolicyState:
    if not raw_state:
        return TeacherPolicyState()
    try:
        return TeacherPolicyState.model_validate_json(raw_state)
    except ValidationError:
        return TeacherPolicyState()


def dump_teacher_policy_state(state: TeacherPolicyState) -> str | None:
    return None if state.is_default() else state.model_dump_json()


def load_teacher_command_interpretation(
    raw_interpretation: str | None,
) -> TeacherCommandInterpretation | None:
    if not raw_interpretation:
        return None
    try:
        return TeacherCommandInterpretation.model_validate_json(raw_interpretation)
    except ValidationError:
        return None


def dump_teacher_command_interpretation(
    interpretation: TeacherCommandInterpretation,
) -> str | None:
    return interpretation.model_dump_json() if interpretation.has_effect() else None


def apply_teacher_command_interpretation(
    current_state: TeacherPolicyState,
    interpretation: TeacherCommandInterpretation,
) -> TeacherPolicyState:
    next_state = current_state.model_copy(deep=True)

    if interpretation.reset_all:
        next_state = TeacherPolicyState()
    else:
        for field_name in interpretation.reset_fields:
            next_state.reset_field(field_name)

    for field_name, value in interpretation.policy_patch.model_dump(exclude_none=True).items():
        setattr(next_state, field_name, value)

    return next_state


def should_include_message_in_llm_history(
    role: MessageRole,
    content: str,
    teacher_command_meta: str | None,
) -> bool:
    if role != MessageRole.teacher:
        return True
    if load_teacher_command_interpretation(teacher_command_meta):
        return False
    return not is_teacher_command(content)


def build_teacher_policy_prompt(
    policy_state: TeacherPolicyState,
    one_shot_instruction: str | None = None,
) -> str:
    persistent_lines = _build_persistent_policy_lines(policy_state)
    one_shot_instruction = (one_shot_instruction or "").strip() or None

    if not persistent_lines and not one_shot_instruction:
        return ""

    lines = [
        "[AUTORITAT_DEL_PROFESSOR]",
        "La política activa i les ordres del professor són autoritatives per a aquesta conversa concreta.",
        "Si entren en conflicte amb les instruccions pedagògiques per defecte, segueix sempre la voluntat del professor.",
        "Les polítiques persistents continuen vigents fins que el professor les canviï o les reiniciï.",
    ]

    if persistent_lines:
        lines.append("")
        lines.append("[POLITICA_PERSISTENT_DEL_PROFESSOR]")
        lines.extend(f"- {line}" for line in persistent_lines)

    if one_shot_instruction:
        lines.append("")
        lines.append("[ORDRE_PUNTUAL_DEL_PROFESSOR]")
        lines.append("- Aquesta ordre només afecta la resposta actual.")
        lines.append(
            "- Compleix-la encara que contradigui la missió pedagògica per defecte."
        )
        lines.append(f"- Ordre: {one_shot_instruction}")

    return "\n".join(lines)


def _build_persistent_policy_lines(policy_state: TeacherPolicyState) -> list[str]:
    overrides = policy_state.active_overrides()
    lines: list[str] = []

    if language := overrides.get("response_language"):
        lines.append(f"Respon en {_language_label(language)} fins a nou avís del professor.")

    if help_style := overrides.get("help_style"):
        lines.append(_help_style_line(help_style))

    if solution_policy := overrides.get("solution_policy"):
        lines.append(_solution_policy_line(solution_policy))

    if teacher_alignment := overrides.get("teacher_alignment"):
        lines.append(_teacher_alignment_line(teacher_alignment))

    if orthography_strictness := overrides.get("orthography_strictness"):
        lines.append(_orthography_strictness_line(orthography_strictness))

    if "orthography_affects_verdict" in overrides:
        affects_verdict = bool(overrides["orthography_affects_verdict"])
        if affects_verdict:
            lines.append(
                "Les faltes d'ortografia poden afectar el veredicte final si el professor ho considera oportú."
            )
        else:
            lines.append(
                "Les faltes d'ortografia només s'han de comentar, però no han de canviar per si soles el veredicte funcional."
            )

    if interaction_firmness := overrides.get("interaction_firmness"):
        lines.append(_interaction_firmness_line(interaction_firmness))

    if respect_enforcement := overrides.get("respect_enforcement"):
        lines.append(_respect_enforcement_line(respect_enforcement))

    if participation_enforcement := overrides.get("participation_enforcement"):
        lines.append(_participation_enforcement_line(participation_enforcement))

    if warning_budget := overrides.get("warning_budget"):
        lines.append(_warning_budget_line(int(warning_budget)))

    return lines


def _language_label(language: object) -> str:
    labels = {"ca": "català", "es": "castellà", "en": "anglès"}
    return labels.get(str(language), str(language))


def _help_style_line(help_style: object) -> str:
    mapping = {
        "socratic": "Mantén un estil socràtic i fes avançar l'alumne a base de preguntes i pistes.",
        "guided": "Mantén un estil guiat: dona passos clars, però sense resoldre-ho tot si el professor no ho ha demanat.",
        "direct": "Sigues directe i operatiu: pots donar instruccions concretes i menys socràtiques.",
    }
    return mapping.get(str(help_style), f"Aplica el help_style {help_style} indicat pel professor.")


def _solution_policy_line(solution_policy: object) -> str:
    mapping = {
        "hidden": "Per defecte continua sense mostrar la solució completa, tret que el professor doni una ordre puntual més permissiva.",
        "partial": "Pots mostrar fragments útils o parcials de solució si això ajuda a complir el criteri del professor.",
        "full": "Tens permís per mostrar la solució completa si això encaixa amb la voluntat del professor en aquesta conversa.",
    }
    return mapping.get(
        str(solution_policy),
        f"Aplica la solution_policy {solution_policy} indicada pel professor.",
    )


def _teacher_alignment_line(teacher_alignment: object) -> str:
    mapping = {
        "default": "Tingues molt en compte el criteri del professor quan intervingui.",
        "prefer_teacher": "Si hi ha ambigüitat o conflicte d'interpretació, dona prioritat al criteri del professor.",
        "defend_teacher": "Si l'alumne qüestiona el criteri del professor, defensa explícitament la posició del professor en aquesta conversa.",
    }
    return mapping.get(
        str(teacher_alignment),
        f"Aplica el teacher_alignment {teacher_alignment} indicat pel professor.",
    )


def _orthography_strictness_line(strictness: object) -> str:
    mapping = {
        "off": "No insisteixis en ortografia si no és rellevant.",
        "light": "Comenta només les faltes d'ortografia més evidents.",
        "normal": "Revisa l'ortografia amb el nivell habitual del tutor.",
        "strict": "Sigues estricte amb les faltes d'ortografia i corregeix-les de manera clara.",
        "very_strict": "Sigues molt estricte amb les faltes d'ortografia i no en deixis passar gairebé cap.",
    }
    return mapping.get(str(strictness), f"Aplica el nivell d'ortografia {strictness}.")


def _interaction_firmness_line(firmness: object) -> str:
    mapping = {
        "normal": "Mantén un to normal i pedagògic.",
        "firm": "Mantén un to ferm i directe quan l'alumne es desviï o no col·labori.",
        "very_firm": "Mantén un to molt ferm i marca límits clars a la conversa.",
    }
    return mapping.get(str(firmness), f"Aplica el nivell de fermesa {firmness}.")


def _respect_enforcement_line(enforcement: object) -> str:
    mapping = {
        "normal": "Gestiona la falta de respecte amb el comportament habitual del tutor.",
        "strict": "No permetis faltes de respecte: talla-les ràpidament i redirigeix l'alumne.",
        "zero_tolerance": "Tolerància zero a la falta de respecte: si apareix, actua immediatament i considera finalitzar la conversa.",
    }
    return mapping.get(
        str(enforcement),
        f"Aplica el nivell de control de respecte {enforcement}.",
    )


def _participation_enforcement_line(enforcement: object) -> str:
    mapping = {
        "normal": "Mantén el nivell habitual d'exigència sobre la participació de l'alumne.",
        "strict": "Exigeix participació activa: no acceptis evasives ni que l'alumne delegui tota la feina.",
    }
    return mapping.get(
        str(enforcement),
        f"Aplica el nivell de participació {enforcement} indicat pel professor.",
    )


def _warning_budget_line(warning_budget: int) -> str:
    if warning_budget == 0:
        return "No donis avisos previs: si hi ha manca de respecte o no col·laboració, actua immediatament."
    if warning_budget == 1:
        return "Dona com a màxim un avís abans d'escalar o finalitzar la conversa."
    return f"Dona com a màxim {warning_budget} avisos abans d'escalar o finalitzar la conversa."