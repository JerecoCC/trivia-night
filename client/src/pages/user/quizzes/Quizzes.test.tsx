import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useQuizzes from '@/hooks/useQuizzes';
import { type QuizSummary } from '@/lib/quizzes';
import QuizzesPage from './Quizzes';

jest.mock('@/components/form/ControlledFields', () => require('@/__mocks__/controlledFields'));

jest.mock('@/hooks/useQuizzes', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockAddQuiz = jest.fn();
const mockUpdateQuiz = jest.fn();
const mockDeleteQuiz = jest.fn();

const makeQuiz = (overrides: Partial<QuizSummary> = {}): QuizSummary => ({
  id: 'quiz-1',
  name: '80s Night',
  description: null,
  structure: 'categorized',
  question_count: 12,
  category_count: 3,
  round_count: 0,
  event_count: 2,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const setup = async (quizzes: QuizSummary[]) => {
  (useQuizzes as jest.Mock).mockReturnValue({
    quizzes,
    loading: false,
    busy: null,
    addQuiz: mockAddQuiz,
    updateQuiz: mockUpdateQuiz,
    deleteQuiz: mockDeleteQuiz,
  });
  await act(async () => {
    render(
      <MemoryRouter>
        <QuizzesPage />
      </MemoryRouter>,
    );
  });
};

const click = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateQuiz.mockResolvedValue(true);
  mockDeleteQuiz.mockResolvedValue(true);
});

describe('QuizzesPage', () => {
  it('shows an empty state with no quizzes', async () => {
    await setup([]);
    expect(
      screen.getByText('No quizzes yet. Create one, then add it to an event.'),
    ).toBeInTheDocument();
  });

  it('lists each quiz with its counts and how it is organized', async () => {
    await setup([
      makeQuiz(),
      makeQuiz({ id: 'quiz-2', name: 'Pub Classics', structure: 'flat', question_count: 1 }),
    ]);

    expect(screen.getByText('12 questions · 3 categories')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('1 question')).toBeInTheDocument();
    expect(screen.getByText('Question List')).toBeInTheDocument();
    expect(screen.getByText('Pub Classics').closest('li')?.querySelector('a')).toHaveAttribute(
      'href',
      '/quizzes/quiz-2',
    );
  });

  it('opens a new quiz once it is created', async () => {
    mockAddQuiz.mockResolvedValue(makeQuiz({ id: 'new-quiz' }));
    await setup([]);

    await click(screen.getByRole('button', { name: /Create Quiz/ }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Movie Night ' } });
    });
    await click(screen.getByRole('button', { name: 'Categories' }));
    const submit = screen
      .getAllByRole('button', { name: 'Create Quiz' })
      .find((button) => button.getAttribute('form') === 'quiz-form')!;
    await waitFor(() => expect(submit).toBeEnabled());
    await click(submit);

    await waitFor(() =>
      expect(mockAddQuiz).toHaveBeenCalledWith({
        name: 'Movie Night',
        description: null,
        structure: 'categorized',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/quizzes/new-quiz');
  });

  it('warns that events lose the quiz when it is deleted', async () => {
    await setup([makeQuiz()]);

    await click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('2 events will be left without a quiz');
    await click(within(dialog).getByRole('button', { name: /Delete/ }));

    await waitFor(() => expect(mockDeleteQuiz).toHaveBeenCalledWith('quiz-1'));
  });
});
