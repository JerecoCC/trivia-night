import { useCallback, useLayoutEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ControlledInputField, ControlledSelectField } from '@/components/form/ControlledFields';
import Modal from '@jerecocc/tracker-ui/components/Modal/Modal';
import SegmentedControlField from '@jerecocc/tracker-ui/components/SegmentedControl/SegmentedControlField';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import {
  type CategoryInput,
  type QuestionType,
  type QuizCategory,
  type QuizRound,
} from '@/lib/quizzes';
import { QUESTION_TYPE_OPTIONS } from './questionTypeOptions';
import styles from './QuizDetails.module.scss';

interface FormValues {
  name: string;
  question_type: QuestionType;
  round_id: string;
}

interface Props {
  open: boolean;
  /** The category being edited, or null to add one. */
  editTarget: QuizCategory | null;
  /** Set when the quiz has rounds: the category must go in one of them. */
  rounds: QuizRound[] | null;
  /** The round a new category starts in. */
  defaultRoundId: string | null;
  onClose: () => void;
  onSave: (input: CategoryInput) => Promise<boolean>;
}

const CategoryFormModal = (props: Props) => {
  const { open, editTarget, rounds, defaultRoundId, onClose, onSave } = props;
  const formValues = useMemo<FormValues>(
    () => ({
      name: editTarget?.name ?? '',
      question_type: editTarget?.question_type ?? 'multiple_choice',
      round_id: editTarget?.round_id ?? defaultRoundId ?? '',
    }),
    [editTarget, defaultRoundId],
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
    target: open ? (editTarget?.id ?? `new:${defaultRoundId ?? ''}`) : null,
    onDone: handleClose,
  });

  const onSubmit = handleSubmit((data) => {
    const payload: CategoryInput = {
      name: data.name.trim(),
      question_type: data.question_type,
      round_id: rounds ? data.round_id : null,
    };
    void runSettled(() => onSave(payload), {
      pending: editTarget ? 'Saving category…' : 'Adding category…',
    });
  });

  return (
    <Modal
      open={open && !hidden}
      title={editTarget ? 'Edit Category' : 'Add Category'}
      onClose={handleClose}
      confirmLabel={isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Category'}
      confirmForm="category-form"
      confirmDisabled={isSubmitting || !isDirty || !isValid}
      busy={isSubmitting}
    >
      <form
        id="category-form"
        className={styles.form}
        onSubmit={onSubmit}
      >
        {rounds && (
          <ControlledSelectField
            label="Round"
            required
            control={control}
            name="round_id"
            placeholder="Select a round…"
            sublabel={editTarget ? 'Moving it to another round puts it at the end.' : undefined}
            options={rounds.map((round) => ({ value: round.id, label: round.name }))}
            disabled={isSubmitting}
            rules={{ required: 'Round is required' }}
          />
        )}
        <ControlledInputField
          label="Name"
          required
          control={control}
          name="name"
          placeholder="e.g. Music, Geography, Movies"
          maxLength={80}
          disabled={isSubmitting}
          rules={{ validate: (value: string) => value.trim() !== '' || 'Name is required' }}
        />
        <Controller
          control={control}
          name="question_type"
          render={({ field }) => (
            <SegmentedControlField
              label="Question Type"
              sublabel={
                editTarget
                  ? 'New questions in this category start as this type. Existing questions keep theirs.'
                  : 'New questions in this category start as this type.'
              }
              value={field.value}
              onChange={field.onChange}
              options={QUESTION_TYPE_OPTIONS}
              disabled={isSubmitting}
            />
          )}
        />
      </form>
    </Modal>
  );
};

export default CategoryFormModal;
