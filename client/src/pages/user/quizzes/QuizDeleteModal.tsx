import ConfirmModal from '@jerecocc/tracker-ui/components/ConfirmModal/ConfirmModal';
import { countLabel, type QuizSummary } from '@/lib/quizzes';

interface Props {
  open: boolean;
  busy: boolean;
  target: QuizSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const QuizDeleteModal = (props: Props) => {
  const { open, busy, target, onCancel, onConfirm } = props;
  const events = target?.event_count ?? 0;
  return (
    <ConfirmModal
      open={open}
      title="Delete Quiz"
      body={
        <>
          Are you sure you want to delete <strong>{target?.name}</strong> and its{' '}
          {countLabel(target?.question_count ?? 0, 'question')}?
          {events > 0 && ` ${countLabel(events, 'event')} will be left without a quiz.`} This cannot
          be undone.
        </>
      }
      confirmLabel={busy ? 'Deleting…' : 'Delete'}
      confirmIcon="delete"
      intent="danger"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};

export default QuizDeleteModal;
