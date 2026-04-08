import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import MdRenderer from '../components/MdRenderer';
import api from '../api/client';
import type { Exercise, Submission, SubmissionVersion, Conversation, User } from '../types';
import './Workspace.css';
import './Admin.css';

interface StudentRef {
  userId: number;
  name: string;
}

interface LocationState {
  classId?: number;
  students?: StudentRef[];
}

export default function TeacherReview() {
  const { exerciseId, userId } = useParams<{ exerciseId: string; userId: string }>();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState) || {};
  const classId = state.classId;
  const sortedStudents: StudentRef[] = useMemo(
    () => (state.students ? [...state.students].sort((a, b) => a.name.localeCompare(b.name, 'ca')) : []),
    [state.students]
  );
  const currentIndex = sortedStudents.findIndex((s) => s.userId === Number(userId));

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [versions, setVersions] = useState<SubmissionVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number>(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [studentFullName, setStudentFullName] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exerciseId) return;
    const currentUserId = Number(userId);

    setSubmission(null);
    setVersions([]);
    setSelectedVersion(0);
    setConversations([]);
    setActiveConv(null);
    setChatInput('');
    setStudentFullName('');

    const studentFromState = sortedStudents.find((s) => s.userId === currentUserId);
    if (studentFromState?.name) {
      setStudentFullName(studentFromState.name);
    } else if (userId) {
      api.get<User>(`/api/users/${userId}`).then((r) => {
        setStudentFullName(r.data.full_name || r.data.username);
      });
    }

    api.get<Exercise>(`/api/exercises/${exerciseId}`).then((r) => setExercise(r.data));
    api.get<Submission[]>(`/api/exercises/${exerciseId}/submissions/all`).then((r) => {
      const sub = r.data
        .filter((s: Submission) => s.user_id === currentUserId)
        .sort((a, b) => {
          const aTs = new Date(a.updated_at).getTime();
          const bTs = new Date(b.updated_at).getTime();
          if (aTs !== bTs) return bTs - aTs;
          return b.id - a.id;
        })[0];
      if (sub) {
        setSubmission(sub);
        api.get<Submission>(`/api/submissions/${sub.id}`).then((detRes) => {
          const loadedVersions = detRes.data.versions || [];
          setVersions(loadedVersions);
          if (loadedVersions.length > 0) setSelectedVersion(loadedVersions.length - 1);
        });
        api.get<Conversation[]>(`/api/submissions/${sub.id}/conversations`).then((convRes) => {
          setConversations(convRes.data);
          if (convRes.data.length > 0) {
            loadConversation(convRes.data[convRes.data.length - 1]);
          }
        });
      }
    });
  }, [exerciseId, userId, sortedStudents]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  const loadConversation = async (conv: Conversation) => {
    const res = await api.get<Conversation>(`/api/conversations/${conv.id}`);
    setActiveConv(res.data);
  };

  const handleSendTeacherMessage = async () => {
    const content = chatInput.trim();
    if (!activeConv || !content) return;
    setChatLoading(true);
    try {
      await api.post(`/api/conversations/${activeConv.id}/messages`, {
        content,
        code: versions[selectedVersion]?.code,
      });
      const convRes = await api.get<Conversation>(`/api/conversations/${activeConv.id}`);
      setActiveConv(convRes.data);
      setChatInput('');
    } finally {
      setChatLoading(false);
    }
  };

  const handleOverride = async (status: string) => {
    if (!submission) return;
    await api.post(`/api/submissions/${submission.id}/override`, { status });
    setSubmission({ ...submission, status: status as any });
  };

  const handleReopenConv = async () => {
    if (!activeConv) return;
    await api.post(`/api/conversations/${activeConv.id}/reopen`);
    const convRes = await api.get<Conversation>(`/api/conversations/${activeConv.id}`);
    setActiveConv(convRes.data);
  };

  const handleCloseConv = async () => {
    if (!activeConv) return;
    await api.post(`/api/conversations/${activeConv.id}/close`);
    const convRes = await api.get<Conversation>(`/api/conversations/${activeConv.id}`);
    setActiveConv(convRes.data);
  };

  const handleReset = async () => {
    if (!submission) return;
    if (!window.confirm(t('reset_confirm'))) return;
    setResetLoading(true);
    try {
      await api.delete(`/api/submissions/${submission.id}`);
      setSubmission(null);
      setVersions([]);
      setSelectedVersion(0);
      setConversations([]);
      setActiveConv(null);
    } finally {
      setResetLoading(false);
    }
  };

  const navigateToStudent = (student: StudentRef) => {
    navigate(`/exercise/${exerciseId}/review/${student.userId}`, {
      state: { classId, students: state.students },
    });
  };

  if (!exercise) return <div style={{ padding: 20 }}>{t('loading')}</div>;

  const currentCode = versions[selectedVersion]?.code ?? '';
  const studentName = studentFullName || sortedStudents[currentIndex]?.name || `#${userId}`;

  return (
    <div className="workspace" style={{ height: '100%' }}>
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <Link
            to={classId ? `/classes/${classId}/progress` : '/classes'}
            style={{ color: 'var(--text-secondary)', fontSize: 13 }}
          >
            ← {t('class_progress')}
          </Link>
          <span className="exercise-title-bar">{t('review')}: {exercise.title}</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{studentName}</span>
          {submission && <span className={`status-dot ${submission.status}`} title={t(submission.status)} />}
        </div>
        <div className="toolbar-right">
          {sortedStudents.length > 0 && (
            <>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '3px 10px' }}
                disabled={currentIndex <= 0}
                title={t('prev_student')}
                onClick={() => navigateToStudent(sortedStudents[currentIndex - 1])}
              >
                ‹
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {currentIndex + 1}/{sortedStudents.length}
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '3px 10px' }}
                disabled={currentIndex >= sortedStudents.length - 1}
                title={t('next_student')}
                onClick={() => navigateToStudent(sortedStudents[currentIndex + 1])}
              >
                ›
              </button>
            </>
          )}
          {submission && (
            <>
              <button className="btn-success" onClick={() => handleOverride('teacher_correct')}>{t('mark_correct')}</button>
              <button className="btn-danger" onClick={() => handleOverride('teacher_incorrect')}>{t('mark_incorrect')}</button>
              <button
                className="btn-danger"
                style={{ fontSize: 12 }}
                onClick={handleReset}
                disabled={resetLoading}
                title={t('reset_student_data')}
              >
                🗑 Reset
              </button>
            </>
          )}
          {versions.length > 0 && (
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              style={{ fontSize: 12 }}
            >
              {versions.map((v, i) => (
                <option key={v.id} value={i}>
                  v{v.version_number} — {new Date(v.created_at).toLocaleString('ca')}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="workspace-main">
        <div className="workspace-left">
          <div className="panel-header">{t('description')}</div>
          <div className="description-panel">
            <MdRenderer>{exercise.description}</MdRenderer>
          </div>
          <div className="panel-header">
            {submission
              ? `Codi de l'alumne (v${versions[selectedVersion]?.version_number ?? '?'})`
              : t('no_submission')}
          </div>
          <div className="editor-area">
            {!submission ? (
              <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('no_submission')}
              </div>
            ) : currentCode === '' ? (
              <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('no_code_saved')}
              </div>
            ) : (
              <Editor
                height="100%"
                defaultLanguage="python"
                theme="vs-dark"
                value={currentCode}
                options={{
                  readOnly: true,
                  fontSize: 14,
                  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="chat-sidebar">
          <div className="panel-header">
            {t('chat')}
            {conversations.length > 0 && (
              <select style={{ marginLeft: 8, fontSize: 11 }} value={activeConv?.id ?? ''} onChange={(e) => {
                const conv = conversations.find((c) => c.id === Number(e.target.value));
                if (conv) loadConversation(conv);
              }}>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'evaluate' ? t('evaluate') : t('help')} #{c.id}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {activeConv?.status === 'closed' && (
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={handleReopenConv}>
                  {t('reopen')}
                </button>
              )}
              {activeConv && activeConv.status !== 'closed' && (
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={handleCloseConv}>
                  {t('close_chat')}
                </button>
              )}
            </div>
          </div>

          <div className="chat-messages">
            {conversations.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('no_conversations')}
              </div>
            ) : (
              activeConv?.messages?.filter((m) => m.role !== 'system').map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                  {msg.role === 'teacher' && <div className="chat-badge">[Professor]</div>}
                  {msg.role === 'assistant' && <div className="chat-badge">[🤖]</div>}
                  <MdRenderer>{msg.content}</MdRenderer>
                  {msg.version && (
                    <button
                      className="btn-code-snapshot"
                      title={t('view_code_version')}
                      onClick={() => {
                        const idx = versions.findIndex((v) => v.id === msg.version!.id);
                        if (idx >= 0) {
                          setSelectedVersion(idx);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        marginTop: 4,
                        padding: '2px 7px',
                        fontSize: 11,
                        background: versions[selectedVersion]?.id === msg.version.id
                          ? 'var(--accent)'
                          : 'var(--bg-tertiary, #333)',
                        color: versions[selectedVersion]?.id === msg.version.id
                          ? '#fff'
                          : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      &lt;/&gt; v{msg.version.version_number}
                    </button>
                  )}
                </div>
              ))
            )}
            {chatLoading && <div className="chat-bubble assistant"><em>{t('loading')}</em></div>}
            <div ref={chatEndRef} />
          </div>

          {activeConv?.status === 'closed' && <div className="chat-status">{t('conversation_closed')}</div>}

          {activeConv && activeConv.status !== 'closed' && (
            <>
            <div className="chat-tip">{t('chat_bot_tip')}</div>
            <div className="chat-input-area">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendTeacherMessage();
                  }
                }}
                placeholder={t('input_placeholder')}
                disabled={chatLoading}
                rows={1}
              />
              <button className="btn-primary" onClick={handleSendTeacherMessage} disabled={chatLoading || !chatInput.trim()}>
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
