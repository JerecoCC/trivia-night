import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import useEvents, { type EventRecord } from '@/hooks/useEvents';
import { todayDateKey } from '@/lib/eventSchedule';
import EventsPage from './Events';

// Native inputs stand in for the custom pickers so the form can be filled with fireEvent.change.
jest.mock('@/components/form/ControlledFields', () => require('@/__mocks__/controlledFields'));

jest.mock('@/hooks/useQuizzes', () => ({
  __esModule: true,
  default: () => ({ quizzes: [{ id: 'quiz-1', name: '80s Night' }] }),
}));

jest.mock('@/hooks/useEvents', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockAddEvent = jest.fn();
const mockUpdateEvent = jest.fn();
const mockDeleteEvent = jest.fn();

const makeEvent = (overrides: Partial<EventRecord>): EventRecord => ({
  id: 'event-1',
  name: 'Pub Quiz',
  scheduled_date: '2999-11-20',
  scheduled_start: '19:30',
  is_online: false,
  location: 'The Crown',
  quiz_id: null,
  quiz_name: null,
  owner_id: 'user-1',
  owner_name: 'Jane Planner',
  is_owner: true,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const setup = async (events: EventRecord[], loading = false) => {
  (useEvents as jest.Mock).mockReturnValue({
    events,
    loading,
    busy: null,
    addEvent: mockAddEvent,
    updateEvent: mockUpdateEvent,
    deleteEvent: mockDeleteEvent,
  });
  // The always-mounted form validates asynchronously on mount, so let that settle inside act.
  await act(async () => {
    render(<EventsPage />);
  });
};

// Field changes, opening the form and submitting it all trigger the form's async validation, so
// let it settle inside act.
const change = (label: string, value: string) =>
  act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });

const click = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

const fillSchedule = async () => {
  await change('Name', '  Pub Quiz ');
  await change('Date', '2999-11-20');
  await change('Start Time', '19:30');
};

// The modal's confirm button submits the form through its `form` attribute.
const findSubmit = (label: string) =>
  screen
    .getAllByRole('button', { name: label })
    .find((button) => button.getAttribute('form') === 'event-form');

const submitForm = async () => {
  const submit = findSubmit('Create Event');
  await waitFor(() => expect(submit).toBeEnabled());
  await click(submit!);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAddEvent.mockResolvedValue(true);
  mockUpdateEvent.mockResolvedValue(true);
  mockDeleteEvent.mockResolvedValue(true);
});

describe('EventsPage', () => {
  it('shows an empty state when there are no events', async () => {
    await setup([]);
    expect(screen.getByText('No upcoming events. Create one to get started.')).toBeInTheDocument();
    expect(screen.queryByText('Past Events')).not.toBeInTheDocument();
  });

  it('lists upcoming events with their date, start time and location', async () => {
    await setup([makeEvent({})]);

    expect(screen.getByText('Pub Quiz')).toBeInTheDocument();
    expect(screen.getByText(/Nov 20, 2999 · 7:30 PM/)).toBeInTheDocument();
    expect(screen.getByText('The Crown')).toBeInTheDocument();
    expect(screen.queryByText('You’re planning')).not.toBeInTheDocument();
    expect(screen.queryByText('Planner')).not.toBeInTheDocument();
  });

  it('puts events before today under Past Events', async () => {
    await setup([
      makeEvent({ id: 'old', name: 'Last Year Quiz', scheduled_date: '2000-01-01' }),
      makeEvent({ id: 'today', name: 'Tonight Quiz', scheduled_date: todayDateKey() }),
    ]);

    const pastHeading = screen.getByRole('heading', { name: 'Past Events' });
    const follows = (node: Node) =>
      Boolean(pastHeading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByText('Last Year Quiz'))).toBe(true);
    expect(follows(screen.getByText('Tonight Quiz'))).toBe(false);
  });

  it("only offers edit and delete on the user's own events", async () => {
    await setup([
      makeEvent({ id: 'mine', name: 'My Quiz' }),
      makeEvent({
        id: 'theirs',
        name: 'Their Quiz',
        is_owner: false,
        owner_id: 'user-2',
        owner_name: 'Sam Host',
      }),
    ]);

    expect(screen.getByText('Hosted by Sam Host')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('tags events as online or in person', async () => {
    await setup([
      makeEvent({ id: 'here', name: 'Pub Quiz' }),
      makeEvent({ id: 'web', name: 'Zoom Quiz', is_online: true, location: null }),
    ]);

    expect(screen.getByText('In Person')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getAllByText('The Crown')).toHaveLength(1);
  });

  it('groups events under month headings', async () => {
    await setup([
      makeEvent({ id: 'nov', name: 'November Quiz', scheduled_date: '2999-11-20' }),
      makeEvent({ id: 'dec', name: 'December Quiz', scheduled_date: '2999-12-04' }),
    ]);

    const december = screen.getByRole('heading', { name: 'December 2999' });
    const follows = (node: Node) =>
      Boolean(december.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('heading', { name: 'November 2999' })).toBeInTheDocument();
    expect(follows(screen.getByText('November Quiz'))).toBe(false);
    expect(follows(screen.getByText('December Quiz'))).toBe(true);
  });

  it('creates an in-person event from the form', async () => {
    await setup([]);

    await click(screen.getByRole('button', { name: /Create Event/ }));
    await fillSchedule();
    await change('Location', 'The Crown');
    await submitForm();

    await waitFor(() =>
      expect(mockAddEvent).toHaveBeenCalledWith({
        name: 'Pub Quiz',
        scheduled_date: '2999-11-20',
        scheduled_start: '19:30',
        is_online: false,
        location: 'The Crown',
        quiz_id: null,
      }),
    );
  });

  it('plays one of the planner’s quizzes', async () => {
    await setup([]);

    await click(screen.getByRole('button', { name: /Create Event/ }));
    await fillSchedule();
    await change('Location', 'The Crown');
    await change('Quiz', 'quiz-1');
    await submitForm();

    await waitFor(() =>
      expect(mockAddEvent).toHaveBeenCalledWith(expect.objectContaining({ quiz_id: 'quiz-1' })),
    );
  });

  it('hides the location for an online event and saves it without one', async () => {
    await setup([]);

    await click(screen.getByRole('button', { name: /Create Event/ }));
    await fillSchedule();
    await change('Location', 'Typed before switching');
    const onlineSwitch = screen.getByRole('switch', { name: 'Online Event' });
    expect(onlineSwitch).toHaveAttribute('aria-checked', 'false');

    await click(onlineSwitch);

    expect(onlineSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
    await submitForm();

    await waitFor(() =>
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({ is_online: true, location: null }),
      ),
    );
  });

  it('requires a location again when switched back to in person', async () => {
    await setup([makeEvent({ is_online: true, location: null })]);

    await click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();

    await click(screen.getByRole('switch', { name: 'Online Event' }));

    expect(screen.getByLabelText('Location')).toHaveValue('');
    await waitFor(() => expect(findSubmit('Save Changes')).toBeDisabled());
  });

  it('deletes an event after confirming', async () => {
    await setup([makeEvent({})]);

    await click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await click(within(dialog).getByRole('button', { name: /Delete/ }));

    await waitFor(() => expect(mockDeleteEvent).toHaveBeenCalledWith('event-1'));
  });
});
