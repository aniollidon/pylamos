import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import type { Class, TopicProgress } from '../types';
import './Dashboard.css';

export default function Dashboard() {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [progress, setProgress] = useState<TopicProgress[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Class[]>('/api/classes').then((res) => {
      setClasses(res.data);
      if (res.data.length > 0) setSelectedClass(res.data[0].id);
      setLoading(false);
    }).catch((err) => {
      console.error('[Dashboard] Error carregant classes', err);
      setLoadError(t('dashboard_load_error'));
      setLoading(false);
    });
  }, [t]);

  useEffect(() => {
    if (selectedClass) {
      api.get<TopicProgress[]>(`/api/classes/${selectedClass}/progress`).then((res) => {
        setProgress(res.data);
        // Auto-expand all unlocked topics so exercises are visible
        const unlockedIds = res.data.filter((tp) => tp.unlocked).map((tp) => tp.topic_id);
        setExpandedTopics(new Set(unlockedIds));
        setLoadError(null);
      }).catch((err) => {
        console.error('[Dashboard] Error carregant progrés', err);
        setLoadError(t('dashboard_load_error'));
        setProgress([]);
      });
    }
  }, [selectedClass, t]);

  const toggleTopic = (topicId: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const getTopicBadge = (topic: TopicProgress) => {
    const allItems = [
      ...topic.exercises.map((ex) => ({
        key: `exercise-${ex.exercise_id}`,
        status: ex.status,
        order_index: ex.order_index ?? Number.MAX_SAFE_INTEGER,
      })),
      ...topic.materials.map((mat) => ({
        key: `material-${mat.material_id}`,
        status: mat.status,
        order_index: mat.order_index ?? Number.MAX_SAFE_INTEGER,
      })),
    ].sort((a, b) => a.order_index - b.order_index || a.key.localeCompare(b.key));
    if (allItems.length === 0) return null;
    return (
      <span className="topic-progress-dots">
        {allItems.map((item) => (
          <span
            key={item.key}
            className={`status-dot ${topic.unlocked ? item.status : 'not_read'}`}
            title={t(item.status)}
          />
        ))}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="dashboard">
        <h2>{t('dashboard')}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 24 }}>{t('loading')}</p>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="dashboard">
        <h2>{t('dashboard')}</h2>
        <div className="dashboard-empty">
          <span>📋</span>
          <p>{t('no_classes_assigned')}</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard">
        <h2>{t('dashboard')}</h2>
        <div className="dashboard-empty">
          <span>⚠️</span>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>{t('dashboard')}</h2>

      {classes.length > 1 && (
        <div className="class-select">
          <select value={selectedClass ?? ''} onChange={(e) => setSelectedClass(Number(e.target.value))}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {progress.map((topic) => (
        <div key={topic.topic_id} className={`topic-card ${!topic.unlocked ? 'locked' : ''}`}>
          <div className="topic-header" onClick={() => topic.unlocked && toggleTopic(topic.topic_id)}>
            <span className="topic-name">
              {expandedTopics.has(topic.topic_id) ? '▾' : '▸'} {topic.name}
            </span>
            {getTopicBadge(topic)}
          </div>
          {expandedTopics.has(topic.topic_id) && topic.unlocked && (
            <div className="exercise-list">
              {[...
                topic.exercises.map((ex) => ({
                  key: `exercise-${ex.exercise_id}`,
                  title: ex.title,
                  status: ex.status,
                  order_index: ex.order_index ?? Number.MAX_SAFE_INTEGER,
                  to: `/exercise/${ex.exercise_id}`,
                })),
                ...topic.materials.map((mat) => ({
                  key: `material-${mat.material_id}`,
                  title: mat.title,
                  status: mat.status,
                  order_index: mat.order_index ?? Number.MAX_SAFE_INTEGER,
                  to: `/material/${mat.material_id}`,
                })),
              ].sort((a, b) => a.order_index - b.order_index || a.key.localeCompare(b.key)).map((item) => (
                <div key={item.key} className="exercise-item">
                  <span className="exercise-title">
                    <Link to={item.to}>{item.title}</Link>
                  </span>
                  <span className={`status-dot ${item.status}`} title={t(item.status)} />
                </div>
              ))}
              {topic.exercises.length === 0 && topic.materials.length === 0 && (
                <div className="exercise-item">
                  <span className="exercise-title" style={{ color: 'var(--text-secondary)' }}>
                    {t('no_items')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
