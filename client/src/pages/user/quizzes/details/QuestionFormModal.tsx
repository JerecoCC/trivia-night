import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import {
  ControlledFieldGroup,
  ControlledInputField,
  ControlledSelectField,
} from '@/components/form/ControlledFields';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import FormField from '@jerecocc/tracker-ui/components/FormField/FormField';
import Modal from '@jerecocc/tracker-ui/components/Modal/Modal';
import RadioButton from '@jerecocc/tracker-ui/components/RadioButton/RadioButton';
import RichTextEditor from '@jerecocc/tracker-ui/components/RichTextEditor/RichTextEditor';
import SegmentedControlField from '@jerecocc/tracker-ui/components/SegmentedControl/SegmentedControlField';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import {
  MAX_CHOICES,
  MIN_CHOICES,
  PROMPT_MAX,
  choiceLetter,
  promptText,
  type QuestionMedia,
  type QuestionInput,
  type QuestionType,
  type QuizCategory,
  type QuizQuestion,
  type QuizRound,
} from '@/lib/quizzes';
import QuestionMediaField from './QuestionMediaField';
import { QUESTION_TYPE_OPTIONS } from './questionTypeOptions';
import styles from './QuizDetails.module.scss';

// The form keeps every type's answer, so switching type and back doesn't lose what was typed.
// Hidden fields keep their rules, so each answer's validation only applies to its own type.
interface FormValues {
  question_type: QuestionType;
  /** Formatted HTML from the editor. */
  prompt: string;
  media: QuestionMedia[];
  choices: { text: string }[];
  correct_choice: number;
  true_false: 'true' | 'false';
  written_answer: string;
  category_id: string;
}

const TRUE_FALSE_OPTIONS = [
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' },
];

const DEFAULT_CHOICE_COUNT = 4;

interface Props {
  open: boolean;
  /** The question being edited, or null to add one. */
  editTarget: QuizQuestion | null;
  /** Set when the quiz has categories: the question must go in one of them. */
  categories: QuizCategory[] | null;
  /** In a rounds quiz, each category is listed with its round's name. */
  rounds?: QuizRound[];
  /** The category a new question starts in. Its question type is the new question's type. */
  defaultCategoryId: string | null;
  onClose: () => void;
  onSave: (input: QuestionInput) => Promise<boolean>;
}

const toFormValues = (
  question: QuizQuestion | null,
  defaultCategoryId: string | null,
  defaultType: QuestionType,
): FormValues => ({
  question_type: question?.question_type ?? defaultType,
  prompt: question?.prompt ?? '',
  media: question?.media ?? [],
  choices:
    question?.question_type === 'multiple_choice'
      ? question.choices.map((text) => ({ text }))
      : Array.from({ length: DEFAULT_CHOICE_COUNT }, () => ({ text: '' })),
  correct_choice: question?.question_type === 'multiple_choice' ? question.answer : 0,
  true_false: question?.question_type === 'true_false' && !question.answer ? 'false' : 'true',
  written_answer: question?.question_type === 'written' ? question.answer : '',
  category_id: question?.category_id ?? defaultCategoryId ?? '',
});

const toPayload = (data: FormValues, categorized: boolean): QuestionInput => {
  const base = {
    prompt: data.prompt.trim(),
    media: data.media,
    category_id: categorized ? data.category_id : null,
  };
  if (data.question_type === 'multiple_choice') {
    return {
      ...base,
      question_type: 'multiple_choice',
      choices: data.choices.map((choice) => choice.text.trim()),
      answer: data.correct_choice,
    };
  }
  if (data.question_type === 'true_false') {
    return {
      ...base,
      question_type: 'true_false',
      choices: null,
      answer: data.true_false === 'true',
    };
  }
  return { ...base, question_type: 'written', choices: null, answer: data.written_answer.trim() };
};

