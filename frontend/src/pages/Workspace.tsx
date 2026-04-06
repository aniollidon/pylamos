import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import MdRenderer from '../components/MdRenderer';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { useBrython, type ConsoleEntry, type RunResult } from '../hooks/useBrython';
import type { Exercise, Submission, Conversation, ChatMessage } from '../types';
import './Workspace.css';

export default function Workspace() {
  const MARKER_CORRECT = '[EXERCICI_CORRECTE]';
  const MARKER_INCORRECT = '[EXERCICI_INCORRECTE]';

  const stripResultMarkers = (text: string) => text
    .split(MARKER_CORRECT).join('')
    .split(MARKER_INCORRECT).join('')
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

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [code, setCode] = useState('# Escriu el teu codi aquí\n');
  const [consoleOutput, setConsoleOutput] = useState<ConsoleEntry[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [collectedInputs, setCollectedInputs] = useState<string[]>([]);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [isComposingNewConversation, setIsComposingNewConversation] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [saving, setSaving] = useState(false);

  const { run: runBrython } = useBrython();

  const runningCodeRef = useRef<string>('');
  const runningFilenameRef = useRef<string>('exercici.py');
  const runSeedRef = useRef<number>(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
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
      setTimeout(() => terminalInputRef.current?.focus(), 30);
    } else {
      setIsWaitingForInput(false);
    }
  }, []);

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
  }

  async function refreshSubmissionStatus() {
    if (!submission) return;
    const subRes = await api.get<Submission>(`/api/submissions/${submission.id}`);
    setSubmission(subRes.data);
  }

  async function loadConversation(conv: Conversation) {
    const res = await api.get<Conversation>(`/api/conversations/${conv.id}`);
    setActiveConv(res.data);
    setChatOpen(true);
    setIsComposingNewConversation(false);
    upsertConversation(res.data);
    return res.data;
  }

  const handleSave = async () => {
    if (!submission) return;
    setSaving(true);
    await api.post(`/api/submissions/${submission.id}/save`, { code });
    setSaving(false);
  };

  async function sendMessageToConversation(targetConversation: Conversation, content: string) {
    setChatOpen(true);
    setIsComposingNewConversation(false);
    setChatLoading(true);
    setChatInput('');

    try {
      const loadedConversation = activeConv?.id === targetConversation.id
        ? activeConv
        : await loadConversation(targetConversation);

      if (loadedConversation) {
        appendOptimisticUserMessage(loadedConversation.id, content);
      }

      await api.post<ChatMessage>(
        `/api/conversations/${targetConversation.id}/messages`,
        { content, code }
      );

      const convRes = await api.get<Conversation>(`/api/conversations/${targetConversation.id}`);
      maybeCelebrateFromConversation(convRes.data);
      setActiveConv(convRes.data);
      upsertConversation(convRes.data);
      await refreshSubmissionStatus();
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
      const res = await api.post<Conversation>(
        `/api/submissions/${submission.id}/conversations`,
        { type, code }
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
    api.get<Exercise>(`/api/exercises/${exerciseId}`).then((res) => setExercise(res.data));
    api.post<Submission>(`/api/exercises/${exerciseId}/submissions`).then((res) => {
      setSubmission(res.data);
      api.get<{ versions?: { code?: string }[] }>(`/api/submissions/${res.data.id}`).then((detRes) => {
        const versions = detRes.data.versions;
        if (versions && versions.length > 0) {
          const latest = versions[versions.length - 1];
          if (latest.code) setCode(latest.code);
        }
      });
      api.get<Conversation[]>(`/api/submissions/${res.data.id}/conversations`).then((convRes) => {
        setConversations(convRes.data);
      });
    });
  }, [exerciseId]);

  useEffect(() => {
    if (!submission) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      api.post(`/api/submissions/${submission.id}/save`, { code });
    }, 30000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [code, submission]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, chatLoading]);

  useEffect(() => {
    if (!chatOpen || isComposingNewConversation || !activeConv?.id) return;

    let cancelled = false;

    const refreshActiveConversation = async () => {
      try {
        const convRes = await api.get<Conversation>(`/api/conversations/${activeConv.id}`);
        if (cancelled) return;

        setActiveConv((prev) => {
          if (!prev || prev.id !== convRes.data.id) return prev;
          return convRes.data;
        });

        setConversations((prev) => {
          const exists = prev.some((c) => c.id === convRes.data.id);
          if (!exists) return [...prev, convRes.data];
          return prev.map((c) => (c.id === convRes.data.id ? { ...c, ...convRes.data } : c));
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

  const handleRun = useCallback(() => {
    const filename = exercise
      ? exercise.title.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') + '.py'
      : 'exercici.py';
    runningCodeRef.current = code;
    runningFilenameRef.current = filename;
    runSeedRef.current = Math.floor(Math.random() * 2 ** 31);
    setCollectedInputs([]);
    setIsWaitingForInput(false);
    setTerminalInput('');
    const result = runBrython(code, [], runSeedRef.current);
    applyResult({ text: `$ python ${filename}\n`, type: 'info' }, result);
  }, [code, exercise, runBrython, applyResult]);

  const handleTerminalSubmit = useCallback(() => {
    if (!isWaitingForInput) return;
    const value = terminalInput;
    setTerminalInput('');
    const newInputs = [...collectedInputs, value];
    setCollectedInputs(newInputs);
    const result = runBrython(runningCodeRef.current, newInputs, runSeedRef.current);
    applyResult({ text: `$ python ${runningFilenameRef.current}\n`, type: 'info' }, result);
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

  if (!exercise) return <div style={{ padding: 20 }}>{t('loading')}</div>;

  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← {t('dashboard')}</Link>
          <span className="exercise-title-bar">{exercise.title}</span>
          {submission && (
            <span className={`status-dot ${submission.status}`} title={statusLabel} />
          )}
        </div>
        <div className="toolbar-right">
          {!isCompleted && (
            <button className="btn-secondary" onClick={handleSave} disabled={saving}>
              {saving ? '...' : t('save')}
            </button>
          )}
          <button className="btn-primary" onClick={handleRun}>▶ {t('run')}</button>
          {!isCompleted && (
            <button className="btn-success" onClick={() => void handleEvaluate()} disabled={chatLoading}>
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
              <button className="btn-primary" onClick={handleRun}>▶ {t('run')}</button>
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

          <div className="console-panel">
            <div className="panel-header">{t('console')}</div>
            <div className="console-output">
              {consoleOutput.map((line, i) => (
                <span key={i} className={`console-line ${line.type}`}>{line.text}</span>
              ))}
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
              {!isCompleted && (
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
                {!isCompleted && (
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

          {activeConv && activeConv.status !== 'closed' && !isCompleted && (
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
