import ListItem, { type ListItemAction } from '@jerecocc/tracker-ui/components/ListItem/ListItem';
import ReorderableField from '@jerecocc/tracker-ui/components/ReorderableField/ReorderableField';
import useReorderableList from '@/hooks/useReorderableList';
import {
  QUESTION_TYPE_LABELS,
  answerLabel,
  mediaSummary,
  questionTitle,
  type QuestionType,
  type QuizQuestion,
} from '@/lib/quizzes';
import ResponsiveList from '@/shared/ResponsiveList/ResponsiveList';
import styles from './QuizDetails.module.scss';

interface QuestionListProps {
  questions: QuizQuestion[];
  /** The category's question type, shown in its header; only questions of another type get a tag. */
  categoryType?: QuestionType;
  onEdit: (question: QuizQuestion) => void;
  onDelete: (question: QuizQuestion) => void;
}

/** Questions as list rows: number, question, answer and media, with edit and delete on hover. */
export const QuestionList = (props: QuestionListProps) => {
  const { questions, categoryType, onEdit, onDelete } = props;
  return (
    <ResponsiveList>
      {questions.map((question, index) => (
        <ListItem
          key={question.id}
          fullWidth
          placeholder={String(index + 1)}
          imageSize={36}
          primaryColor="#ea580c"
          textColor="#ffffff"
          name={questionTitle(question)}
          subtitle={[`Answer: ${answerLabel(question)}`, mediaSummary(question.media)]
            .filter(Boolean)
            .join(' · ')}
          rightContent={
            question.question_type === categoryType
              ? undefined
              : {
                  type: 'tag',
                  label: QUESTION_TYPE_LABELS[question.question_type],
                  intent: 'neutral',
                }
          }
          actions={
            [
              {
                icon: 'edit',
                intent: 'accent',
                tooltip: 'Edit',
                ariaLabel: `Edit question ${index + 1}`,
                onClick: () => onEdit(question),
              },
              {
                icon: 'delete',
                intent: 'danger',
                tooltip: 'Delete',
                ariaLabel: `Delete question ${index + 1}`,
                onClick: () => onDelete(question),
              },
            ] satisfies ListItemAction[]
          }
        />
      ))}
    </ResponsiveList>
  );
};

interface ReorderQuestionListProps {
  questions: QuizQuestion[];
  onSaveOrder: (questionIds: string[]) => Promise<unknown>;
}

/** Reorder mode: one line per question, dragged or moved with the arrows. */
export const ReorderQuestionList = (props: ReorderQuestionListProps) => {
  const { questions, onSaveOrder } = props;
  const { ordered, fieldProps } = useReorderableList(questions, onSaveOrder);

  return (
    <ol className={styles.reorderList}>
      {ordered.map((question, index) => (
        <li key={question.id}>
          <ReorderableField {...fieldProps(question, index, `question ${index + 1}`)}>
            <div className={styles.reorderRow}>
              <span className={styles.questionNumber}>{index + 1}</span>
              <span className={styles.reorderPrompt}>{questionTitle(question)}</span>
            </div>
          </ReorderableField>
        </li>
      ))}
    </ol>
  );
};
