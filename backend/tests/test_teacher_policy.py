from app.models.chat import MessageRole
from app.utils.teacher_policy import (
    TeacherCommandInterpretation,
    TeacherPolicyPatch,
    TeacherPolicyState,
    apply_teacher_command_interpretation,
    build_teacher_policy_prompt,
    dump_teacher_command_interpretation,
    dump_teacher_policy_state,
    extract_teacher_command_text,
    load_teacher_policy_state,
    should_include_message_in_llm_history,
)


def test_apply_teacher_command_interpretation_merges_patch_and_resets_fields():
    current_state = TeacherPolicyState(
        response_language="es",
        solution_policy="full",
        warning_budget=2,
    )
    interpretation = TeacherCommandInterpretation(
        one_shot_instruction="explica com es fa una potència",
        policy_patch=TeacherPolicyPatch(
            help_style="direct",
            respect_enforcement="strict",
        ),
        reset_fields=["warning_budget"],
    )

    updated_state = apply_teacher_command_interpretation(current_state, interpretation)

    assert updated_state.response_language == "es"
    assert updated_state.solution_policy == "full"
    assert updated_state.help_style == "direct"
    assert updated_state.respect_enforcement == "strict"
    assert updated_state.warning_budget is None


def test_dump_and_load_teacher_policy_state_roundtrip():
    state = TeacherPolicyState(
        response_language="ca",
        orthography_strictness="very_strict",
        orthography_affects_verdict=True,
    )

    serialized = dump_teacher_policy_state(state)
    restored = load_teacher_policy_state(serialized)

    assert serialized is not None
    assert restored == state
    assert dump_teacher_policy_state(TeacherPolicyState()) is None


def test_build_teacher_policy_prompt_includes_persistent_and_one_shot_rules():
    prompt = build_teacher_policy_prompt(
        TeacherPolicyState(
            response_language="es",
            interaction_firmness="firm",
            participation_enforcement="strict",
        ),
        one_shot_instruction="mostra la solució",
    )

    assert "[POLITICA_PERSISTENT_DEL_PROFESSOR]" in prompt
    assert "castellà" in prompt
    assert "to ferm" in prompt
    assert "participació activa" in prompt
    assert "[ORDRE_PUNTUAL_DEL_PROFESSOR]" in prompt
    assert "mostra la solució" in prompt


def test_teacher_bot_messages_are_excluded_from_llm_history():
    meta = dump_teacher_command_interpretation(
        TeacherCommandInterpretation(one_shot_instruction="mostra la solució")
    )

    assert not should_include_message_in_llm_history(
        MessageRole.teacher,
        "/bot mostra la solució",
        meta,
    )
    assert not should_include_message_in_llm_history(
        MessageRole.teacher,
        "/bot explica això",
        None,
    )
    assert should_include_message_in_llm_history(
        MessageRole.teacher,
        "Revisa la sortida d'aquest codi",
        None,
    )
    assert should_include_message_in_llm_history(
        MessageRole.user,
        "necessito ajuda",
        None,
    )


def test_extract_teacher_command_text_removes_bot_marker():
    assert extract_teacher_command_text("/bot contesta en castellà") == "contesta en castellà"
    assert extract_teacher_command_text("Professor: /bot mostra la solució") == (
        "Professor: mostra la solució"
    )