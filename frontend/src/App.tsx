import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import AdminUsers from './pages/AdminUsers';
import ClassList from './pages/ClassList';
import ClassDetail from './pages/ClassDetail';
import ClassProgress from './pages/ClassProgress';
import ExerciseForm from './pages/ExerciseForm';
import MaterialForm from './pages/MaterialForm';
import TeacherReview from './pages/TeacherReview';
import MaterialView from './pages/MaterialView';

const INTERNAL_CLIPBOARD_MARK = '   ';

function getSelectedTextFromTarget(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(start, end);
  }

  if (target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(start, end);
  }

  return '';
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, color: '#ccc' }}>Carregant...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function TeacherRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && (user.role === 'teacher' || user.role === 'admin')) return <>{children}</>;
  return <Navigate to="/" replace />;
}

export default function App() {
  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;

      const selectionText = window.getSelection()?.toString() ?? '';
      const targetText = getSelectedTextFromTarget(event.target);
      const copiedText = selectionText || targetText;

      if (!copiedText) return;

      event.preventDefault();
      event.clipboardData.setData('text/plain', `${copiedText}${INTERNAL_CLIPBOARD_MARK}`);
    };

    document.addEventListener('copy', handleCopy, true);
    return () => {
      document.removeEventListener('copy', handleCopy, true);
    };
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<TeacherRoute><ClassList /></TeacherRoute>} />
        <Route path="classes/:classId" element={<TeacherRoute><ClassDetail /></TeacherRoute>} />
        <Route path="classes/:classId/progress" element={<TeacherRoute><ClassProgress /></TeacherRoute>} />
        <Route path="users" element={<TeacherRoute><AdminUsers /></TeacherRoute>} />
        <Route path="exercises/:exerciseId/edit" element={<TeacherRoute><ExerciseForm /></TeacherRoute>} />
        <Route path="materials/:materialId/edit" element={<TeacherRoute><MaterialForm /></TeacherRoute>} />
        <Route path="exercise/:exerciseId/review/:userId" element={<TeacherRoute><TeacherReview /></TeacherRoute>} />
      </Route>
      <Route path="/exercise/:exerciseId" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
      <Route path="/material/:materialId" element={<ProtectedRoute><MaterialView /></ProtectedRoute>} />
    </Routes>
  );
}
