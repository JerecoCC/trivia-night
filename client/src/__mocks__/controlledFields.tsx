// Native stand-ins for '@/components/form/ControlledFields', so tests can fill forms with
// fireEvent.change and find fields by their label. Use it with:
//   jest.mock('@/components/form/ControlledFields', () => require('@/__mocks__/controlledFields'));
import type { ReactNode } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';

interface MockFieldProps {
  control: unknown;
  name: string;
  label?: ReactNode;
  rules?: RegisterOptions;
  options?: { value: string; label: string }[];
  children?: ReactNode;
  /** Called with the new value after the form updates, like the real fields. */
  onChange?: (value: string) => void;
}

const useMockField = ({ control, name, rules, onChange }: MockFieldProps) => {
  const { field } = useController({
    name,
    control: control as Control<FieldValues>,
    rules: rules ?? {},
  });
  return {
    ...field,
    onChange: (event: { target: { value: string } }) => {
      field.onChange(event.target.value);
      onChange?.(event.target.value);
    },
  };
};

const MockInput = (props: MockFieldProps) => (
  <input
    aria-label={String(props.label)}
    {...useMockField(props)}
  />
);

const MockTextarea = (props: MockFieldProps) => (
  <textarea
    aria-label={String(props.label)}
    {...useMockField(props)}
  />
);

const MockSelect = (props: MockFieldProps) => (
  <select
    aria-label={String(props.label)}
    {...useMockField(props)}
  >
    <option value="">None</option>
    {props.options
      ?.filter((option) => option.value !== '')
      .map((option) => (
        <option
          key={option.value}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
  </select>
);

const MockFieldGroup = ({ label, children }: MockFieldProps) => (
  <fieldset>
    <legend>{label}</legend>
    {children}
  </fieldset>
);

export const ControlledInputField = MockInput;
export const ControlledDatePickerField = MockInput;
export const ControlledTimePickerField = MockInput;
export const ControlledColorPickerField = MockInput;
export const ControlledTextareaField = MockTextarea;
export const ControlledSelectField = MockSelect;
export const ControlledFieldGroup = MockFieldGroup;
