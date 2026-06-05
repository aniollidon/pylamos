import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor, { type OnMount } from '@monaco-editor/react';
import ActionMenu from '../components/ActionMenu';
import MdRenderer from '../components/MdRenderer';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  useBrython,
  type ConsoleEntry,
  type DebugCommand,
  type DebugFrame,
  type DebugRunResult,
  type DebugSnapshot,
  type RunResult,
} from '../hooks/useBrython';
import type { Exercise, Submission, Conversation, ChatMessage, CodeExecutionInfo } from '../types';
import './Workspace.css';

const DEFAULT_CODE = '# Escriu el teu codi aquí\n';
const INTERNAL_CLIPBOARD_REGEX = /   $/;
const FRAUD_PASTE_BLOCKED_MESSAGE = "s'ha bloquejat un possible intent de frau.";

type ExecutionMode = 'run' | 'debug' | null;

type DebugSessionState = {
  status: 'idle' | 'running' | 'paused' | 'stdin_needed' | 'finished' | 'error';
  seed: number | null;
  code: string;
  breakpoints: number[];
  history: DebugCommand[];
  snapshot: DebugSnapshot | null;
  errorMessage: string | null;
};

type MonacoEditorLike = Parameters<OnMount>[0];
type MonacoNamespaceLike = Parameters<OnMount>[1];
type MonacoMouseEventLike = Parameters<Parameters<MonacoEditorLike['onMouseDown']>[0]>[0];
type MonacoDisposableLike = { dispose: () => void };
type MonacoHoverProviderLike = Parameters<MonacoNamespaceLike['languages']['registerHoverProvider']>[1];
type MonacoHoverModelLike = Parameters<NonNullable<MonacoHoverProviderLike['provideHover']>>[0];
type MonacoHoverPositionLike = Parameters<NonNullable<MonacoHoverProviderLike['provideHover']>>[1];

function createInitialDebugSession(code: string): DebugSessionState {
  return {
    status: 'idle',
    seed: null,
    code,
    breakpoints: [],
    history: [],
    snapshot: null,
    errorMessage: null,
  };
}

