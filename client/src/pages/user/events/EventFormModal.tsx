import { useCallback, useLayoutEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  ControlledDatePickerField,
  ControlledInputField,
  ControlledSelectField,
  ControlledTimePickerField,
} from '@/components/form/ControlledFields';
import FormField, {
  FORM_FIELD_COMPACT_MIN_WIDTHS,
} from '@jerecocc/tracker-ui/components/FormField/FormField';
import Modal from '@jerecocc/tracker-ui/components/Modal/Modal';
import Toggle from '@jerecocc/tracker-ui/components/Toggle/Toggle';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import { type EventInput, type EventRecord } from '@/hooks/useEvents';
import useQuizzes from '@/hooks/useQuizzes';
import styles from './Events.module.scss';

// The form keeps a typed location while the event is online, so switching back restores it.
interface FormValues {
  name: string;
  scheduled_date: string;
  scheduled_start: string;
  is_online: boolean;
  location: string;
  /** '' for no quiz. */
  quiz_id: string;
}

interface Props {
  open: boolean;
  editTarget: EventRecord | null;
  onClose: () => void;
  addEvent: (data: EventInput) => Promise<boolean>;
  updateEvent: (id: string, data: Partial<EventInput>) => Promise<boolean>;
}

const EventFormModal = (props: Props) => {
  const { open, editTarget, onClose, addEvent, updateEvent } = props;

  const formValues = useMemo<FormValues>(
    () => ({
      name: editTarget?.name ?? '',
      scheduled_date: editTarget?.scheduled_date ?? '',
      scheduled_start: editTarget?.scheduled_start ?? '',
      is_online: editTarget?.is_online ?? false,
      location: editTarget?.location ?? '',
      quiz_id: editTarget?.quiz_id ?? '',
    }),
    [editTarget],
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty, isValid },
  } = useForm<FormValues>({
    defaultValues: formValues,
    mode: 'onChange',
  });

  const isOnline = useWatch({ control, name: 'is_online' });
  const { quizzes } = useQuizzes();
  const quizOptions = useMemo(
    () => [
      { value: '', label: 'No quiz yet' },
      ...quizzes.map((quiz) => ({ value: quiz.id, label: quiz.name })),
    ],
    [quizzes],
  );

  useLayoutEffect(() => {
    reset(formValues);
  }, [formValues, reset]);

  const handleClose = useCallback(() => {
    reset(formValues);
    onClose();
  }, [formValues, onClose, reset]);

  // The modal hides while the event saves behind a progress toast, and reappears with what was
  // entered if that fails.
  const { hidden, runSettled } = useBackgroundModalAction({
    target: open ? (editTarget?.id ?? 'new') : null,
    onDone: handleClose,
  });

  const onSubmit = handleSubmit((data) => {
    const payload: EventInput = {
      name: data.name.trim(),
      scheduled_date: data.scheduled_date,
      scheduled_start: data.scheduled_start,
      is_online: data.is_online,
      location: data.is_online ? null : data.location.trim(),
      quiz_id: data.quiz_id || null,
    };
    void runSettled(() => (editTarget ? updateEvent(editTarget.id, payload) : addEvent(payload)), {
      pending: editTarget ? 'Saving event…' : 'Creating event…',
    });
  });

  return (
    <Modal
      open={open && !hidden}
      title={editTarget ? 'Edit Event' : 'Create Event'}
      onClose={handleClose}
      confirmLabel={isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Event'}
      confirmForm="event-form"
      confirmDisabled={isSubmitting || !isDirty || !isValid}
      busy={isSubmitting}
    >
      <form
        id="event-form"
        className={styles.form}
        onSubmit={onSubmit}
      >
        <ControlledInputField
          label="Name"
          required
          control={control}
          name="name"
          placeholder="e.g. Thursday Pub Quiz"
          maxLength={120}
          disabled={isSubmitting}
          rules={{
            validate: (value: string) => value.trim() !== '' || 'Name is required',
          }}
        />

        <div className={styles.scheduleRow}>
          <ControlledDatePickerField
            label="Date"
            required
            control={control}
            name="scheduled_date"
            placeholder="Select date…"
            disabled={isSubmitting}
            rules={{ required: 'Date is required' }}
          />
          <ControlledTimePickerField
            label="Start Time"
            required
            control={control}
            name="scheduled_start"
            disabled={isSubmitting}
            rules={{ required: 'Start time is required' }}
          />
        </div>

        <FormField
          label="Online Event"
          labelPosition="left"
          controlWidth="compact"
          compactMinWidth={FORM_FIELD_COMPACT_MIN_WIDTHS.toggle}
        >
          {({ labelId }) => (
            <Controller
              control={control}
              name="is_online"
              render={({ field }) => (
                <Toggle
                  variant="toggle"
                  active={field.value}
                  onActiveChange={field.onChange}
                  activeIcon="check"
                  inactiveIcon="close"
                  ariaLabelledBy={labelId}
                  disabled={isSubmitting}
                />
              )}
            />
          )}
        </FormField>

        {!isOnline && (
          <ControlledInputField
            label="Location"
            required
            control={control}
            name="location"
            placeholder="Venue name and address"
            maxLength={200}
            disabled={isSubmitting}
            rules={{
              validate: (value: string, values) =>
                values.is_online || value.trim() !== '' || 'Location is required',
            }}
          />
        )}

        <ControlledSelectField
          label="Quiz"
          sublabel="Only you can see which quiz an event plays."
          control={control}
          name="quiz_id"
          options={quizOptions}
          disabled={isSubmitting}
        />
      </form>
    </Modal>
  );
};

export default EventFormModal;
