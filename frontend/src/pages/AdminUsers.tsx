import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';
import './Admin.css';

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'student' as const, language: 'ca' });

  const load = () => api.get<User[]>('/api/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm({ username: '', full_name: '', password: '', role: 'student', language: 'ca' });
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ username: u.username, full_name: u.full_name, password: '', role: u.role as any, language: u.language });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editUser) {
      const body: any = { full_name: form.full_name, role: form.role, language: form.language };
      if (form.password) body.password = form.password;
      await api.put(`/api/users/${editUser.id}`, body);
    } else {
      await api.post('/api/users', form);
    }
    setShowModal(false);
    load();
  };

  const handlePurgeUserData = async (u: User) => {
    const confirmed = window.confirm(
      `Vols esborrar totes les dades d'aprenentatge de ${u.full_name}?\n\n` +
      'Això eliminarà submissions, versions, xats i progrés de temes desbloquejats.'
    );
    if (!confirmed) return;

    await api.delete(`/api/users/${u.id}/student-data`);
    load();
  };

  const handleDeleteUser = async (u: User) => {
    const confirmed = window.confirm(
      `Vols eliminar l'usuari ${u.full_name} (@${u.username})?\n\n` +
      'Aquesta accio no es pot desfer.'
    );
    if (!confirmed) return;

    try {
      await api.delete(`/api/users/${u.id}`);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No s\'ha pogut eliminar l\'usuari';
      window.alert(message);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <h2>{t('users')}</h2>
        <button className="btn-primary" onClick={openCreate}>+ {t('create')}</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>{t('username')}</th>
            <th>{t('full_name')}</th>
            <th>{t('role')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.full_name}</td>
              <td>{t(u.role)}</td>
              <td className="actions">
                <button className="btn-secondary" onClick={() => openEdit(u)}>{t('edit')}</button>
                <button
                  className="btn-secondary"
                  onClick={() => handlePurgeUserData(u)}
                  style={{ color: '#ff8a8a' }}
                >
                  Neteja dades
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => handleDeleteUser(u)}
                  disabled={currentUser?.id === u.id}
                  title={currentUser?.id === u.id ? 'No et pots eliminar a tu mateix' : ''}
                  style={{ color: '#ff8a8a' }}
                >
                  {t('delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editUser ? t('edit') : t('create')} {t('student')}</h3>
            <div className="form-group">
              <label>{t('username')}</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editUser} />
            </div>
            <div className="form-group">
              <label>{t('full_name')}</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t('password')}{editUser ? ' (deixa buit per no canviar)' : ''}</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t('role')}</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
                <option value="student">{t('student')}</option>
                <option value="teacher">{t('teacher')}</option>
                <option value="admin">{t('admin')}</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleSave}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
