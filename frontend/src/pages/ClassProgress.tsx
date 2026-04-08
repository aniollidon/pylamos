import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import './Admin.css';

interface ExerciseEntry {
  exercise_id: number;
  title: string;
  order_index?: number;
  status: string;
}

interface MaterialEntry {
  material_id: number;
  title: string;
  order_index?: number;
  status: string;
}

interface TopicsProgressData {
  topics: { id: number; name: string }[];
  students: {
    user_id: number;
    full_name: string;
    username: string;
    topics: Record<string, { exercises: ExerciseEntry[]; materials: MaterialEntry[] }>;
  }[];
}

export default function ClassProgress() {
  const { classId } = useParams<{ classId: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<TopicsProgressData | null>(null);

  useEffect(() => {
    const fetchData = () => {
      api.get<TopicsProgressData>(`/api/classes/${classId}/progress/topics`)
        .then((r) => setData(r.data));
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [classId]);

  if (!data) return <div style={{ padding: 20 }}>{t('loading')}</div>;

  return (
    <div className="admin-page" style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <div className="class-detail-header">
        <Link to={`/classes/${classId}`} style={{ color: 'var(--text-secondary)' }}>← {t('class')}</Link>
        <h2>{t('class_progress')}</h2>
      </div>

      <table className="data-table progress-table">
        <thead>
          <tr>
            <th style={{ minWidth: 140 }}>{t('student')}</th>
            {data.topics.map((topic) => (
              <th key={topic.id} title={topic.name} style={{ textAlign: 'center', minWidth: 80 }}>
                {topic.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.students.map((student) => (
            <tr key={student.user_id}>
              <td>{student.full_name}</td>
              {data.topics.map((topic) => {
                const topicData = student.topics[String(topic.id)] || { exercises: [], materials: [] };
                const exercises = topicData.exercises;
                const materials = topicData.materials;
                const items = [
                  ...exercises.map((ex) => ({
                    key: `ex-${ex.exercise_id}`,
                    title: ex.title,
                    status: ex.status,
                    to: `/exercise/${ex.exercise_id}/review/${student.user_id}`,
                    state: {
                      classId: Number(classId),
                      students: data.students.map((s) => ({ userId: s.user_id, name: s.full_name })),
                    },
                    order_index: ex.order_index ?? Number.MAX_SAFE_INTEGER,
                  })),
                  ...materials.map((mat) => ({
                    key: `mat-${mat.material_id}`,
                    title: mat.title,
                    status: mat.status,
                    to: `/material/${mat.material_id}`,
                    state: undefined,
                    order_index: mat.order_index ?? Number.MAX_SAFE_INTEGER,
                  })),
                ].sort((a, b) => a.order_index - b.order_index || a.key.localeCompare(b.key));
                return (
                  <td key={topic.id} style={{ textAlign: 'center', padding: '6px 10px' }}>
                    <span className="progress-dots-cell">
                      {items.length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>—</span>
                      ) : (
                        <>
                          {items.map((item) => (
                            <Link
                              key={item.key}
                              to={item.to}
                              state={item.state}
                              title={`${item.title}: ${t(item.status)}`}
                            >
                              <span className={`status-dot ${item.status}`} />
                            </Link>
                          ))}
                        </>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
