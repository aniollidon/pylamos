import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (!user) return null;

  const isTeacher = user.role === 'teacher' || user.role === 'admin';

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span>py</span>lamos
      </div>
      <div className="navbar-nav">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          {t('dashboard')}
        </Link>
        {isTeacher && (
          <>
            <Link to="/classes" className={location.pathname.startsWith('/classes') ? 'active' : ''}>
              {t('classes')}
            </Link>
            <Link to="/users" className={location.pathname.startsWith('/users') ? 'active' : ''}>
              {t('users')}
            </Link>
          </>
        )}
      </div>
      <div className="navbar-user">
        <span>{user.full_name} ({user.role})</span>
        <button onClick={logout}>{t('logout')}</button>
      </div>
    </nav>
  );
}
