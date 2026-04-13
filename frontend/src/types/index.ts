export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'student' | 'teacher' | 'admin';
  language: string;
  created_at: string;
}

export interface Class {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
}

export interface ClassMember {
  id: number;
  class_id: number;
  user_id: number;
  role: 'student' | 'teacher';
  user_full_name?: string;
  user_username?: string;
}

export interface Topic {
  id: number;
  class_id: number;
  name: string;
  order_index: number;
  unlock_mode: string; // 'auto' | 'open' | 'locked'
  created_at: string;
}

export interface Exercise {
  id: number;
  topic_id: number;
  title: string;
  description: string;
  order_index: number;
  created_at: string;
  solution?: string;
  system_prompt_override?: string;
}

export interface Material {
  id: number;
  topic_id: number;
  title: string;
  description: string;
  content?: string;
  order_index: number;
  created_at: string;
}

export interface Submission {
  id: number;
  exercise_id: number;
  user_id: number;
  status: SubmissionStatus;
  chat_blocked: boolean;
  created_at: string;
  updated_at: string;
  versions?: SubmissionVersion[];
}

export type SubmissionStatus =
  | 'in_progress'
  | 'correct'
  | 'incorrect'
  | 'teacher_correct'
  | 'teacher_incorrect';

export interface SubmissionVersion {
  id: number;
  version_number: number;
  code: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  submission_id: number;
  type: 'evaluate' | 'help';
  status: 'open' | 'closed' | 'reopened';
  created_at: string;
  messages?: ChatMessage[];
}

export interface CodeExecutionInfo {
  status: 'ok' | 'compile_ok' | 'compile_error' | 'runtime_error' | 'stdin_needed';
  compiled: boolean;
  executed: boolean;
  can_mark_resolved: boolean;
  line?: number;
  error_type?: string;
  error_message?: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'system' | 'assistant' | 'user' | 'teacher';
  content: string;
  verdict?: 'correct' | 'incorrect' | null;
  code_snapshot?: string;
  version_id?: number;
  version?: SubmissionVersion;
  created_at: string;
}

export interface TopicProgress {
  topic_id: number;
  name: string;
  order_index: number;
  unlock_mode: string;
  unlocked: boolean;
  exercises: ExerciseProgress[];
  materials: MaterialProgress[];
}

export interface ExerciseProgress {
  exercise_id: number;
  title: string;
  order_index?: number;
  status: string;
}

export interface MaterialProgress {
  material_id: number;
  title: string;
  order_index?: number;
  status: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
