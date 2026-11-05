import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ControlledInputField } from '@/components/form/ControlledFields';
import Modal from '@jerecocc/tracker-ui/components/Modal/Modal';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import { type QuizRound, type RoundInput } from '@/lib/quizzes';
import styles from './QuizDetails.module.scss';

interface FormValues {
  name: string;
}

interface Props {
  open: boolean;
  /** The round being edited, or null to add one. */
  editTarget: QuizRound | null;
  /** The name a new round starts with, such as "Round 3". */
  suggestedName: string;
  onClose: () => void;
  onSave: (input: RoundInput) => Promise<boolean>;
}

const RoundFormModal = (props: Props) => {
  const { open, editTarget, suggestedName, onClose, onSave } = props;
  const formValues = useMemo<FormValues>(
    () => ({ name: editTarget?.name ?? suggestedName }),
    [editTarget, suggestedName],
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty, isValid },
  } = useForm<FormValues>({ defaultValues: formValues, mode: 'onChange' });

  useLayoutEffect(() => {
    reset(formValues);
  }, [formValues, reset]);

  const handleClose = useCallback(() => {
    reset(formValues);
    onClose();
  }, [formValues, onClose, reset]);

  const { hidden, runSettled } = useBackgroundModalAction({
    target: open ? (editTarget?.id ?? 'new') : null,
    onDone: handleClose,
  });

  const onSubmit = handleSubmit((data) => {
    void runSettled(() => onSave({ name: data.name.trim() }), {
      pending: editTarget ? 'Saving round…' : 'Adding round…',
    });
  });

  return (
    <Modal
      open={open && !hidden}
      title={editTarget ? 'Edit Round' : 'Add Round'}
      onClose={handleClose}
      confirmLabel={isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Round'}
      confirmForm="round-form"
      // A new round can be added with its suggested name as is.
      confirmDisabled={isSubmitting || !isValid || (!!editTarget && !isDirty)}
      busy={isSubmitting}
    >
      <form
        id="round-form"
        className={styles.form}
        onSubmit={onSubmit}
      >
        <ControlledInputField
          label="Name"
          required
          control={control}
          name="name"
          placeholder="e.g. Round 1, Lightning Round, Final Round"
          maxLength={80}
          disabled={isSubmitting}
          rules={{ validate: (value: string) => value.trim() !== '' || 'Name is required' }}
        />
      </form>
    </Modal>
  );
};

export default RoundFormModal;
