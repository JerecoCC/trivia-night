import { QUESTION_TYPE_LABELS } from '@/lib/quizzes';

export const QUESTION_TYPE_OPTIONS = (['multiple_choice', 'true_false', 'written'] as const).map(
  (value) => ({ value, label: QUESTION_TYPE_LABELS[value] }),
);
