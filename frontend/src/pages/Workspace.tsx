import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import MdRenderer from '../components/MdRenderer';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { useBrython, type ConsoleEntry, type RunResult } from '../hooks/useBrython';
import type { Exercise, Submission, Conversation, ChatMessage, CodeExecutionInfo } from '../types';
import './Workspace.css';

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
  const [code, setCode] = useState('# Escriu el teu codi aquí\n');
  const [consoleOutput, setConsoleOutput] = useState<ConsoleEntry[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [collectedInputs, setCollectedInputs] = useState<string[]>([]);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
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
  const pendingNavigationRef = useRef<string | null>(null);

  const { run: runBrython } = useBrython();

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
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const confettiTimer = useRef<ReturnType<typeof setTimeout>>();
  const successBannerTimer = useRef<ReturnType<typeof setTimeout>>();

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
    } else {
      setIsWaitingForInput(false);
      setIsRunning(false);
    }
  }, []);

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

  function buildExecutionInfoFromResult(result: RunResult): CodeExecutionInfo {
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
  }

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

  function upsertConversation(conv: Conversation) {
    setConversations((prev) => {
      const next = [...prev.filter((item) => item.id !== conv.id), conv];
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }

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

  async function loadConversation(conv: Conversation) {
    const res = await api.get<Conversation>(`/api/conversations/${conv.id}`);
    setActiveConv((prev) => mergeConversationWithPendingMessages(res.data, prev));
    setChatOpen(true);
    setIsComposingNewConversation(false);
    const mergedConversation = mergeConversationWithPendingMessages(res.data, activeConv?.id === res.data.id ? activeConv : null);
    upsertConversation(mergedConversation);
    return mergedConversation;
  }

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
    isDirty.current = code !== savedCodeRef.current;
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
  }, [chatOpen, isComposingNewConversation, activeConv, conversations]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setIsWaitingForInput(false);
    setTerminalInput('');
    setConsoleOutput((prev) => [...prev, { type: 'info', text: '(execució aturada)\n' }]);
  }, []);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
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
  }, [code, exercise, submission, runBrython, applyResult]);

  const handleTerminalSubmit = useCallback(() => {
    if (!isWaitingForInput) return;
    consolePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const value = terminalInput;
    setTerminalInput('');
    const newInputs = [...collectedInputs, value];
    setCollectedInputs(newInputs);
    const result = runBrython(runningCodeRef.current, newInputs, runSeedRef.current);
    applyResult({ text: `$ python ${runningFilenameRef.current}\n`, type: 'info' }, result);
    latestExecutionCodeRef.current = runningCodeRef.current;
    latestExecutionInfoRef.current = buildExecutionInfoFromResult(result);
  }, [isWaitingForInput, terminalInput, collectedInputs, runBrython, applyResult]);

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
          {isRunning
            ? <button className="btn-danger" onClick={handleStop}>⏹ {t('stop')}</button>
            : <button className="btn-primary" onClick={() => void handleRun()}>▶ {t('run')}</button>
          }
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
        <div className="workspace-left">
          {isCompleted && (
            <div className="solved-banner" role="status">
              <span className="solved-banner-icon">✓</span>
              <span>{t('exercise_solved')}</span>
            </div>
          )}
          <div className="panel-header">{t('description')}</div>
          <div className="description-panel">
            <MdRenderer>{exercise.description}</MdRenderer>
          </div>

          <div className="panel-header editor-header">
            <span>Editor</span>
            <div className="editor-actions">
              {isRunning
                ? <button className="btn-danger" onClick={handleStop}>⏹ {t('stop')}</button>
                : <button className="btn-primary" onClick={() => void handleRun()}>▶ {t('run')}</button>
              }
            </div>
          </div>
          <div className="editor-area">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val ?? '')}
              options={{
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                readOnly: isCompleted,
              }}
            />
          </div>

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
