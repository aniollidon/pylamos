import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { Class } from '../types';
import './Admin.css';

export default function ClassList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');

  const load = () => api.get<Class[]>('/api/classes').then((r) => setClasses(r.data));
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await api.post('/api/classes', { name });
    setShowModal(false);
    setName('');
    load();
  };

  const handleDelete = async (cls: Class) => {
    const confirmed = window.confirm(`Vols eliminar la classe "${cls.name}"?`);
    if (!confirmed) return;
    await api.delete(`/api/classes/${cls.id}`);
    load();
  };

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <h2>{t('classes')}</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ {t('create')}</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>{t('name')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/classes/${c.id}`}>{c.name}</Link></td>
              <td className="actions">
                <Link to={`/classes/${c.id}`}><button className="btn-secondary">{t('edit')}</button></Link>
                {user?.role === 'admin' && (
                  <button className="btn-danger" onClick={() => void handleDelete(c)}>{t('delete')}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('create')} {t('class')}</h3>
            <div className="form-group">
              <label>{t('name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleCreate}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