const QuestionFormModal = (props: Props) => {
  const { open, editTarget, categories, rounds = [], defaultCategoryId, onClose, onSave } = props;
  const categorized = categories !== null;
  const [uploading, setUploading] = useState(false);
  // The editor is created before the form loads the question being edited, and would write its
  // empty content back over it. A new key recreates it after each reset, with the right content.
  const [editorKey, setEditorKey] = useState(0);

  const categoryType = (categoryId: string | null): QuestionType =>
    categories?.find((category) => category.id === categoryId)?.question_type ?? 'multiple_choice';
  const defaultType = categoryType(defaultCategoryId);

  const formValues = useMemo(
    () => toFormValues(editTarget, defaultCategoryId, defaultType),
    [editTarget, defaultCategoryId, defaultType],
  );

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    getFieldState,
    trigger,
    formState: { isSubmitting, isDirty, isValid },
  } = useForm<FormValues>({ defaultValues: formValues, mode: 'onChange' });

  const { fields, append, remove } = useFieldArray({ control, name: 'choices' });
  const questionType = useWatch({ control, name: 'question_type' });
  const correctChoice = useWatch({ control, name: 'correct_choice' });

  useLayoutEffect(() => {
    reset(formValues);
    setEditorKey((key) => key + 1);
  }, [formValues, reset]);

  const handleClose = useCallback(() => {
    reset(formValues);
    onClose();
  }, [formValues, onClose, reset]);

  const { hidden, runSettled } = useBackgroundModalAction({
    target: open ? (editTarget?.id ?? `new:${defaultCategoryId ?? ''}`) : null,
    onDone: handleClose,
  });

  const onSubmit = handleSubmit((data) => {
    void runSettled(() => onSave(toPayload(data, categorized)), {
      pending: editTarget ? 'Saving question…' : 'Adding question…',
    });
  });

  const removeChoice = (index: number) => {
    const correct = getValues('correct_choice');
    remove(index);
    // Keep the same choice marked correct as the ones after it move up.
    if (correct === index) setValue('correct_choice', 0, { shouldDirty: true });
    else if (correct > index) setValue('correct_choice', correct - 1, { shouldDirty: true });
    void trigger('choices');
  };

  return (
    <Modal
      open={open && !hidden}
      size="lg"
      title={editTarget ? 'Edit Question' : 'Add Question'}
      onClose={handleClose}
      confirmLabel={isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Question'}
      confirmForm="question-form"
      confirmDisabled={isSubmitting || uploading || !isDirty || !isValid}
      busy={isSubmitting}
    >
      <form
        id="question-form"
        className={styles.form}
        onSubmit={onSubmit}
      >
        {categorized && (
          <ControlledSelectField
            label="Category"
            required
            control={control}
            name="category_id"
            placeholder="Select a category…"
            options={categories.map((category) => {
              const round = rounds.find((r) => r.id === category.round_id);
              return {
                value: category.id,
                label: round ? `${round.name} · ${category.name}` : category.name,
              };
            })}
            disabled={isSubmitting}
            rules={{ required: 'Category is required' }}
            onChange={(categoryId) => {
              // A new question follows its category's type until the planner picks one.
              if (!editTarget && !getFieldState('question_type').isDirty) {
                setValue('question_type', categoryType(categoryId));
              }
            }}
          />
        )}

        <Controller
          control={control}
          name="question_type"
          render={({ field }) => (
            <SegmentedControlField
              label="Type"
              value={field.value}
              onChange={field.onChange}
              options={QUESTION_TYPE_OPTIONS}
              disabled={isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="prompt"
          rules={{
            validate: (value: string) => {
              const text = promptText(value);
              if (!text) return 'Question is required';
              return (
                text.length <= PROMPT_MAX ||
                `Keep the question to ${PROMPT_MAX} characters or fewer`
              );
            },
          }}
          render={({ field, fieldState }) => (
            <FormField
              label="Question"
              required
              invalid={fieldState.invalid}
              errorMessage={fieldState.error?.message}
            >
              {({ labelId }) => (
                <div
                  role="group"
                  aria-labelledby={labelId}
                >
                  <RichTextEditor
                    key={editorKey}
                    content={field.value}
                    onChange={field.onChange}
                    autoFocus={false}
                    editable={!isSubmitting}
                  />
                </div>
              )}
            </FormField>
          )}
        />

        <Controller
          control={control}
          name="media"
          render={({ field }) => (
            <QuestionMediaField
              value={field.value}
              onChange={field.onChange}
              onUploadingChange={setUploading}
              disabled={isSubmitting}
            />
          )}
        />

        {questionType === 'multiple_choice' && (
          <ControlledFieldGroup
            label="Choices"
            required
            control={control}
            name="correct_choice"
          >
            <p className={styles.fieldHint}>Select the correct answer.</p>
            <ol className={styles.choices}>
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className={styles.choiceRow}
                >
                  <span
                    id={`choice-correct-${index}`}
                    className={styles.visuallyHidden}
                  >
                    Choice {choiceLetter(index)} is correct
                  </span>
                  <RadioButton
                    checked={correctChoice === index}
                    onCheckedChange={() =>
                      setValue('correct_choice', index, { shouldDirty: true, shouldValidate: true })
                    }
                    ariaLabelledBy={`choice-correct-${index}`}
                    disabled={isSubmitting}
                  />
                  <span
                    className={styles.choiceLetter}
                    aria-hidden="true"
                  >
                    {choiceLetter(index)}
                  </span>
                  <div className={styles.choiceInput}>
                    <ControlledInputField
                      label={`Choice ${choiceLetter(index)}`}
                      hideLabel
                      control={control}
                      name={`choices.${index}.text`}
                      maxLength={200}
                      disabled={isSubmitting}
                      onChange={() => void trigger('choices')}
                      rules={{
                        validate: (value: string, values) => {
                          if (values.question_type !== 'multiple_choice') return true;
                          const text = value.trim().toLowerCase();
                          if (!text) return 'Fill in every choice';
                          const repeats = values.choices.filter(
                            (choice: { text: string }) => choice.text.trim().toLowerCase() === text,
                          ).length;
                          return repeats === 1 || 'Choices must all be different';
                        },
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    intent="neutral"
                    icon="delete"
                    tooltip="Remove choice"
                    aria-label={`Remove choice ${choiceLetter(index)}`}
                    disabled={isSubmitting || fields.length <= MIN_CHOICES}
                    onClick={() => removeChoice(index)}
                  />
                </li>
              ))}
            </ol>
            {fields.length < MAX_CHOICES && (
              <Button
                type="button"
                variant="outlined"
                intent="neutral"
                icon="add"
                size="small"
                disabled={isSubmitting}
                onClick={() => append({ text: '' })}
              >
                Add Choice
              </Button>
            )}
          </ControlledFieldGroup>
        )}

        {questionType === 'true_false' && (
          <Controller
            control={control}
            name="true_false"
            render={({ field }) => (
              <SegmentedControlField
                label="Answer"
                required
                value={field.value}
                onChange={field.onChange}
                options={TRUE_FALSE_OPTIONS}
                disabled={isSubmitting}
              />
            )}
          />
        )}

        {questionType === 'written' && (
          <ControlledInputField
            label="Answer"
            required
            sublabel="What you’ll check players’ answers against."
            control={control}
            name="written_answer"
            maxLength={200}
            disabled={isSubmitting}
            rules={{
              validate: (value: string, values) =>
                values.question_type !== 'written' || value.trim() !== '' || 'Answer is required',
            }}
          />
        )}
      </form>
    </Modal>
  );
};

export default QuestionFormModal;
