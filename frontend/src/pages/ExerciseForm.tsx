import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import MdRenderer from '../components/MdRenderer';
import api from '../api/client';
import type { Exercise } from '../types';
import './Admin.css';

export default function ExerciseForm() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const configureEditorTheme = useCallback((monaco: any) => {
    monaco.editor.defineTheme('pylamos-editable', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#2d2d2d',
        'editorGutter.background': '#2d2d2d',
        'minimap.background': '#2d2d2d',
      },
    });
  }, []);

  const [form, setForm] = useState({
    title: '',
    description: '',
    solution: '',
    system_prompt_override: '',
  });
  const savedForm = useRef(form);
  const isDirty = useCallback(
    () => JSON.stringify(form) !== JSON.stringify(savedForm.current),
    [form]
  );

  useEffect(() => {
    if (!exerciseId) return;
    api.get<Exercise>(`/api/exercises/${exerciseId}`).then((r) => {
      const loaded = {
        title: r.data.title,
        description: r.data.description,
        solution: r.data.solution || '',
        system_prompt_override: r.data.system_prompt_override || '',
      };
      setForm(loaded);
      savedForm.current = loaded;
    });
  }, [exerciseId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSave = async () => {
    await api.put(`/api/exercises/${exerciseId}`, form);
    savedForm.current = form;
    navigate(-1);
  };

  const handleBack = () => {
    if (isDirty() && !confirm('Hi ha canvis sense desar. Vols sortir igualment?')) return;
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminar l'exercici "${form.title}"?`)) return;
    await api.delete(`/api/exercises/${exerciseId}`);
    navigate(-1);
  };

  return (
    <div className="admin-page" style={{ maxWidth: '100%' }}>
      <div className="class-detail-header">
        <Link to="#" onClick={(e) => { e.preventDefault(); handleBack(); }} style={{ color: 'var(--text-secondary)' }}>← {t('back')}</Link>
        <h2>{t('edit')} {t('exercise')}</h2>
        <button className="btn-danger" style={{ marginLeft: 'auto' }} onClick={handleDelete}>{t('delete')}</button>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{t('title')}</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <div className="exercise-form-body" style={{ minHeight: 300 }}>
          <div className="exercise-form-col">
            <label className="form-label">{t('description')} (Markdown)</label>
            <textarea
              className="exercise-desc-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="## Enunciat&#10;&#10;Escriu la descripció en **Markdown**..."
              style={{ minHeight: 300 }}
            />
          </div>
          <div className="exercise-form-col">
            <label className="form-label">Previsualització</label>
            <div className="markdown-preview exercise-markdown-preview" style={{ minHeight: 300 }}>
              <MdRenderer>{form.description || '*Cap contingut encara...*'}</MdRenderer>
            </div>
          </div>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{t('solution')} (Python)</label>
        <div style={{ height: 280, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
          <Editor
            beforeMount={configureEditorTheme}
            height="100%"
            defaultLanguage="python"
            theme="pylamos-editable"
            value={form.solution}
            onChange={(v) => setForm({ ...form, solution: v || '' })}
            options={{
              fontSize: 14,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: 'on',
            }}
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>Instruccions addicionals per al LLM (opcional — s'afegeixen al prompt base)</label>
        <textarea
          style={{ width: '100%', minHeight: 80, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
          value={form.system_prompt_override}
          onChange={(e) => setForm({ ...form, system_prompt_override: e.target.value })}
          placeholder="Instruccions personalitzades per al LLM en aquest exercici..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={() => navigate(-1)}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave}>{t('save')}</button>
      </div>
    </div>
  );
}
