import ConfirmModal from '@jerecocc/tracker-ui/components/ConfirmModal/ConfirmModal';
import { type EventRecord } from '@/hooks/useEvents';

interface Props {
  open: boolean;
  busy: string | null;
  target: EventRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const EventDeleteModal = (props: Props) => {
  const { open, busy, target, onCancel, onConfirm } = props;
  return (
    <ConfirmModal
      open={open}
      title="Delete Event"
      body={
        <>
          Are you sure you want to delete <strong>{target?.name}</strong>? This cannot be undone.
        </>
      }
      confirmLabel={busy === target?.id ? 'Deleting…' : 'Delete'}
      confirmIcon="delete"
      intent="danger"
      busy={busy === target?.id}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};

export default EventDeleteModal;
