import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MdRenderer from '../components/MdRenderer';
import api from '../api/client';
import type { Material } from '../types';
import './Admin.css';

export default function MaterialForm() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    title: '',
    description: '',
    content: '',
  });

  const savedForm = useRef(form);
  const isDirty = useCallback(
    () => JSON.stringify(form) !== JSON.stringify(savedForm.current),
    [form]
  );

  useEffect(() => {
    if (!materialId) return;
    api.get<Material>(`/api/materials/${materialId}`).then((r) => {
      const loaded = {
        title: r.data.title,
        description: r.data.description,
        content: r.data.content || '',
      };
      setForm(loaded);
      savedForm.current = loaded;
    });
  }, [materialId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSave = async () => {
    await api.put(`/api/materials/${materialId}`, form);
    savedForm.current = form;
    navigate(-1);
  };

  const handleBack = () => {
    if (isDirty() && !confirm("Hi ha canvis sense desar. Vols sortir igualment?")) return;
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminar el material "${form.title}"?`)) return;
    await api.delete(`/api/materials/${materialId}`);
    navigate(-1);
  };

  return (
    <div className="admin-page" style={{ maxWidth: '100%' }}>
      <div className="class-detail-header">
        <Link to="#" onClick={(e) => { e.preventDefault(); handleBack(); }} style={{ color: 'var(--text-secondary)' }}>
          ← {t('back')}
        </Link>
        <h2>{t('edit')} {t('materials')}</h2>
        <button className="btn-danger" style={{ marginLeft: 'auto' }} onClick={handleDelete}>{t('delete')}</button>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{t('title')}</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{t('description')}</label>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <div className="exercise-form-body" style={{ minHeight: 360 }}>
          <div className="exercise-form-col">
            <label className="form-label">Markdown</label>
            <textarea
              className="exercise-desc-textarea"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="## Material\n\nEscriu contingut en **Markdown**..."
              style={{ minHeight: 360 }}
            />
          </div>
          <div className="exercise-form-col">
            <label className="form-label">Previsualització</label>
            <div className="markdown-preview" style={{ minHeight: 360 }}>
              <MdRenderer>{form.content || '*Cap contingut encara...*'}</MdRenderer>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={() => navigate(-1)}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave}>{t('save')}</button>
      </div>
    </div>
  );
}
