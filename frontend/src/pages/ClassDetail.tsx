import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../api/client';
import type { Class, ClassMember, Topic, Exercise, Material, User } from '../types';
import ActionMenu from '../components/ActionMenu';
import './Admin.css';

// ── Sortable exercise row ─────────────────────────────────────────────────────

interface SortableExerciseProps {
  exercise: Exercise;
  onMove: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
}

function SortableExercise({ exercise, onMove, onDelete, onToggleVisibility }: SortableExerciseProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `exercise-${exercise.id}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="exercise-row">
      <span className="drag-handle" {...attributes} {...listeners} title="Arrossega per reordenar">⠿</span>
      <Link className="row-title-button" to={`/exercises/${exercise.id}/edit`} style={{ flex: 1 }}>
        {exercise.title} {exercise.is_hidden ? <span className="visibility-badge">(ocult)</span> : null}
      </Link>
      <ActionMenu
        items={[
          { label: exercise.is_hidden ? t('show_to_students') : t('hide_from_students'), onClick: onToggleVisibility },
          { label: 'Mou', onClick: onMove },
          { label: 'Elimina', danger: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}

interface SortableMaterialProps {
  material: Material;
  onMove: () => void;
  onDelete: () => void;
}

function SortableMaterial({ material, onMove, onDelete }: SortableMaterialProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `material-${material.id}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="exercise-row">
      <span className="drag-handle" {...attributes} {...listeners} title="Arrossega per reordenar">⠿</span>
      <Link className="row-title-button" to={`/materials/${material.id}/edit`} style={{ flex: 1 }}>
        {material.title}
      </Link>
      <ActionMenu
        items={[
          { label: 'Mou', onClick: onMove },
          { label: 'Elimina', danger: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}

// ── Sortable topic section ────────────────────────────────────────────────────

interface SortableTopicProps {
  topic: Topic;
  exercises: Exercise[];
  materials: Material[];
  onEditTopic: () => void;
  onDeleteTopic: () => void;
  onToggleTopicVisibility: () => void;
  onUnlockModeChange: (mode: string) => void;
  onAddExercise: () => void;
  onAddMaterial: () => void;
  onImportExercise: () => void;
  onItemsDragEnd: (event: DragEndEvent) => void;
  onMoveExercise: (ex: Exercise) => void;
  onMoveMaterial: (mat: Material) => void;
  onDeleteExercise: (id: number) => void;
  onToggleExerciseVisibility: (ex: Exercise) => void;
  onDeleteMaterial: (id: number) => void;
}

function SortableTopic({
  topic, exercises, materials,
  onEditTopic, onDeleteTopic, onToggleTopicVisibility, onUnlockModeChange,
  onAddExercise, onAddMaterial, onImportExercise,
  onItemsDragEnd, onMoveExercise, onMoveMaterial, onDeleteExercise, onToggleExerciseVisibility, onDeleteMaterial,
}: SortableTopicProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const items = [
    ...exercises.map((ex) => ({
      key: `exercise-${ex.id}`,
      kind: 'exercise' as const,
      id: ex.id,
      title: ex.title,
      order_index: ex.order_index,
      exercise: ex,
    })),
    ...materials.map((mat) => ({
      key: `material-${mat.id}`,
      kind: 'material' as const,
      id: mat.id,
      title: mat.title,
      order_index: mat.order_index,
      material: mat,
    })),
  ].sort((a, b) => a.order_index - b.order_index || a.key.localeCompare(b.key));

  return (
    <div ref={setNodeRef} style={style} className="topic-section">
      <div className="topic-section-header">
        <span className="drag-handle topic-drag-handle" {...attributes} {...listeners} title="Arrossega per reordenar">⠿</span>
        <h4 style={{ flex: 1 }}>
          {topic.name} {topic.is_hidden ? <span className="visibility-badge">(ocult)</span> : null}
        </h4>
        <select
          className="unlock-mode-select"
          value={topic.unlock_mode || 'auto'}
          onChange={(e) => onUnlockModeChange(e.target.value)}
          title="Mode d'accés"
        >
          <option value="auto">{t('unlock_mode_auto')}</option>
          <option value="open">{t('unlock_mode_open')}</option>
          <option value="locked">{t('unlock_mode_locked')}</option>
        </select>
        <div className="actions">
          <button className="btn-primary" onClick={onAddExercise}>+ {t('add_exercise')}</button>
          <button className="btn-primary" onClick={onAddMaterial}>+ {t('add_material')}</button>
          <ActionMenu
            items={[
              { label: topic.is_hidden ? t('show_to_students') : t('hide_from_students'), onClick: onToggleTopicVisibility },
              { label: t('edit'), onClick: onEditTopic },
              { label: t('import_exercise'), onClick: onImportExercise },
              { label: t('delete'), danger: true, onClick: onDeleteTopic },
            ]}
          />
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemsDragEnd}>
        <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            item.kind === 'exercise' ? (
              <SortableExercise
                key={item.key}
                exercise={item.exercise}
                onMove={() => onMoveExercise(item.exercise)}
                onDelete={() => onDeleteExercise(item.id)}
                onToggleVisibility={() => onToggleExerciseVisibility(item.exercise)}
              />
            ) : (
              <SortableMaterial
                key={item.key}
                material={item.material}
                onMove={() => onMoveMaterial(item.material)}
                onDelete={() => onDeleteMaterial(item.id)}
              />
            )
          ))}
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <div className="exercise-row" style={{ color: 'var(--text-secondary)' }}>{t('no_items')}</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [cls, setCls] = useState<Class | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [exercisesByTopic, setExercisesByTopic] = useState<Record<number, Exercise[]>>({});
  const [materialsByTopic, setMaterialsByTopic] = useState<Record<number, Material[]>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Modals
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [showEditClass, setShowEditClass] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [showEditTopic, setShowEditTopic] = useState<number | null>(null);
  const [editTopicName, setEditTopicName] = useState('');
  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);
  const [newExTitle, setNewExTitle] = useState('');
  const [showMoveExercise, setShowMoveExercise] = useState<number | null>(null);
  const [showMoveMaterial, setShowMoveMaterial] = useState<number | null>(null);
  const [moveTargetTopicId, setMoveTargetTopicId] = useState<number>(0);
  const [showAddMaterial, setShowAddMaterial] = useState<number | null>(null);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');

  const [showImportTopic, setShowImportTopic] = useState(false);
  const [sourceClassIdForTopic, setSourceClassIdForTopic] = useState<number>(0);
  const [sourceTopicIdForTopic, setSourceTopicIdForTopic] = useState<number>(0);

  const [showImportExercise, setShowImportExercise] = useState<number | null>(null);
  const [sourceClassIdForExercise, setSourceClassIdForExercise] = useState<number>(0);
  const [sourceTopicIdForExercise, setSourceTopicIdForExercise] = useState<number>(0);
  const [sourceExerciseId, setSourceExerciseId] = useState<number>(0);

  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [sourceTopics, setSourceTopics] = useState<Topic[]>([]);
  const [sourceExercises, setSourceExercises] = useState<Exercise[]>([]);

  const topicSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadAll = async () => {
    if (!classId) return;
    const [clsRes, membersRes, topicsRes] = await Promise.all([
      api.get<Class>(`/api/classes/${classId}`),
      api.get<ClassMember[]>(`/api/classes/${classId}/members`),
      api.get<Topic[]>(`/api/classes/${classId}/topics`),
    ]);
    setCls(clsRes.data);
    setMembers(membersRes.data);
    setTopics(topicsRes.data);

    const exMap: Record<number, Exercise[]> = {};
    const matMap: Record<number, Material[]> = {};
    for (const topic of topicsRes.data) {
      const [exRes, matRes] = await Promise.all([
        api.get<Exercise[]>(`/api/topics/${topic.id}/exercises`),
        api.get<Material[]>(`/api/topics/${topic.id}/materials`),
      ]);
      exMap[topic.id] = exRes.data;
      matMap[topic.id] = matRes.data;
    }
    setExercisesByTopic(exMap);
    setMaterialsByTopic(matMap);
  };

  useEffect(() => { loadAll(); }, [classId]);

  // ── Topic drag-and-drop ──
  const handleTopicDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = topics.findIndex((t) => t.id === active.id);
    const newIndex = topics.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(topics, oldIndex, newIndex);
    setTopics(reordered);
    await api.put(`/api/classes/${classId}/topics/reorder`, { topic_ids: reordered.map((t) => t.id) });
  };

  // ── Mixed item drag-and-drop (per topic) ──
  const handleItemsDragEnd = (topicId: number) => async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const exercises = exercisesByTopic[topicId] || [];
    const materials = materialsByTopic[topicId] || [];
    const merged = [
      ...exercises.map((ex) => ({ key: `exercise-${ex.id}`, kind: 'exercise' as const, id: ex.id, order_index: ex.order_index })),
      ...materials.map((mat) => ({ key: `material-${mat.id}`, kind: 'material' as const, id: mat.id, order_index: mat.order_index })),
    ].sort((a, b) => a.order_index - b.order_index || a.key.localeCompare(b.key));

    const oldIndex = merged.findIndex((item) => item.key === String(active.id));
    const newIndex = merged.findIndex((item) => item.key === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(merged, oldIndex, newIndex);
    const nextExercises = [...exercises];
    const nextMaterials = [...materials];
    const exerciseMap = new Map(nextExercises.map((ex) => [ex.id, ex]));
    const materialMap = new Map(nextMaterials.map((mat) => [mat.id, mat]));

    await Promise.all(reordered.map((item, idx) => {
      if (item.kind === 'exercise') {
        const ex = exerciseMap.get(item.id);
        if (ex) ex.order_index = idx;
        return api.put(`/api/exercises/${item.id}`, { order_index: idx });
      }
      const mat = materialMap.get(item.id);
      if (mat) mat.order_index = idx;
      return api.put(`/api/materials/${item.id}`, { order_index: idx });
    }));

    setExercisesByTopic((prev) => ({
      ...prev,
      [topicId]: nextExercises.sort((a, b) => a.order_index - b.order_index || a.id - b.id),
    }));
    setMaterialsByTopic((prev) => ({
      ...prev,
      [topicId]: nextMaterials.sort((a, b) => a.order_index - b.order_index || a.id - b.id),
    }));
  };

  // ── Unlock mode ──
  const handleUnlockModeChange = async (topicId: number, mode: string) => {
    setTopics((prev) => prev.map((t) => t.id === topicId ? { ...t, unlock_mode: mode } : t));
    await api.put(`/api/topics/${topicId}`, { unlock_mode: mode });
  };

  const handleToggleTopicVisibility = async (topic: Topic) => {
    const nextHidden = !topic.is_hidden;
    setTopics((prev) => prev.map((t) => t.id === topic.id ? { ...t, is_hidden: nextHidden } : t));
    await api.put(`/api/topics/${topic.id}`, { is_hidden: nextHidden });
  };

  const handleToggleExerciseVisibility = async (exercise: Exercise) => {
    const nextHidden = !exercise.is_hidden;
    setExercisesByTopic((prev) => ({
      ...prev,
      [exercise.topic_id]: (prev[exercise.topic_id] || []).map((ex) => (
        ex.id === exercise.id ? { ...ex, is_hidden: nextHidden } : ex
      )),
    }));
    await api.put(`/api/exercises/${exercise.id}`, { is_hidden: nextHidden });
  };

  // ── Members ──
  const handleAddMember = async () => {
    await api.post(`/api/classes/${classId}/members`, { user_id: selectedUserId, role: 'student' });
    setShowAddMember(false);
    loadAll();
  };

  const handleRemoveMember = async (userId: number) => {
    await api.delete(`/api/classes/${classId}/members/${userId}`);
    loadAll();
  };

  // ── Class ──
  const handleEditClass = async () => {
    if (!editClassName.trim()) return;
    await api.put(`/api/classes/${classId}`, { name: editClassName.trim() });
    setShowEditClass(false);
    loadAll();
  };

  // ── Topics CRUD ──
  const handleAddTopic = async () => {
    await api.post(`/api/classes/${classId}/topics`, { name: topicName, order_index: topics.length });
    setShowAddTopic(false);
    setTopicName('');
    loadAll();
  };

  const handleEditTopic = async () => {
    if (showEditTopic === null || !editTopicName.trim()) return;
    await api.put(`/api/topics/${showEditTopic}`, { name: editTopicName.trim() });
    setShowEditTopic(null);
    setEditTopicName('');
    loadAll();
  };

  const handleDeleteTopic = async (topicId: number) => {
    if (!confirm('Eliminar aquest tema i tots els seus exercicis?')) return;
    await api.delete(`/api/topics/${topicId}`);
    loadAll();
  };

  // ── Exercises CRUD ──
  const handleAddExercise = async () => {
    if (showAddExercise === null || !newExTitle.trim()) return;
    const res = await api.post<Exercise>(`/api/topics/${showAddExercise}/exercises`, {
      title: newExTitle.trim(),
      description: '',
      solution: '',
    });
    setShowAddExercise(null);
    setNewExTitle('');
    navigate(`/exercises/${res.data.id}/edit`);
  };

  const handleDeleteExercise = async (exerciseId: number) => {
    if (!confirm('Eliminar aquest exercici?')) return;
    await api.delete(`/api/exercises/${exerciseId}`);
    loadAll();
  };

  const handleMoveExercise = async () => {
    if (showMoveExercise === null || !moveTargetTopicId) return;
    await api.put(`/api/exercises/${showMoveExercise}`, { topic_id: moveTargetTopicId });
    setShowMoveExercise(null);
    setMoveTargetTopicId(0);
    loadAll();
  };

  const handleMoveMaterial = async () => {
    if (showMoveMaterial === null || !moveTargetTopicId) return;
    await api.put(`/api/materials/${showMoveMaterial}`, { topic_id: moveTargetTopicId });
    setShowMoveMaterial(null);
    setMoveTargetTopicId(0);
    loadAll();
  };

  const handleAddMaterial = async () => {
    if (showAddMaterial === null || !newMaterialTitle.trim()) return;
    const res = await api.post<Material>(`/api/topics/${showAddMaterial}/materials`, {
      title: newMaterialTitle.trim(),
      description: '',
      content: '',
    });
    setShowAddMaterial(null);
    setNewMaterialTitle('');
    navigate(`/materials/${res.data.id}/edit`);
  };

  const handleDeleteMaterial = async (materialId: number) => {
    if (!confirm('Eliminar aquest material?')) return;
    await api.delete(`/api/materials/${materialId}`);
    loadAll();
  };

  // ── Open helpers ──
  const openAddMember = async () => {
    const res = await api.get<User[]>('/api/users?role=student');
    setAllUsers(res.data);
    setShowAddMember(true);
  };

  const openEditTopic = (topic: Topic) => {
    setShowEditTopic(topic.id);
    setEditTopicName(topic.name);
  };

  const openMoveExercise = (exercise: Exercise) => {
    setShowMoveExercise(exercise.id);
    setMoveTargetTopicId(exercise.topic_id);
  };

  const openMoveMaterial = (material: Material) => {
    setShowMoveMaterial(material.id);
    setMoveTargetTopicId(material.topic_id);
  };

  const openImportTopic = async () => {
    const clsRes = await api.get<Class[]>('/api/classes');
    setAllClasses(clsRes.data.filter((c) => c.id !== Number(classId)));
    setSourceClassIdForTopic(0);
    setSourceTopicIdForTopic(0);
    setSourceTopics([]);
    setShowImportTopic(true);
  };

  const loadTopicsForTopicImport = async (sourceClassId: number) => {
    setSourceClassIdForTopic(sourceClassId);
    setSourceTopicIdForTopic(0);
    if (!sourceClassId) { setSourceTopics([]); return; }
    const topicsRes = await api.get<Topic[]>(`/api/classes/${sourceClassId}/topics`);
    setSourceTopics(topicsRes.data);
  };

  const handleImportTopic = async () => {
    if (!sourceTopicIdForTopic) return;
    await api.post(`/api/classes/${classId}/topics/import`, { source_topic_id: sourceTopicIdForTopic });
    setShowImportTopic(false);
    loadAll();
  };

  const openImportExercise = async (targetTopicId: number) => {
    const clsRes = await api.get<Class[]>('/api/classes');
    setAllClasses(clsRes.data.filter((c) => c.id !== Number(classId)));
    setShowImportExercise(targetTopicId);
    setSourceClassIdForExercise(0);
    setSourceTopicIdForExercise(0);
    setSourceExerciseId(0);
    setSourceTopics([]);
    setSourceExercises([]);
  };

  const loadTopicsForExerciseImport = async (sourceClassId: number) => {
    setSourceClassIdForExercise(sourceClassId);
    setSourceTopicIdForExercise(0);
    setSourceExerciseId(0);
    setSourceExercises([]);
    if (!sourceClassId) { setSourceTopics([]); return; }
    const topicsRes = await api.get<Topic[]>(`/api/classes/${sourceClassId}/topics`);
    setSourceTopics(topicsRes.data);
  };

  const loadExercisesForExerciseImport = async (sourceTopicId: number) => {
    setSourceTopicIdForExercise(sourceTopicId);
    setSourceExerciseId(0);
    if (!sourceTopicId) { setSourceExercises([]); return; }
    const exRes = await api.get<Exercise[]>(`/api/topics/${sourceTopicId}/exercises`);
    setSourceExercises(exRes.data);
  };

  const handleImportExercise = async () => {
    if (showImportExercise === null || !sourceExerciseId) return;
    await api.post(`/api/topics/${showImportExercise}/exercises/import`, { source_exercise_id: sourceExerciseId });
    setShowImportExercise(null);
    loadAll();
  };

  if (!cls) return <div style={{ padding: 20 }}>{t('loading')}</div>;

  return (
    <div className="admin-page">
      <div className="class-detail-header">
        <Link to="/classes" style={{ color: 'var(--text-secondary)' }}>← {t('classes')}</Link>
        <h2>{cls.name}</h2>
        <button className="btn-secondary" onClick={() => { setEditClassName(cls.name); setShowEditClass(true); }}>{t('edit')}</button>
        <Link to={`/classes/${classId}/progress`}>
          <button className="btn-secondary">{t('class_progress')}</button>
        </Link>
      </div>

      {/* Members */}
      <div className="section-title">{t('students')}</div>
      <table className="data-table">
        <thead>
          <tr><th>{t('username')}</th><th>{t('full_name')}</th><th>{t('role')}</th><th></th></tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.user_username}</td>
              <td>{m.user_full_name}</td>
              <td>{t(m.role)}</td>
              <td className="actions">
                <button className="btn-danger" onClick={() => handleRemoveMember(m.user_id)}>{t('remove_member')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-primary" style={{ marginTop: 8 }} onClick={openAddMember}>+ {t('add_member')}</button>

      {/* Topics + Exercises */}
      <div className="section-title">{t('topics')}</div>

      <DndContext sensors={topicSensors} collisionDetection={closestCenter} onDragEnd={handleTopicDragEnd}>
        <SortableContext items={topics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {topics.map((topic) => (
            <SortableTopic
              key={topic.id}
              topic={topic}
              exercises={exercisesByTopic[topic.id] || []}
              materials={materialsByTopic[topic.id] || []}
              onEditTopic={() => openEditTopic(topic)}
              onDeleteTopic={() => handleDeleteTopic(topic.id)}
              onToggleTopicVisibility={() => void handleToggleTopicVisibility(topic)}
              onUnlockModeChange={(mode) => handleUnlockModeChange(topic.id, mode)}
              onAddExercise={() => { setShowAddExercise(topic.id); setNewExTitle(''); }}
              onAddMaterial={() => { setShowAddMaterial(topic.id); setNewMaterialTitle(''); }}
              onImportExercise={() => void openImportExercise(topic.id)}
              onItemsDragEnd={handleItemsDragEnd(topic.id)}
              onMoveExercise={openMoveExercise}
              onMoveMaterial={openMoveMaterial}
              onDeleteExercise={handleDeleteExercise}
              onToggleExerciseVisibility={(exercise) => void handleToggleExerciseVisibility(exercise)}
              onDeleteMaterial={handleDeleteMaterial}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn-primary" onClick={() => setShowAddTopic(true)}>+ {t('add_topic')}</button>
        <button className="btn-secondary" onClick={() => void openImportTopic()}>Importa tema</button>
      </div>

      {/* Add member modal */}
      {showAddMember && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('add_member')}</h3>
            <div className="form-group">
              <label>{t('student')}</label>
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(Number(e.target.value))}>
                <option value={0}>--</option>
                {allUsers.filter((u) => !members.some((m) => m.user_id === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddMember(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleAddMember} disabled={!selectedUserId}>{t('add_member')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit class modal */}
      {showEditClass && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('edit')} {t('class')}</h3>
            <div className="form-group">
              <label>{t('name')}</label>
              <input value={editClassName} onChange={(e) => setEditClassName(e.target.value)} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleEditClass()} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditClass(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleEditClass} disabled={!editClassName.trim()}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add topic modal */}
      {showAddTopic && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('add_topic')}</h3>
            <div className="form-group">
              <label>{t('name')}</label>
              <input value={topicName} onChange={(e) => setTopicName(e.target.value)} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddTopic(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleAddTopic}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit topic modal */}
      {showEditTopic !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('edit')} {t('topic')}</h3>
            <div className="form-group">
              <label>{t('name')}</label>
              <input value={editTopicName} onChange={(e) => setEditTopicName(e.target.value)} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleEditTopic()} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditTopic(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleEditTopic} disabled={!editTopicName.trim()}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Move exercise modal */}
      {showMoveExercise !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Mou exercici a un altre tema</h3>
            <div className="form-group">
              <label>{t('topic')}</label>
              <select value={moveTargetTopicId} onChange={(e) => setMoveTargetTopicId(Number(e.target.value))}>
                <option value={0}>--</option>
                {topics.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMoveExercise(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleMoveExercise} disabled={!moveTargetTopicId}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Move material modal */}
      {showMoveMaterial !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Mou material a un altre tema</h3>
            <div className="form-group">
              <label>{t('topic')}</label>
              <select value={moveTargetTopicId} onChange={(e) => setMoveTargetTopicId(Number(e.target.value))}>
                <option value={0}>--</option>
                {topics.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMoveMaterial(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleMoveMaterial} disabled={!moveTargetTopicId}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import topic modal */}
      {showImportTopic && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Importa tema</h3>
            <div className="form-group">
              <label>{t('class')}</label>
              <select value={sourceClassIdForTopic} onChange={(e) => void loadTopicsForTopicImport(Number(e.target.value))}>
                <option value={0}>--</option>
                {allClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('topic')}</label>
              <select value={sourceTopicIdForTopic} onChange={(e) => setSourceTopicIdForTopic(Number(e.target.value))}>
                <option value={0}>--</option>
                {sourceTopics.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowImportTopic(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleImportTopic} disabled={!sourceTopicIdForTopic}>Importa</button>
            </div>
          </div>
        </div>
      )}

      {/* Import exercise modal */}
      {showImportExercise !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Importa exercici</h3>
            <div className="form-group">
              <label>{t('class')}</label>
              <select value={sourceClassIdForExercise} onChange={(e) => void loadTopicsForExerciseImport(Number(e.target.value))}>
                <option value={0}>--</option>
                {allClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('topic')}</label>
              <select value={sourceTopicIdForExercise} onChange={(e) => void loadExercisesForExerciseImport(Number(e.target.value))}>
                <option value={0}>--</option>
                {sourceTopics.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('exercise')}</label>
              <select value={sourceExerciseId} onChange={(e) => setSourceExerciseId(Number(e.target.value))}>
                <option value={0}>--</option>
                {sourceExercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.title}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowImportExercise(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleImportExercise} disabled={!sourceExerciseId}>Importa</button>
            </div>
          </div>
        </div>
      )}

      {/* Add exercise modal */}
      {showAddExercise !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('add_exercise')}</h3>
            <div className="form-group">
              <label>{t('title')}</label>
              <input
                value={newExTitle}
                onChange={(e) => setNewExTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExercise()}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddExercise(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleAddExercise} disabled={!newExTitle.trim()}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add material modal */}
      {showAddMaterial !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{t('add_material')}</h3>
            <div className="form-group">
              <label>{t('title')}</label>
              <input
                value={newMaterialTitle}
                onChange={(e) => setNewMaterialTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMaterial()}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddMaterial(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleAddMaterial} disabled={!newMaterialTitle.trim()}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

