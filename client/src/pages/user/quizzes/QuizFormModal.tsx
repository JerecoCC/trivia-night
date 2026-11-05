import { useCallback, useLayoutEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ControlledInputField, ControlledTextareaField } from '@/components/form/ControlledFields';
import Modal from '@jerecocc/tracker-ui/components/Modal/Modal';
import SegmentedControlField from '@jerecocc/tracker-ui/components/SegmentedControl/SegmentedControlField';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import {
  STRUCTURE_LABELS,
  type QuizInput,
  type QuizStructure,
  type QuizSummary,
} from '@/lib/quizzes';
import styles from './Quizzes.module.scss';

interface FormValues {
  name: string;
  description: string;
  structure: QuizStructure;
}

const STRUCTURE_OPTIONS = (['flat', 'categorized', 'rounds'] as const).map((value) => ({
  value,
  label: STRUCTURE_LABELS[value],
}));

interface Props {
  open: boolean;
  /** The quiz being edited, or null to create one. */
  editTarget: QuizSummary | null;
  onClose: () => void;
  onSave: (input: QuizInput) => Promise<boolean>;
}

/** What happens to existing questions when an edit changes how the quiz is organized. */
const structureChangeNote = (quiz: QuizSummary | null, structure: QuizStructure) => {
  if (!quiz || quiz.structure === structure) return null;
  if (structure === 'flat') {
    return quiz.category_count > 0
      ? `The ${quiz.structure === 'rounds' ? 'rounds and ' : ''}categories will be removed. Their questions stay, in the same order.`
      : null;
  }
  if (quiz.structure === 'flat') {
    if (quiz.question_count === 0) return null;
    return structure === 'rounds'
      ? 'Your questions will be put in a “General” category in “Round 1”, which you can rename.'
      : 'Your questions will be put in a “General” category, which you can rename.';
  }
  if (structure === 'rounds') {
    return quiz.category_count > 0
      ? 'Your categories will be put in “Round 1”, which you can rename.'
      : null;
  }
  return quiz.round_count > 0
    ? 'The rounds will be removed. Their categories stay, in the same order.'
    : null;
};

const QuizFormModal = (props: Props) => {
  const { open, editTarget, onClose, onSave } = props;

  const formValues = useMemo<FormValues>(
    () => ({
      name: editTarget?.name ?? '',
      description: editTarget?.description ?? '',
      structure: editTarget?.structure ?? 'flat',
    }),
    [editTarget],
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty, isValid },
  } = useForm<FormValues>({ defaultValues: formValues, mode: 'onChange' });

  const structure = useWatch({ control, name: 'structure' });
  const note = structureChangeNote(editTarget, structure);

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
    const payload: QuizInput = {
      name: data.name.trim(),
      description: data.description.trim() || null,
      structure: data.structure,
    };
    void runSettled(() => onSave(payload), {
      pending: editTarget ? 'Saving quiz…' : 'Creating quiz…',
    });
  });

  return (
    <Modal
      open={open && !hidden}
      title={editTarget ? 'Edit Quiz' : 'Create Quiz'}
      onClose={handleClose}
      confirmLabel={isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Quiz'}
      confirmForm="quiz-form"
      confirmDisabled={isSubmitting || !isDirty || !isValid}
      busy={isSubmitting}
    >
      <form
        id="quiz-form"
        className={styles.form}
        onSubmit={onSubmit}
      >
        <ControlledInputField
          label="Name"
          required
          control={control}
          name="name"
          placeholder="e.g. 80s Music Night"
          maxLength={120}
          disabled={isSubmitting}
          rules={{ validate: (value: string) => value.trim() !== '' || 'Name is required' }}
        />
        <ControlledTextareaField
          label="Description"
          control={control}
          name="description"
          placeholder="Optional notes for yourself"
          maxLength={500}
          disabled={isSubmitting}
        />
        <Controller
          control={control}
          name="structure"
          render={({ field }) => (
            <SegmentedControlField
              label="Organize Questions As"
              sublabel={note ?? undefined}
              value={field.value}
              onChange={field.onChange}
              options={STRUCTURE_OPTIONS}
              disabled={isSubmitting}
            />
          )}
        />
      </form>
    </Modal>
  );
};

export default QuizFormModal;