export default function Workspace() {
  const MARKER_CORRECT = '[EXERCICI_CORRECTE]';
  const MARKER_INCORRECT = '[EXERCICI_INCORRECTE]';
  const MARKER_CHAT_ENDED = '[XAT_FINALITZAT]';

  const stripResultMarkers = (text: string) => text
    .split(MARKER_CORRECT).join('')
    .split(MARKER_INCORRECT).join('')
    .split(MARKER_CHAT_ENDED).join('')
    .replace(/\[\s*PROFESSOR\s*:\s*[^\]]*\]/gim, '')
    .replace(/\[\s*PROFESSOR\s*\]\s*:\s*/gim, '')
    .replace(/\[\s*PROFESSOR\s*:\s*\]\s*/gim, '')
    .trim();

  const getMessageVerdict = (msg: ChatMessage): 'correct' | 'incorrect' | null => {
    if (msg.verdict) return msg.verdict;
    if (msg.content.includes(MARKER_CORRECT)) return 'correct';
    if (msg.content.includes(MARKER_INCORRECT)) return 'incorrect';
    return null;
  };

  const { exerciseId } = useParams<{ exerciseId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextExerciseId, setNextExerciseId] = useState<number | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [consoleOutput, setConsoleOutput] = useState<ConsoleEntry[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [collectedInputs, setCollectedInputs] = useState<string[]>([]);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeExecutionMode, setActiveExecutionMode] = useState<ExecutionMode>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [isComposingNewConversation, setIsComposingNewConversation] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [debugSession, setDebugSession] = useState<DebugSessionState>(() => createInitialDebugSession(DEFAULT_CODE));
  const [selectedDebugFrameId, setSelectedDebugFrameId] = useState<string | null>(null);
  const pendingNavigationRef = useRef<string | null>(null);

  const { run: runBrython, debugReplay } = useBrython();

  const savedCodeRef = useRef<string>('');
  const isDirty = useRef(false);

  const runningCodeRef = useRef<string>('');
  const runningFilenameRef = useRef<string>('exercici.py');
  const runSeedRef = useRef<number>(0);
  const latestExecutionInfoRef = useRef<CodeExecutionInfo | null>(null);
  const latestExecutionCodeRef = useRef<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const consolePanelRef = useRef<HTMLDivElement>(null);
  const consoleOutputRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const workspaceLeftRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorLike | null>(null);
  const monacoRef = useRef<MonacoNamespaceLike | null>(null);
  const debugHoverProviderRef = useRef<MonacoDisposableLike | null>(null);
  const monacoPasteListenerRef = useRef<MonacoDisposableLike | null>(null);
  const breakpointDecorationIdsRef = useRef<string[]>([]);
  const currentLineDecorationIdsRef = useRef<string[]>([]);
  const debugStatusRef = useRef<DebugSessionState['status']>('idle');
  const currentDebugFrameRef = useRef<DebugFrame | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const confettiTimer = useRef<ReturnType<typeof setTimeout>>();
  const successBannerTimer = useRef<ReturnType<typeof setTimeout>>();

  const currentDebugFrame: DebugFrame | null = debugSession.snapshot?.frames.find((frame) => frame.id === selectedDebugFrameId)
    ?? debugSession.snapshot?.frames[0]
    ?? null;
  const isDebugSessionVisible = debugSession.status !== 'idle';
  const showDebugPanel = debugSession.status !== 'idle';
  const canAdvanceDebug = debugSession.status === 'paused';
  const showExecutionStop = isRunning || isDebugSessionVisible;
  const executionStopLabel = debugSession.status === 'finished' ? t('hide') : t('stop');
  const debugMenuIcon = (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A5 5 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 1 1 .957.29l-.41 1.352A5 5 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3c0-1.364.547-2.601 1.432-3.503l-.41-1.352a.5.5 0 0 1 .333-.623M4 7v4a4 4 0 0 0 3.5 3.97V7zm4.5 0v7.97A4 4 0 0 0 12 11V7zM12 6a4 4 0 0 0-1.334-2.982A3.98 3.98 0 0 0 8 2a3.98 3.98 0 0 0-2.667 1.018A4 4 0 0 0 4 6z"
      />
    </svg>
  );
  const executionModeMenuItems = [
    {
      label: debugSession.status === 'idle' ? t('start_debug') : t('restart_debug'),
      icon: debugMenuIcon,
      onClick: () => void handleStartDebug(),
    },
  ];
  const debugStepMenuItems = [
    { label: t('continue'), onClick: () => queueDebugCommand('continue') },
    { label: t('step_into'), onClick: () => queueDebugCommand('step_into') },
    { label: t('step_over'), onClick: () => queueDebugCommand('step_over') },
    { label: t('step_out'), onClick: () => queueDebugCommand('step_out') },
  ];

  const suggestionPrompts = [
    { type: 'help' as const, text: t('suggest_help') },
    { type: 'evaluate' as const, text: t('suggest_reevaluate') },
  ];

  const triggerCelebration = useCallback(() => {
    if (confettiTimer.current) clearTimeout(confettiTimer.current);
    if (successBannerTimer.current) clearTimeout(successBannerTimer.current);
    setShowConfetti(true);
    setShowSuccessBanner(true);
    confettiTimer.current = setTimeout(() => setShowConfetti(false), 2200);
    successBannerTimer.current = setTimeout(() => setShowSuccessBanner(false), 2600);
  }, []);

  const applyResult = useCallback((header: ConsoleEntry, result: RunResult) => {
    setConsoleOutput([header, ...result.entries]);
    if (result.status === 'stdin_needed') {
      setIsWaitingForInput(true);
      setIsRunning(true);
      setActiveExecutionMode('run');
    } else {
      setIsWaitingForInput(false);
      setIsRunning(false);
      setActiveExecutionMode(null);
    }
  }, []);

  const applyDebugResult = useCallback(
    (
      headerText: string,
      result: DebugRunResult,
      nextCode: string,
      nextSeed: number,
      nextHistory: DebugCommand[]
    ) => {
      setConsoleOutput([{ type: 'info', text: headerText }, ...result.entries]);

      if (result.status === 'stdin_needed') {
        setIsWaitingForInput(true);
        setIsRunning(true);
        setActiveExecutionMode('debug');
        setDebugSession((prev) => ({
          ...prev,
          status: 'stdin_needed',
          seed: nextSeed,
          code: nextCode,
          history: nextHistory,
          snapshot: result.snapshot ?? prev.snapshot,
          errorMessage: null,
        }));
        return;
      }

      setIsWaitingForInput(false);
      setIsRunning(false);
      setActiveExecutionMode(null);
      setDebugSession((prev) => ({
        ...prev,
        status: result.status === 'paused' ? 'paused' : result.status === 'finished' ? 'finished' : 'error',
        seed: nextSeed,
        code: nextCode,
        history: nextHistory,
        snapshot: result.snapshot ?? null,
        errorMessage: result.status === 'error'
          ? result.entries.find((entry) => entry.type === 'error')?.text.trim() ?? null
          : null,
      }));
    },
    []
  );

  function extractErrorLine(text: string) {
    const match = text.match(/línia\s+(\d+)/i);
    return match ? Number(match[1]) : undefined;
  }

  function extractErrorHeadline(text: string) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines.find((line) => !/^Error de\s+/i.test(line));
  }

  function extractErrorType(text?: string) {
    if (!text) return undefined;
    const match = text.match(/\b([A-Za-z]+Error)\b/);
    return match?.[1];
  }

  function getDebugStatusLabel(status: DebugSessionState['status']) {
    switch (status) {
      case 'running':
        return t('loading');
      case 'paused':
        return t('paused');
      case 'stdin_needed':
        return t('waiting_input');
      case 'finished':
        return t('finished');
      case 'error':
        return t('debug_error');
      default:
        return t('debug_ready');
    }
  }

  const buildExecutionInfoFromResult = useCallback((result: RunResult): CodeExecutionInfo => {
    if (result.status === 'stdin_needed') {
      return {
        status: 'stdin_needed',
        compiled: true,
        executed: false,
        can_mark_resolved: false,
      };
    }

    const errorEntry = result.entries.find((entry) => entry.type === 'error');
    if (!errorEntry) {
      return {
        status: 'ok',
        compiled: true,
        executed: true,
        can_mark_resolved: true,
      };
    }

    const line = errorEntry.line ?? extractErrorLine(errorEntry.text);
    const errorMessage = extractErrorHeadline(errorEntry.text);
    const errorType = extractErrorType(errorEntry.details ?? errorEntry.text);
    const isCompileError = errorEntry.phase === 'compile';

    return {
      status: isCompileError ? 'compile_error' : 'runtime_error',
      compiled: !isCompileError,
      executed: !isCompileError,
      can_mark_resolved: false,
      line,
      error_type: errorType,
      error_message: errorMessage,
    };
  }, []);

  async function diagnoseExecutionInfo(currentCode: string): Promise<CodeExecutionInfo> {
    type DiagnoseResult = {
      has_error: boolean;
      error_type: string | null;
      line: number | null;
      message: string | null;
    };

    const res = await api.post<DiagnoseResult>('/api/code/diagnose', { code: currentCode });
    if (res.data.has_error) {
      return {
        status: 'compile_error',
        compiled: false,
        executed: false,
        can_mark_resolved: false,
        line: res.data.line ?? undefined,
        error_type: res.data.error_type ?? undefined,
        error_message: res.data.message ?? undefined,
      };
    }

    return {
      status: 'compile_ok',
      compiled: true,
      executed: false,
      can_mark_resolved: false,
    };
  }

  const toggleBreakpoint = useCallback((lineNumber: number) => {
    setDebugSession((prev) => {
      const alreadySet = prev.breakpoints.includes(lineNumber);
      const breakpoints = alreadySet
        ? prev.breakpoints.filter((line) => line !== lineNumber)
        : [...prev.breakpoints, lineNumber].sort((left, right) => left - right);
      return {
        ...prev,
        breakpoints,
      };
    });
  }, []);

  const handleEditorMount = useCallback((editorInstance: MonacoEditorLike, monacoInstance: MonacoNamespaceLike) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
    debugHoverProviderRef.current?.dispose();
    debugHoverProviderRef.current = monacoInstance.languages.registerHoverProvider('python', {
      provideHover(model: MonacoHoverModelLike, position: MonacoHoverPositionLike) {
        if (debugStatusRef.current !== 'paused') return null;

        const currentFrame = currentDebugFrameRef.current;
        if (!currentFrame) return null;

        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const variable = currentFrame.locals.find((item) => item.name === word.word);
        if (!variable) return null;

        const escapedName = variable.name.replace(/([*_`\\])/g, '\\$1');
        const escapedType = variable.type.replace(/([*_`\\])/g, '\\$1');
        const escapedValue = variable.value.replace(/([*_`\\])/g, '\\$1');

        return {
          range: new monacoInstance.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [
            { value: `**${escapedName}**` },
            { value: `Type: \`${escapedType}\`` },
            { value: `Value: \`${escapedValue}\`` },
          ],
        };
      },
    });
    monacoPasteListenerRef.current?.dispose();
    monacoPasteListenerRef.current = editorInstance.onDidPaste((pasteEvent) => {
      const model = editorInstance.getModel();
      if (!model) return;

      const pastedText = model.getValueInRange(pasteEvent.range);
      if (INTERNAL_CLIPBOARD_REGEX.test(pastedText)) {
        console.log('[clipboard][monaco] paste accepted', {
          hasMarker: true,
          length: pastedText.length,
          range: pasteEvent.range,
        });
        const sanitizedText = pastedText.replace(INTERNAL_CLIPBOARD_REGEX, '');
        if (sanitizedText !== pastedText) {
          editorInstance.executeEdits('pylamos-internal-clipboard-sanitize', [{
            range: pasteEvent.range,
            text: sanitizedText,
            forceMoveMarkers: true,
          }]);
          editorInstance.pushUndoStop();
        }
        return;
      }

      console.log('[clipboard][monaco] paste blocked', {
        hasMarker: false,
        length: pastedText.length,
        range: pasteEvent.range,
      });
      editorInstance.executeEdits('pylamos-internal-clipboard-block', [{
        range: pasteEvent.range,
        text: '',
        forceMoveMarkers: true,
      }]);
      editorInstance.pushUndoStop();
      window.alert(FRAUD_PASTE_BLOCKED_MESSAGE);
    });

    editorInstance.onMouseDown((event: MonacoMouseEventLike) => {
      const mouseTargetType = monacoInstance.editor.MouseTargetType;
      const lineNumber = event.target.position?.lineNumber;
      if (!lineNumber) return;
      if (
        event.target.type === mouseTargetType.GUTTER_GLYPH_MARGIN
        || event.target.type === mouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        toggleBreakpoint(lineNumber);
      }
    });
  }, [toggleBreakpoint]);

  const isMonacoTarget = useCallback((target: EventTarget | null) => {
    return target instanceof Element && Boolean(target.closest('.monaco-editor'));
  }, []);

  const getSelectedTextFromMonaco = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return '';

    const model = editorInstance.getModel();
    const selection = editorInstance.getSelection();
    if (!model || !selection || selection.isEmpty()) return '';

    return model.getValueInRange(selection);
  }, []);

  const insertTextAtCursor = useCallback((target: EventTarget | null, text: string) => {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(text, start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    return false;
  }, []);

  const executeDebugHistory = useCallback(async (nextHistory: DebugCommand[], nextSeed: number, nextInputs: string[]) => {
    const filename = exercise
      ? exercise.title.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') + '.py'
      : 'exercici.py';
    const isFreshSession = nextHistory.length === 1 || debugSession.code !== code || debugSession.seed == null;
    const latestCommand = nextHistory[nextHistory.length - 1]?.kind;
    const shouldClearSnapshotWhileRunning = latestCommand === 'continue';

    editorAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (submission && isFreshSession) {
      await api.post(`/api/submissions/${submission.id}/save`, { code });
      savedCodeRef.current = code;
      isDirty.current = false;
    }

    runningCodeRef.current = code;
    runningFilenameRef.current = filename;
    runSeedRef.current = nextSeed;
    setCollectedInputs(nextInputs);
    setTerminalInput('');
    setIsWaitingForInput(false);
    setIsRunning(true);
    setActiveExecutionMode('debug');
    setDebugSession((prev) => ({
      ...prev,
      status: 'running',
      seed: nextSeed,
      code,
      history: nextHistory,
      snapshot: shouldClearSnapshotWhileRunning ? null : prev.snapshot,
      errorMessage: null,
    }));

    if (shouldClearSnapshotWhileRunning) {
      setSelectedDebugFrameId(null);
      if (editorRef.current) {
        currentLineDecorationIdsRef.current = editorRef.current.deltaDecorations(
          currentLineDecorationIdsRef.current,
          []
        );
      }
    }

    const result = debugReplay(code, nextInputs, nextSeed, debugSession.breakpoints, nextHistory);
    const headerText = latestCommand
      ? `$ debug ${filename} :: ${latestCommand}\n`
      : `$ debug ${filename}\n`;
    applyDebugResult(headerText, result, code, nextSeed, nextHistory);
  }, [applyDebugResult, code, debugReplay, debugSession.breakpoints, debugSession.code, debugSession.seed, exercise, submission]);

  const handleStartDebug = useCallback(async () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    setSelectedDebugFrameId(null);
    await executeDebugHistory([{ kind: 'start' }], seed, []);
  }, [executeDebugHistory]);

  const queueDebugCommand = useCallback((kind: DebugCommand['kind']) => {
    if (debugSession.seed == null) return;
    const topFrame = debugSession.snapshot?.frames[0] ?? null;
    const nextCommand: DebugCommand = ['step', 'step_into', 'step_over', 'step_out'].includes(kind)
      ? {
          kind,
          originFrameId: topFrame?.id ?? null,
          originLine: debugSession.snapshot?.line ?? null,
        }
      : { kind };
    void executeDebugHistory([...debugSession.history, nextCommand], debugSession.seed, collectedInputs);
  }, [collectedInputs, debugSession.history, debugSession.seed, debugSession.snapshot, executeDebugHistory]);

  async function resolveExecutionInfoForChat(currentCode: string): Promise<CodeExecutionInfo> {
    if (latestExecutionCodeRef.current === currentCode && latestExecutionInfoRef.current) {
      return latestExecutionInfoRef.current;
    }

    const diagnosed = await diagnoseExecutionInfo(currentCode);
    latestExecutionCodeRef.current = currentCode;
    latestExecutionInfoRef.current = diagnosed;
    return diagnosed;
  }

  function getLatestOpenConversation(items: Conversation[]) {
    return [...items].reverse().find((conv) => conv.status !== 'closed') ?? null;
  }

  function getLatestConversationOfType(items: Conversation[], type: 'help' | 'evaluate') {
    return [...items].reverse().find((conv) => conv.type === type && conv.status !== 'closed') ?? null;
  }

  const upsertConversation = useCallback((conv: Conversation) => {
    setConversations((prev) => {
      const next = [...prev.filter((item) => item.id !== conv.id), conv];
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }, []);

  function shouldRenderMessage(msg: ChatMessage) {
    return msg.role !== 'system' && stripResultMarkers(msg.content).length > 0;
  }

  function maybeCelebrateFromConversation(conv: Conversation) {
    const lastAssistant = [...(conv.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (lastAssistant && getMessageVerdict(lastAssistant) === 'correct') {
      triggerCelebration();
    }
  }

  function buildOptimisticUserMessage(conversationId: number, content: string): ChatMessage {
    return {
      id: -Date.now(),
      conversation_id: conversationId,
      role: user?.role === 'teacher' || user?.role === 'admin' ? 'teacher' : 'user',
      content,
      code_snapshot: code,
      created_at: new Date().toISOString(),
    };
  }

  function ensureBotMention(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    return /(^|\s)\/bot\b/i.test(trimmed) ? trimmed : `/bot ${trimmed}`;
  }

  function appendOptimisticUserMessage(conversationId: number, content: string) {
    const optimisticMessage = buildOptimisticUserMessage(conversationId, content);
    setActiveConv((prev) => {
      if (!prev || prev.id !== conversationId) return prev;
      return {
        ...prev,
        messages: [...(prev.messages ?? []), optimisticMessage],
      };
    });
    return optimisticMessage.id;
  }

  function removeMessageFromConversation(conversationId: number, messageId: number) {
    setActiveConv((prev) => {
      if (!prev || prev.id !== conversationId) return prev;
      return {
        ...prev,
        messages: (prev.messages ?? []).filter((message) => message.id !== messageId),
      };
    });
  }

  function mergeConversationWithPendingMessages(serverConversation: Conversation, localConversation?: Conversation | null) {
    const serverMessages = serverConversation.messages ?? [];
    const pendingMessages = (localConversation?.messages ?? []).filter((message) => {
      if (message.id >= 0) return false;

      return !serverMessages.some((serverMessage) => {
        if (serverMessage.role !== message.role || serverMessage.content !== message.content) {
          return false;
        }

        const optimisticTimestamp = new Date(message.created_at).getTime();
        const serverTimestamp = new Date(serverMessage.created_at).getTime();
        return Math.abs(serverTimestamp - optimisticTimestamp) < 30000;
      });
    });

    if (pendingMessages.length === 0) {
      return serverConversation;
    }

    return {
      ...serverConversation,
      messages: [...serverMessages, ...pendingMessages].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      ),
    };
  }

  async function refreshSubmissionStatus() {
    if (!submission) return;
    const subRes = await api.get<Submission>(`/api/submissions/${submission.id}`);
    setSubmission(subRes.data);
  }

  const loadConversation = useCallback(async (conv: Conversation) => {
    const res = await api.get<Conversation>(`/api/conversations/${conv.id}`);
    setActiveConv((prev) => mergeConversationWithPendingMessages(res.data, prev));
    setChatOpen(true);
    setIsComposingNewConversation(false);
    const mergedConversation = mergeConversationWithPendingMessages(res.data, activeConv?.id === res.data.id ? activeConv : null);
    upsertConversation(mergedConversation);
    return mergedConversation;
  }, [activeConv, upsertConversation]);

  const handleSave = async () => {
    if (!submission) return;
    setSaving(true);
    await api.post(`/api/submissions/${submission.id}/save`, { code });
    savedCodeRef.current = code;
    isDirty.current = false;
    setSaving(false);
  };

  async function sendMessageToConversation(targetConversation: Conversation, content: string) {
    setChatOpen(true);
    setIsComposingNewConversation(false);
    setChatLoading(true);
    setChatInput('');
    let optimisticMessageId: number | null = null;

    // Auto-save before sending a message
    if (submission && isDirty.current) {
      await api.post(`/api/submissions/${submission.id}/save`, { code });
      savedCodeRef.current = code;
      isDirty.current = false;
    }

    try {
      const loadedConversation = activeConv?.id === targetConversation.id
        ? activeConv
        : await loadConversation(targetConversation);
      const execution = await resolveExecutionInfoForChat(code);

      if (loadedConversation) {
        optimisticMessageId = appendOptimisticUserMessage(loadedConversation.id, content);
      }

      await api.post<ChatMessage>(
        `/api/conversations/${targetConversation.id}/messages`,
        { content, code, execution }
      );

      const convRes = await api.get<Conversation>(`/api/conversations/${targetConversation.id}`);
      maybeCelebrateFromConversation(convRes.data);
      setActiveConv(convRes.data);
      upsertConversation(convRes.data);
      await refreshSubmissionStatus();
    } catch (error) {
      if (optimisticMessageId !== null) {
        removeMessageFromConversation(targetConversation.id, optimisticMessageId);
      }
      throw error;
    } finally {
      setChatLoading(false);
    }
  }

  async function startConversation(type: 'help' | 'evaluate') {
    if (!submission) return;

    setChatOpen(true);
    setIsComposingNewConversation(false);
    setChatInput('');
    setChatLoading(true);

    try {
      await handleSave();
      const execution = await resolveExecutionInfoForChat(code);
      const res = await api.post<Conversation>(
        `/api/submissions/${submission.id}/conversations`,
        { type, code, execution }
      );
      maybeCelebrateFromConversation(res.data);
      setActiveConv(res.data);
      upsertConversation(res.data);
      await refreshSubmissionStatus();
    } finally {
      setChatLoading(false);
    }
  }

  async function startOrReuseConversation(type: 'help' | 'evaluate', promptText: string) {
    const botPrompt = user?.role === 'teacher' || user?.role === 'admin'
      ? ensureBotMention(promptText)
      : promptText;
    const reusable = getLatestConversationOfType(conversations, type);
    if (reusable) {
      await sendMessageToConversation(reusable, botPrompt);
      return;
    }

    await startConversation(type);
  }

  async function startFreshConversation(type: 'help' | 'evaluate') {
    await startConversation(type);
  }

  function openNewConversationComposer() {
    setChatOpen(true);
    setActiveConv(null);
    setChatInput('');
    setIsComposingNewConversation(true);
  }

  function toggleChatPanel() {
    if (chatOpen) {
      setChatOpen(false);
      return;
    }
    setChatOpen(true);
  }

  useEffect(() => {
    return () => {
      if (confettiTimer.current) clearTimeout(confettiTimer.current);
      if (successBannerTimer.current) clearTimeout(successBannerTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!exerciseId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const exerciseRes = await api.get<Exercise>(`/api/exercises/${exerciseId}`);
        setExercise(exerciseRes.data);

        const submissionRes = await api.post<Submission>(`/api/exercises/${exerciseId}/submissions`);
        setSubmission(submissionRes.data);

        const detRes = await api.get<{ versions?: { code?: string }[] }>(`/api/submissions/${submissionRes.data.id}`);
        const versions = detRes.data.versions;
        if (versions && versions.length > 0) {
          const latest = versions[versions.length - 1];
          if (latest.code) {
            setCode(latest.code);
            savedCodeRef.current = latest.code;
          }
        }

        const convRes = await api.get<Conversation[]>(`/api/submissions/${submissionRes.data.id}/conversations`);
        setConversations(convRes.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('loading');
        setError(message);

        if (message.includes('403') || message.includes('Access denied') || message.includes('locked')) {
          setTimeout(() => navigate('/'), 2500);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [exerciseId, t, navigate]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      if (!isMonacoTarget(event.target)) return;

      const copiedText = getSelectedTextFromMonaco();
      if (!copiedText) return;

      event.preventDefault();
      event.stopPropagation();
      event.clipboardData.setData('text/plain', `${copiedText}   `);
      console.log('[clipboard][monaco] copy tagged', { length: copiedText.length });
    };

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain');
      if (typeof pastedText !== 'string') return;

      const monacoPaste = isMonacoTarget(event.target);
      if (monacoPaste) return;

      const editableTarget = event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLInputElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable);

      if (!editableTarget) return;

      if (!INTERNAL_CLIPBOARD_REGEX.test(pastedText)) {
        event.preventDefault();
        return;
      }

      const sanitizedText = pastedText.replace(INTERNAL_CLIPBOARD_REGEX, '');
      event.preventDefault();

      insertTextAtCursor(event.target, sanitizedText);
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
    };
  }, [getSelectedTextFromMonaco, insertTextAtCursor, isMonacoTarget]);

  // Load topic exercises to find next exercise
  useEffect(() => {
    if (!exercise) return;

    const loadTopicExercises = async () => {
      try {
        const res = await api.get<Exercise[]>(`/api/topics/${exercise.topic_id}/exercises`);

        // Find next exercise in the topic (higher order_index)
        const currentOrder = exercise.order_index;
        const nextEx = res.data.find((ex) => ex.order_index > currentOrder);
        setNextExerciseId(nextEx?.id ?? null);
      } catch (err) {
        console.error('Error loading topic exercises:', err);
      }
    };

    void loadTopicExercises();
  }, [exercise]);

  useEffect(() => {
    isDirty.current = code !== savedCodeRef.current;
  }, [code]);

  useEffect(() => {
    setDebugSession((prev) => {
      if (prev.code === code) return prev;
      return {
        ...prev,
        status: 'idle',
        seed: null,
        code,
        history: [],
        snapshot: null,
        errorMessage: null,
      };
    });
    setSelectedDebugFrameId(null);
  }, [code]);

  useEffect(() => {
    if (!submission) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      api.post(`/api/submissions/${submission.id}/save`, { code });
      savedCodeRef.current = code;
      isDirty.current = false;
    }, 30000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [code, submission]);

  // Prompt on browser close/refresh with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleNavigateAway = useCallback((to: string) => {
    if (isDirty.current) {
      pendingNavigationRef.current = to;
      setShowLeaveModal(true);
    } else {
      navigate(to);
    }
  }, [navigate]);

  useEffect(() => {
    const count = activeConv?.messages?.length ?? 0;
    if (count > prevMessageCountRef.current || chatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = count;
  }, [activeConv?.messages, chatLoading]);

  useEffect(() => {
    if (consoleOutput.length === 0 && !isWaitingForInput) return;
    const panel = consolePanelRef.current;
    const output = consoleOutputRef.current;
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (output) {
      output.scrollTop = output.scrollHeight;
    }
  }, [consoleOutput, isWaitingForInput]);

  useEffect(() => {
    if (isWaitingForInput) {
      terminalInputRef.current?.focus();
    }
  }, [isWaitingForInput]);

  useEffect(() => {
    debugStatusRef.current = debugSession.status;
    currentDebugFrameRef.current = currentDebugFrame;
  }, [currentDebugFrame, debugSession.status]);

  useEffect(() => {
    return () => {
      debugHoverProviderRef.current?.dispose();
      debugHoverProviderRef.current = null;
      monacoPasteListenerRef.current?.dispose();
      monacoPasteListenerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const frames = debugSession.snapshot?.frames ?? [];
    setSelectedDebugFrameId((prev) => {
      if (frames.length === 0) return null;
      return frames.some((frame) => frame.id === prev) ? prev : frames[0].id;
    });
  }, [debugSession.snapshot]);

  useEffect(() => {
    if (!debugSession.snapshot) return;
    console.log('[pylamos debugger stack]', {
      status: debugSession.status,
      event: debugSession.snapshot.event,
      line: debugSession.snapshot.line,
      frames: debugSession.snapshot.frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        file: frame.file,
        line: frame.line,
        locals: frame.locals,
      })),
      raw: debugSession.snapshot,
    });
  }, [debugSession.snapshot, debugSession.status]);

  useEffect(() => {
    const editorInstance = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editorInstance || !monacoInstance) return;

    breakpointDecorationIdsRef.current = editorInstance.deltaDecorations(
      breakpointDecorationIdsRef.current,
      debugSession.breakpoints.map((lineNumber) => ({
        range: new monacoInstance.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'debug-breakpoint-glyph',
          linesDecorationsClassName: 'debug-breakpoint-line',
        },
      }))
    );

    const currentLine = debugSession.status === 'paused'
      ? debugSession.snapshot?.line
      : null;
    currentLineDecorationIdsRef.current = editorInstance.deltaDecorations(
      currentLineDecorationIdsRef.current,
      currentLine
        ? [{
            range: new monacoInstance.Range(currentLine, 1, currentLine, 1),
            options: {
              isWholeLine: true,
              className: 'debug-current-line',
            },
          }]
        : []
    );

    if (currentLine) {
      editorAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      editorInstance.revealLineInCenter(currentLine);
    }
  }, [debugSession.breakpoints, debugSession.snapshot, debugSession.status]);

  useEffect(() => {
    if (!chatOpen || isComposingNewConversation || !activeConv?.id) return;

    let cancelled = false;

    const refreshActiveConversation = async () => {
      try {
        const convRes = await api.get<Conversation>(`/api/conversations/${activeConv.id}`);
        if (cancelled) return;

        setActiveConv((prev) => {
          if (!prev || prev.id !== convRes.data.id) return prev;
          return mergeConversationWithPendingMessages(convRes.data, prev);
        });

        setConversations((prev) => {
          const currentConversation = prev.find((c) => c.id === convRes.data.id) ?? null;
          const mergedConversation = mergeConversationWithPendingMessages(convRes.data, currentConversation);
          const exists = prev.some((c) => c.id === convRes.data.id);
          if (!exists) return [...prev, mergedConversation];
          return prev.map((c) => (c.id === convRes.data.id ? { ...c, ...mergedConversation } : c));
        });
      } catch {
        // Ignore transient polling errors and try again on next tick.
      }
    };

    void refreshActiveConversation();
    const intervalId = setInterval(() => {
      void refreshActiveConversation();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [chatOpen, isComposingNewConversation, activeConv?.id]);

  useEffect(() => {
    if (!chatOpen || isComposingNewConversation) return;
    if (activeConv && activeConv.status !== 'closed') return;

    const latestOpen = getLatestOpenConversation(conversations);
    if (!latestOpen) {
      setActiveConv(null);
      return;
    }

    void loadConversation(latestOpen);
  }, [chatOpen, isComposingNewConversation, activeConv, conversations, loadConversation]);

  const handleStop = useCallback(() => {
    if (activeExecutionMode === 'debug' || debugSession.status !== 'idle') {
      const debugClosedMessage = debugSession.status === 'finished'
        ? '(depuració amagada)\n'
        : '(depuració aturada)\n';
      setDebugSession((prev) => ({
        ...prev,
        status: 'idle',
        seed: null,
        history: [],
        snapshot: null,
        errorMessage: null,
      }));
      setSelectedDebugFrameId(null);
      setActiveExecutionMode(null);
      setIsRunning(false);
      setIsWaitingForInput(false);
      setTerminalInput('');
      setConsoleOutput((prev) => [...prev, { type: 'info', text: debugClosedMessage }]);
      return;
    }

    setActiveExecutionMode(null);
    setIsRunning(false);
    setIsWaitingForInput(false);
    setTerminalInput('');
    setConsoleOutput((prev) => [...prev, { type: 'info', text: '(execució aturada)\n' }]);
  }, [activeExecutionMode, debugSession.status]);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setDebugSession((prev) => ({
      ...prev,
      status: 'idle',
      seed: null,
      history: [],
      snapshot: null,
      errorMessage: null,
    }));
    setSelectedDebugFrameId(null);
    const filename = exercise
      ? exercise.title.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') + '.py'
      : 'exercici.py';
    consolePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (submission) {
      await api.post(`/api/submissions/${submission.id}/save`, { code });
      savedCodeRef.current = code;
      isDirty.current = false;
    }
    runningCodeRef.current = code;
    runningFilenameRef.current = filename;
    runSeedRef.current = Math.floor(Math.random() * 2 ** 31);
    setCollectedInputs([]);
    setIsWaitingForInput(false);
    setTerminalInput('');
    const result = runBrython(code, [], runSeedRef.current);
    setIsRunning(false);
    applyResult({ text: `$ python ${filename}\n`, type: 'info' }, result);
    latestExecutionCodeRef.current = code;
    latestExecutionInfoRef.current = buildExecutionInfoFromResult(result);

    // Si hi ha un error de compilació, demanem al backend una explicació amigable
    // (usa compile() sense executar el codi de l'alumne).
    const hasCompileError = result.entries.some((e) => e.phase === 'compile');
    if (hasCompileError) {
      try {
        type DiagnoseResult = {
          has_error: boolean;
          error_type: string | null;
          line: number | null;
          message: string | null;
        };
        const res = await api.post<DiagnoseResult>('/api/code/diagnose', { code });
        if (res.data.has_error) {
          latestExecutionInfoRef.current = {
            status: 'compile_error',
            compiled: false,
            executed: false,
            can_mark_resolved: false,
            line: res.data.line ?? undefined,
            error_type: res.data.error_type ?? undefined,
            error_message: res.data.message ?? undefined,
          };
          setConsoleOutput((prev) =>
            prev.map((entry) =>
              entry.phase === 'compile'
                ? {
                    ...entry,
                    text: [
                      `Error de compilació${res.data.line ? ` (línia ${res.data.line})` : ''}.`,
                      res.data.message ?? null,
                    ].filter(Boolean).join('\n') + '\n',
                    line: res.data.line ?? undefined,
                  }
                : entry
            )
          );
        }
      } catch {
        // error de xarxa o backend no disponible — ignorar silenciosament
      }
    }
  }, [code, exercise, submission, runBrython, applyResult, buildExecutionInfoFromResult]);

  const handleTerminalSubmit = useCallback(async () => {
    if (!isWaitingForInput) return;
    consolePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const value = terminalInput;
    setTerminalInput('');
    const newInputs = [...collectedInputs, value];
    setCollectedInputs(newInputs);

    if (activeExecutionMode === 'debug') {
      if (debugSession.seed == null) return;
      await executeDebugHistory(debugSession.history, debugSession.seed, newInputs);
      return;
    }

    const result = runBrython(runningCodeRef.current, newInputs, runSeedRef.current);
    applyResult({ text: `$ python ${runningFilenameRef.current}\n`, type: 'info' }, result);
    latestExecutionCodeRef.current = runningCodeRef.current;
    latestExecutionInfoRef.current = buildExecutionInfoFromResult(result);
  }, [activeExecutionMode, applyResult, buildExecutionInfoFromResult, collectedInputs, debugSession.history, debugSession.seed, executeDebugHistory, isWaitingForInput, runBrython, terminalInput]);

  const handleEvaluate = async () => {
    await startOrReuseConversation('evaluate', t('suggest_reevaluate'));
  };

  const handleSendMessage = async () => {
    if (!activeConv || !chatInput.trim()) return;
    await sendMessageToConversation(activeConv, chatInput.trim());
  };

  const statusLabel = submission ? t(submission.status) : '';
  const isCompleted = submission?.status === 'correct' || submission?.status === 'teacher_correct';
  const isChatBlocked = submission?.chat_blocked === true;

  // Auto-scroll to top when exercise is completed to show the "Next Exercise" button
  useEffect(() => {
    if (isCompleted && workspaceLeftRef.current) {
      workspaceLeftRef.current.scrollTop = 0;
    }
  }, [isCompleted]);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 20 }}>
          <circle cx="32" cy="32" r="30" stroke="var(--error)" strokeWidth="2" />
          <line x1="20" y1="20" x2="44" y2="44" stroke="var(--error)" strokeWidth="3" strokeLinecap="round" />
          <line x1="44" y1="20" x2="20" y2="44" stroke="var(--error)" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h2 style={{ color: 'var(--error)', marginBottom: 12 }}>{t('access_denied')}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{t('topic_locked')}</p>
        <Link to="/" style={{ color: 'var(--text-bright)' }}>{t('back_to_dashboard')}</Link>
      </div>
    );
  }

  if (loading || !exercise) {
    return <div style={{ padding: 20, textAlign: 'center' }}>{t('loading')}</div>;
  }
  return (
    <div className="workspace">
      {showLeaveModal && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <p>{t('unsaved_changes_prompt')}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={async () => {
                await handleSave();
                setShowLeaveModal(false);
                if (pendingNavigationRef.current) navigate(pendingNavigationRef.current);
              }}>{t('save_and_leave')}</button>
              <button className="btn-secondary" onClick={() => {
                setShowLeaveModal(false);
                isDirty.current = false;
                if (pendingNavigationRef.current) navigate(pendingNavigationRef.current);
              }}>{t('leave_without_saving')}</button>
              <button className="btn-secondary" onClick={() => {
                setShowLeaveModal(false);
                pendingNavigationRef.current = null;
              }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigateAway('/'); }} style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← {t('dashboard')}</a>
          <span className="exercise-title-bar">{exercise.title}</span>
          {submission && (
            <span className={`status-dot ${submission.status}${isChatBlocked ? ' chat-blocked' : ''}`} title={isChatBlocked ? t('chat_blocked_student') : statusLabel} />
          )}
        </div>
        <div className="toolbar-right">
          {!isCompleted && (
            <button className="btn-secondary" onClick={handleSave} disabled={saving}>
              {saving ? '...' : t('save')}
            </button>
          )}
          {showExecutionStop ? (
            <button className="btn-danger" onClick={handleStop}>⏹ {executionStopLabel}</button>
          ) : (
            <div className="run-mode-controls">
              <button className="btn-primary" onClick={() => void handleRun()}>▶ {t('run')}</button>
              <ActionMenu items={executionModeMenuItems} title={t('start_debug')} />
            </div>
          )}
          {!isCompleted && (
            <button className="btn-success" onClick={() => void handleEvaluate()} disabled={chatLoading || isChatBlocked}>
              {t('evaluate')}
            </button>
          )}
          <button className="btn-secondary" onClick={toggleChatPanel}>
            {t('chat')}
          </button>
        </div>
      </div>

      <div className="workspace-main">
        <div className="workspace-left" ref={workspaceLeftRef}>
          {isCompleted && (
            <div className="solved-banner" role="status">
              <span className="solved-banner-icon">✓</span>
              <span>{t('exercise_solved')}</span>
              {nextExerciseId && (
                <button
                  className="btn-primary btn-next-exercise"
                  onClick={() => navigate(`/exercise/${nextExerciseId}`)}
                  style={{ marginLeft: 'auto' }}
                >
                  {t('next_exercise')} →
                </button>
              )}
            </div>
          )}
          <div className="panel-header">{t('description')}</div>
          <div className="description-panel">
            <MdRenderer>{exercise.description}</MdRenderer>
          </div>

          <div className="panel-header editor-header">
            <span>Editor</span>
            <div className="editor-actions">
              {showExecutionStop ? (
                <button className="btn-danger" onClick={handleStop}>⏹ {executionStopLabel}</button>
              ) : (
                <div className="run-mode-controls">
                  <button className="btn-primary" onClick={() => void handleRun()}>▶ {t('run')}</button>
                  <ActionMenu items={executionModeMenuItems} title={t('start_debug')} />
                </div>
              )}
            </div>
          </div>
          <div ref={editorAreaRef} className="editor-area">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val ?? '')}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                glyphMargin: true,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                readOnly: isCompleted,
              }}
            />
          </div>

          {showDebugPanel && (
            <div className="debug-panel">
              <div className="panel-header debug-header">
                <span>{t('debugger')}</span>
                <div className="debug-header-actions">
                  <span className={`debug-status-pill ${debugSession.status}`}>{getDebugStatusLabel(debugSession.status)}</span>
                  <span className="debug-breakpoint-count">{t('breakpoints')}: {debugSession.breakpoints.length}</span>
                  <div className="debug-step-controls">
                    <button className="btn-warning debug-btn" onClick={() => queueDebugCommand('step_into')} disabled={!canAdvanceDebug}>
                      {t('step')}
                    </button>
                    <ActionMenu items={debugStepMenuItems} disabled={!canAdvanceDebug} />
                  </div>
                  <button className="btn-danger debug-btn" onClick={handleStop} disabled={debugSession.status === 'idle'}>
                    {debugSession.status === 'finished' ? t('hide') : t('stop')}
                  </button>
                </div>
              </div>
              <div className="debug-body">
                <div className="debug-pane">
                  <div className="debug-pane-title">{t('call_stack')}</div>
                  <div className="debug-pane-content">
                    {debugSession.snapshot?.frames.length
                      ? debugSession.snapshot.frames.map((frame) => (
                          <button
                            key={frame.id}
                            className={`debug-stack-frame ${frame.id === currentDebugFrame?.id ? 'active' : ''}`}
                            onClick={() => setSelectedDebugFrameId(frame.id)}
                          >
                            <span className="debug-stack-frame-name">{frame.name}</span>
                            <span className="debug-stack-frame-line">{frame.file}:{frame.line}</span>
                          </button>
                        ))
                      : <div className="debug-empty">{t('no_stack_frames')}</div>
                    }
                  </div>
                </div>
                <div className="debug-pane">
                  <div className="debug-pane-title">{t('variables')}</div>
                  <div className="debug-pane-content">
                    {currentDebugFrame?.locals.length
                      ? currentDebugFrame.locals.map((item) => (
                          <div key={`${currentDebugFrame.id}-${item.name}`} className="debug-variable-row">
                            <span className="debug-variable-name">{item.name}</span>
                            <span className="debug-variable-type">{item.type}</span>
                            <span className="debug-variable-value">{item.value}</span>
                          </div>
                        ))
                      : <div className="debug-empty">{t('no_variables')}</div>
                    }
                  </div>
                </div>
              </div>
              {debugSession.errorMessage && (
                <div className="debug-error-banner">{debugSession.errorMessage}</div>
              )}
            </div>
          )}

          <div ref={consolePanelRef} className="console-panel">
            <div className="panel-header">{t('console')}</div>
            <div ref={consoleOutputRef} className="console-output">
              {consoleOutput.map((line, i) => {
                if (line.type === 'error' && line.details) {
                  return (
                    <div key={i} className="console-line error">
                      <span className="console-error-summary">{line.text}</span>
                      <details className="console-error-details">
                        <summary>Detall tècnic</summary>
                        <pre>{line.details}</pre>
                      </details>
                    </div>
                  );
                }

                return <span key={i} className={`console-line ${line.type}`}>{line.text}</span>;
              })}
            </div>
            {isWaitingForInput && (
              <div className="console-stdin">
                <input
                  ref={terminalInputRef}
                  className="console-stdin-input"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTerminalSubmit();
                    }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </div>

        <div className={`chat-sidebar ${!chatOpen ? 'collapsed' : ''}`}>
          {showSuccessBanner && (
            <div className="success-banner" role="status" aria-live="polite">
              <span className="success-banner-icon">✓</span>
              <span>Exercici Correcte</span>
            </div>
          )}
          {showConfetti && (
            <div className="confetti-layer" aria-hidden="true">
              {Array.from({ length: 20 }).map((_, i) => (
                <span key={i} className={`confetti-piece p${(i % 6) + 1}`} style={{ left: `${(i * 5) % 100}%` }} />
              ))}
            </div>
          )}

          <div className="panel-header">
            <span>{t('chat')}</span>
            <div className="chat-header-actions">
              {!isCompleted && !isChatBlocked && (
                <button className="chat-new-button" onClick={openNewConversationComposer} title={t('new_conversation')}>
                  +
                </button>
              )}
              {conversations.length > 0 && (
                <select
                  className="chat-conversation-select"
                  value={activeConv?.id ?? ''}
                  onChange={(e) => {
                    const conv = conversations.find((c) => c.id === Number(e.target.value));
                    if (conv) void loadConversation(conv);
                  }}
                >
                  <option value="">-- {t('chat')} --</option>
                  {conversations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.type === 'evaluate' ? t('evaluate') : t('help')} #{c.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="chat-messages">
            {!activeConv && !chatLoading && (
              <div className="chat-empty-state">
                <div className="chat-empty-title">{t('chat_empty_title')}</div>
                {!isCompleted && !isChatBlocked && (
                  <div className="chat-empty-actions">
                    <button className="chat-choice-button" onClick={() => void startFreshConversation('help')}>
                      {t('chat_choice_help')}
                    </button>
                    <button className="chat-choice-button primary" onClick={() => void startFreshConversation('evaluate')}>
                      {t('chat_choice_review')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeConv?.messages?.filter(shouldRenderMessage).map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                {msg.role === 'assistant' && <div className="chat-badge">[🤖]</div>}
                {msg.role === 'teacher' && <div className="chat-badge">[Professor]</div>}
                <MdRenderer>{stripResultMarkers(msg.content)}</MdRenderer>
                {msg.role === 'assistant' && getMessageVerdict(msg) === 'correct' && (
                  <span className="msg-reaction correct" title="Resposta correcta" />
                )}
                {msg.role === 'assistant' && getMessageVerdict(msg) === 'incorrect' && (
                  <span className="msg-reaction incorrect" title="Resposta incorrecta" />
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="chat-bubble assistant typing-bubble" aria-label={t('loading')}>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {activeConv?.status === 'closed' && (
            <div className="chat-status">{t('conversation_closed')}</div>
          )}

          {isChatBlocked && (
            <div className="chat-status chat-blocked">{t('chat_blocked_student')}</div>
          )}

          {activeConv && activeConv.status !== 'closed' && !isCompleted && !isChatBlocked && (
            <>
              <div className="chat-suggestions">
                {suggestionPrompts.map((suggestion) => (
                  <button
                    key={suggestion.text}
                    className="chat-suggestion-chip"
                    onClick={() => void startOrReuseConversation(suggestion.type, suggestion.text)}
                    disabled={chatLoading}
                  >
                    {suggestion.text}
                  </button>
                ))}
              </div>
              <div className="chat-input-area">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={t('input_placeholder')}
                  disabled={chatLoading}
                  rows={1}
                />
                <button
                  className="btn-primary"
                  onClick={() => void handleSendMessage()}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  ➤
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
