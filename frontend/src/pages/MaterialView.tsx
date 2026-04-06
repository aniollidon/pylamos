import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MdRenderer from '../components/MdRenderer';
import api from '../api/client';
import type { Material } from '../types';
import './Workspace.css';
import './MaterialView.css';

interface MaterialReadStatus {
  material_id: number;
  user_id: number;
  read: boolean;
  read_at: string | null;
}

export default function MaterialView() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [material, setMaterial] = useState<Material | null>(null);
  const [readStatus, setReadStatus] = useState<MaterialReadStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!materialId) return;
    Promise.all([
      api.get<Material>(`/api/materials/${materialId}`),
      api.get<MaterialReadStatus>(`/api/materials/${materialId}/read`),
    ]).then(([matRes, readRes]) => {
      setMaterial(matRes.data);
      setReadStatus(readRes.data);
    }).finally(() => setLoading(false));
  }, [materialId]);

  const handleMarkRead = async () => {
    if (!materialId || readStatus?.read) return;
    setSaving(true);
    try {
      const res = await api.post<MaterialReadStatus>(`/api/materials/${materialId}/read`);
      setReadStatus(res.data);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>{t('loading')}</div>;
  }

  if (!material) {
    return <div style={{ padding: 20 }}>Material no trobat</div>;
  }

  return (
    <div className="material-workspace">
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← {t('dashboard')}</Link>
          <span className="exercise-title-bar">{material.title}</span>
          <span className={`status-dot ${readStatus?.read ? 'read' : 'not_read'}`} title={readStatus?.read ? t('read') : t('not_read')} />
        </div>
        <div className="toolbar-right">
          <button className="btn-secondary" onClick={() => navigate(-1)}>{t('back')}</button>
        </div>
      </div>

      <div className="material-view-page">
        <article className="material-article">
          {material.description && <p className="material-description">{material.description}</p>}
          <MdRenderer>{material.content || ''}</MdRenderer>
        </article>

        <div className="material-footer-action">
          <button
            className={readStatus?.read ? 'btn-success' : 'btn-primary'}
            onClick={handleMarkRead}
            disabled={Boolean(readStatus?.read) || saving}
          >
            {readStatus?.read ? t('marked_as_read') : t('mark_as_read')}
          </button>
        </div>
      </div>
    </div>
  );
}
