import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useQuiz from '@/hooks/useQuiz';
import { uploadQuestionMedia, useUploadsEnabled } from '@/hooks/useUploads';
import { type QuizDetail, type QuizQuestion } from '@/lib/quizzes';
import QuizDetailsPage from './QuizDetails';

jest.mock('@/components/form/ControlledFields', () => require('@/__mocks__/controlledFields'));

// The editor stands in as a textarea of its HTML, labelled like the real field.
jest.mock(
  '@jerecocc/tracker-ui/components/RichTextEditor/RichTextEditor',
  () =>
    function MockRichTextEditor(props: { content: string; onChange: (html: string) => void }) {
      return (
        <textarea
          aria-label="Question editor"
          value={props.content}
          onChange={(event) => props.onChange(event.target.value)}
        />
      );
    },
);

jest.mock('@/hooks/useUploads', () => ({
  MAX_UPLOAD_BYTES: 100 * 1024 * 1024,
  uploadQuestionMedia: jest.fn(),
  useUploadsEnabled: jest.fn(),
}));

jest.mock('@/hooks/useQuiz', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mocks = {
  updateQuiz: jest.fn(),
  addRound: jest.fn(),
  updateRound: jest.fn(),
  deleteRound: jest.fn(),
  addCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  addQuestion: jest.fn(),
  updateQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
  saveOrder: jest.fn(),
};

const MC: QuizQuestion = {
  id: 'q-mc',
  category_id: null,
  position: 0,
  prompt: '<p>Capital of <strong>Australia</strong>?</p>',
  media: [],
  question_type: 'multiple_choice',
  choices: ['Sydney', 'Canberra', 'Melbourne'],
  answer: 1,
};
const TF: QuizQuestion = {
  id: 'q-tf',
  category_id: null,
  position: 1,
  prompt: 'Bats are blind.',
  media: [{ kind: 'audio', url: 'https://cdn.example.com/bat.mp3', name: 'bat.mp3' }],
  question_type: 'true_false',
  choices: null,
  answer: false,
};
const WRITTEN: QuizQuestion = {
  id: 'q-w',
  category_id: null,
  position: 2,
  prompt: 'Who wrote the first program?',
  media: [],
  question_type: 'written',
  choices: null,
  answer: 'Ada Lovelace',
};

const quizBase = {
  id: 'quiz-1',
  name: '80s Night',
  description: 'Bring your leg warmers',
  event_count: 1,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const FLAT: QuizDetail = {
  ...quizBase,
  structure: 'flat',
  question_count: 3,
  category_count: 0,
  round_count: 0,
  rounds: [],
  categories: [],
  questions: [MC, TF, WRITTEN],
};

const CATEGORIZED: QuizDetail = {
  ...quizBase,
  structure: 'categorized',
  question_count: 3,
  category_count: 2,
  round_count: 0,
  rounds: [],
  categories: [
    {
      id: 'cat-music',
      round_id: null,
      name: 'Music',
      question_type: 'multiple_choice',
      position: 0,
    },
    { id: 'cat-history', round_id: null, name: 'History', question_type: 'written', position: 1 },
  ],
  questions: [
    { ...MC, category_id: 'cat-music' },
    { ...TF, category_id: 'cat-music' },
    { ...WRITTEN, category_id: 'cat-history', position: 0 },
  ],
};

const ROUNDS: QuizDetail = {
  ...quizBase,
  structure: 'rounds',
  question_count: 3,
  category_count: 3,
  round_count: 2,
  rounds: [
    { id: 'round-1', name: 'Round 1', position: 0 },
    { id: 'round-2', name: 'Round 2', position: 1 },
  ],
  categories: [
    {
      id: 'cat-music',
      round_id: 'round-1',
      name: 'Music',
      question_type: 'multiple_choice',
      position: 0,
    },
    {
      id: 'cat-movies',
      round_id: 'round-1',
      name: 'Movies',
      question_type: 'true_false',
      position: 1,
    },
    {
      id: 'cat-history',
      round_id: 'round-2',
      name: 'History',
      question_type: 'written',
      position: 0,
    },
  ],
  questions: [
    { ...MC, category_id: 'cat-music' },
    { ...TF, category_id: 'cat-music' },
    { ...WRITTEN, category_id: 'cat-history', position: 0 },
  ],
};

const setup = async (quiz: QuizDetail | null, { notFound = false } = {}) => {
  (useQuiz as jest.Mock).mockReturnValue({ quiz, loading: false, notFound, ...mocks });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/quizzes/quiz-1']}>
        <Routes>
          <Route
            path="/quizzes/:quizId"
            element={<QuizDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const click = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

const change = (label: string, value: string) =>
  act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });

const submitForm = async (form: string, label: string) => {
  const submit = screen
    .getAllByRole('button', { name: label })
    .find((button) => button.getAttribute('form') === form)!;
  await waitFor(() => expect(submit).toBeEnabled());
  await click(submit);
};

const submitQuestion = (label = 'Add Question') => submitForm('question-form', label);

const questionSubmit = (label = 'Add Question') =>
  screen
    .getAllByRole('button', { name: label })
    .find((button) => button.getAttribute('form') === 'question-form')!;

/** A round's own menu comes before its categories' menus. */
const openRoundMenu = (round: HTMLElement) =>
  click(within(round).getAllByRole('button', { name: /More actions/ })[0]);

beforeEach(() => {
  jest.clearAllMocks();
  (useUploadsEnabled as jest.Mock).mockReturnValue(true);
  Object.values(mocks).forEach((mock) => mock.mockResolvedValue(true));
});

describe('QuizDetailsPage', () => {
  it('says so when the quiz does not exist', async () => {
    await setup(null, { notFound: true });
    expect(screen.getByText('This quiz doesn’t exist.')).toBeInTheDocument();
  });

  it('shows each question with its answer, in order', async () => {
    await setup(FLAT);

    expect(screen.getByRole('heading', { name: '80s Night' })).toBeInTheDocument();
    expect(screen.getByText('Bring your leg warmers')).toBeInTheDocument();
    expect(screen.getByLabelText('3 questions')).toBeInTheDocument();
    expect(screen.getByLabelText('1 event')).toBeInTheDocument();
    expect(screen.queryByLabelText(/categor/)).not.toBeInTheDocument();

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[0]).toContain('Capital of Australia?');
    expect(rows[0]).toContain('Answer: B. Canberra');
    expect(rows[1]).toContain('Answer: False');
    expect(rows[2]).toContain('Answer: Ada Lovelace');
  });

  it('reorders questions only in reorder mode, and saves each move', async () => {
    await setup(FLAT);
    expect(screen.queryByRole('button', { name: 'Move question 1 down' })).not.toBeInTheDocument();

    await click(screen.getByRole('button', { name: /Reorder/ }));
    expect(screen.queryByRole('button', { name: /Add Question/ })).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Move question 1 down' }));

    expect(mocks.saveOrder).toHaveBeenCalledWith({ question_ids: ['q-tf', 'q-mc', 'q-w'] });

    await click(screen.getByRole('button', { name: /Done/ }));
    expect(screen.queryByRole('button', { name: 'Move question 1 down' })).not.toBeInTheDocument();
  });

  it('offers no reorder mode until a list has two questions', async () => {
    await setup({ ...FLAT, questions: [MC], question_count: 1 });
    expect(screen.queryByRole('button', { name: /Reorder/ })).not.toBeInTheDocument();
  });

  it('groups questions by category and moves a category from its menu', async () => {
    await setup(CATEGORIZED);

    const music = screen.getByRole('region', { name: 'Music' });
    expect(within(music).getByLabelText('2 questions')).toBeInTheDocument();
    expect(screen.getByLabelText('2 categories')).toBeInTheDocument();
    // The category's type is shown once; only the true/false question in it gets its own tag.
    expect(within(music).getByText('Multiple Choice')).toBeInTheDocument();
    expect(within(music).getAllByText('True or False')).toHaveLength(1);
    expect(within(music).getByText('Capital of Australia?')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'History' })).getByText(
        'Who wrote the first program?',
      ),
    ).toBeInTheDocument();

    await click(within(music).getByRole('button', { name: /More actions/ }));
    expect(screen.getByRole('button', { name: /Move Up/ })).toBeDisabled();
    await click(screen.getByRole('button', { name: /Move Down/ }));

    expect(mocks.saveOrder).toHaveBeenCalledWith({
      categories: [
        { id: 'cat-history', question_ids: ['q-w'] },
        { id: 'cat-music', question_ids: ['q-mc', 'q-tf'] },
      ],
    });
  });

  it('collapses a category, and opens them all for reordering', async () => {
    await setup(CATEGORIZED);

    const music = screen.getByRole('region', { name: 'Music' });
    await click(within(music).getByRole('button', { name: 'Collapse' }));
    expect(within(music).queryByText('Capital of Australia?')).not.toBeInTheDocument();
    // The header still shows the count and its actions.
    expect(within(music).getByLabelText('2 questions')).toBeInTheDocument();
    expect(
      within(music).getByRole('button', { name: 'Add question to Music' }),
    ).toBeInTheDocument();

    await click(screen.getByRole('button', { name: /Reorder/ }));
    expect(within(music).getByText('Capital of Australia?')).toBeInTheDocument();
  });

  it('reorders questions within their category', async () => {
    await setup(CATEGORIZED);

    await click(screen.getByRole('button', { name: /Reorder/ }));
    const music = screen.getByRole('region', { name: 'Music' });
    await click(within(music).getByRole('button', { name: 'Move question 2 up' }));

    expect(mocks.saveOrder).toHaveBeenCalledWith({
      categories: [
        { id: 'cat-music', question_ids: ['q-tf', 'q-mc'] },
        { id: 'cat-history', question_ids: ['q-w'] },
      ],
    });
  });

  it('adds a multiple choice question with the correct choice marked', async () => {
    await setup(FLAT);

    await click(screen.getByRole('button', { name: /Add Question/ }));
    await change('Question editor', ' Largest planet? ');
    await change('Choice A', 'Earth');
    await change('Choice B', 'Jupiter');
    await change('Choice C', 'Mars');
    await click(screen.getByRole('button', { name: 'Remove choice D' }));
    await click(screen.getByRole('radio', { name: 'Choice B is correct' }));
    await submitQuestion();

    await waitFor(() =>
      expect(mocks.addQuestion).toHaveBeenCalledWith({
        question_type: 'multiple_choice',
        prompt: 'Largest planet?',
        media: [],
        choices: ['Earth', 'Jupiter', 'Mars'],
        answer: 1,
        category_id: null,
      }),
    );
  });

  it('will not save a multiple choice question with matching choices', async () => {
    await setup(FLAT);

    await click(screen.getByRole('button', { name: /Add Question/ }));
    await change('Question editor', 'Pick one');
    await change('Choice A', 'Same');
    await change('Choice B', 'same');
    await click(screen.getByRole('button', { name: 'Remove choice D' }));
    await click(screen.getByRole('button', { name: 'Remove choice C' }));

    const submit = screen
      .getAllByRole('button', { name: 'Add Question' })
      .find((button) => button.getAttribute('form') === 'question-form');
    await waitFor(() => expect(submit).toBeDisabled());
  });

  it("starts a new question as its category's type", async () => {
    await setup(CATEGORIZED);

    const history = screen.getByRole('region', { name: 'History' });
    await click(within(history).getByRole('button', { name: 'Add question to History' }));
    expect(screen.getByLabelText('Category')).toHaveValue('cat-history');
    await change('Question editor', 'Who painted the Mona Lisa?');
    await change('Answer', 'Leonardo da Vinci');
    await submitQuestion();

    await waitFor(() =>
      expect(mocks.addQuestion).toHaveBeenCalledWith({
        media: [],
        question_type: 'written',
        prompt: 'Who painted the Mona Lisa?',
        choices: null,
        answer: 'Leonardo da Vinci',
        category_id: 'cat-history',
      }),
    );
  });

  it('can still give a question another type than its category', async () => {
    await setup(CATEGORIZED);

    const history = screen.getByRole('region', { name: 'History' });
    await click(within(history).getByRole('button', { name: 'Add question to History' }));
    await click(screen.getByRole('button', { name: 'True or False' }));
    await change('Question editor', 'Rome was built in a day.');
    await click(screen.getByRole('button', { name: 'False' }));
    // Picking a type by hand keeps it when the category changes.
    await change('Category', 'cat-music');
    await submitQuestion();

    await waitFor(() =>
      expect(mocks.addQuestion).toHaveBeenCalledWith({
        media: [],
        question_type: 'true_false',
        prompt: 'Rome was built in a day.',
        choices: null,
        answer: false,
        category_id: 'cat-music',
      }),
    );
  });

  it("switches a new question to another category's type until a type is picked", async () => {
    await setup(CATEGORIZED);

    const music = screen.getByRole('region', { name: 'Music' });
    await click(within(music).getByRole('button', { name: 'Add question to Music' }));
    expect(screen.getByRole('group', { name: 'Choices' })).toBeInTheDocument();

    await change('Category', 'cat-history');

    expect(screen.queryByRole('group', { name: 'Choices' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Answer')).toBeInTheDocument();
  });

  it("edits a category's name and question type", async () => {
    await setup(CATEGORIZED);

    const music = screen.getByRole('region', { name: 'Music' });
    await click(within(music).getByRole('button', { name: /More actions/ }));
    await click(screen.getByRole('button', { name: /^Edit$/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('Music');
    await click(screen.getByRole('button', { name: 'True or False' }));
    const submit = screen
      .getAllByRole('button', { name: 'Save Changes' })
      .find((button) => button.getAttribute('form') === 'category-form')!;
    await waitFor(() => expect(submit).toBeEnabled());
    await click(submit);

    await waitFor(() =>
      expect(mocks.updateCategory).toHaveBeenCalledWith('cat-music', {
        name: 'Music',
        question_type: 'true_false',
        round_id: null,
      }),
    );
  });

  it('edits a question with its saved answer filled in', async () => {
    await setup(FLAT);

    await click(screen.getByRole('button', { name: 'Edit question 3' }));
    expect(screen.getByLabelText('Answer')).toHaveValue('Ada Lovelace');
    await change('Answer', 'Ada King');
    await submitQuestion('Save Changes');

    await waitFor(() =>
      expect(mocks.updateQuestion).toHaveBeenCalledWith(
        'q-w',
        expect.objectContaining({ question_type: 'written', answer: 'Ada King' }),
      ),
    );
  });

  it('deletes a category after warning about its questions', async () => {
    await setup(CATEGORIZED);

    const music = screen.getByRole('region', { name: 'Music' });
    await click(within(music).getByRole('button', { name: /More actions/ }));
    await click(screen.getByRole('button', { name: /^Delete$/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Music and its 2 questions');
    await click(within(dialog).getByRole('button', { name: /Delete/ }));

    await waitFor(() => expect(mocks.deleteCategory).toHaveBeenCalledWith('cat-music'));
  });

  describe('rounds', () => {
    it('shows each round over its categories, with an intermission between rounds', async () => {
      await setup(ROUNDS);

      expect(screen.getByLabelText('2 rounds')).toBeInTheDocument();
      expect(screen.getByLabelText('3 categories')).toBeInTheDocument();
      expect(screen.getAllByRole('separator', { name: 'Intermission' })).toHaveLength(1);

      const round1 = screen.getByRole('region', { name: 'Round 1' });
      expect(within(round1).getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
      expect(within(round1).getByLabelText('2 categories')).toBeInTheDocument();
      expect(within(round1).getAllByLabelText('2 questions')).toHaveLength(2);
      expect(within(round1).getByRole('region', { name: 'Music' })).toBeInTheDocument();
      expect(
        within(within(round1).getByRole('region', { name: 'Movies' })).getByText(
          'No questions in this category yet.',
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: 'Round 2' })).getByText(
          'Who wrote the first program?',
        ),
      ).toBeInTheDocument();
    });

    it('moves a round from its menu', async () => {
      await setup(ROUNDS);

      await openRoundMenu(screen.getByRole('region', { name: 'Round 1' }));
      expect(screen.getByRole('button', { name: /Move Up/ })).toBeDisabled();
      await click(screen.getByRole('button', { name: /Move Down/ }));

      expect(mocks.saveOrder).toHaveBeenCalledWith({
        rounds: [
          { id: 'round-2', categories: [{ id: 'cat-history', question_ids: ['q-w'] }] },
          {
            id: 'round-1',
            categories: [
              { id: 'cat-music', question_ids: ['q-mc', 'q-tf'] },
              { id: 'cat-movies', question_ids: [] },
            ],
          },
        ],
      });
    });

    it('moves a category within its round', async () => {
      await setup(ROUNDS);

      const movies = screen.getByRole('region', { name: 'Movies' });
      await click(within(movies).getByRole('button', { name: /More actions/ }));
      expect(screen.getByRole('button', { name: /Move Down/ })).toBeDisabled();
      await click(screen.getByRole('button', { name: /Move Up/ }));

      expect(mocks.saveOrder).toHaveBeenCalledWith({
        rounds: [
          {
            id: 'round-1',
            categories: [
              { id: 'cat-movies', question_ids: [] },
              { id: 'cat-music', question_ids: ['q-mc', 'q-tf'] },
            ],
          },
          { id: 'round-2', categories: [{ id: 'cat-history', question_ids: ['q-w'] }] },
        ],
      });
    });

    it('adds a category to the round it was added from', async () => {
      await setup(ROUNDS);

      await click(screen.getByRole('button', { name: 'Add category to Round 2' }));
      expect(screen.getByLabelText('Round')).toHaveValue('round-2');
      await change('Name', 'Sports');
      await submitForm('category-form', 'Add Category');

      await waitFor(() =>
        expect(mocks.addCategory).toHaveBeenCalledWith({
          name: 'Sports',
          question_type: 'multiple_choice',
          round_id: 'round-2',
        }),
      );
    });

    it('adds a round with the next round number as its name', async () => {
      await setup(ROUNDS);

      await click(screen.getByRole('button', { name: /Add Round/ }));
      expect(screen.getByLabelText('Name')).toHaveValue('Round 3');
      await submitForm('round-form', 'Add Round');

      await waitFor(() => expect(mocks.addRound).toHaveBeenCalledWith({ name: 'Round 3' }));
    });

    it("lists each question's category with its round", async () => {
      await setup(ROUNDS);

      await click(screen.getByRole('button', { name: 'Add question to Music' }));

      expect(screen.getByRole('option', { name: 'Round 1 · Music' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Round 2 · History' })).toBeInTheDocument();
    });

    it('deletes a round after warning about its categories and questions', async () => {
      await setup(ROUNDS);

      await openRoundMenu(screen.getByRole('region', { name: 'Round 1' }));
      await click(screen.getByRole('button', { name: /^Delete$/ }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Round 1 and its 2 categories and 2 questions');
      await click(within(dialog).getByRole('button', { name: /Delete/ }));

      await waitFor(() => expect(mocks.deleteRound).toHaveBeenCalledWith('round-1'));
    });
  });

  describe('question media', () => {
    const addLink = async (url: string) => {
      await change('Media link', url);
      await click(screen.getByRole('button', { name: /Add Link/ }));
    };

    it('lists the plain question and its media in each row', async () => {
      await setup(FLAT);

      expect(screen.getByText('Capital of Australia?')).toBeInTheDocument();
      expect(screen.getByText('Answer: False · 1 sound clip')).toBeInTheDocument();
    });

    it('saves a YouTube link with a formatted question', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await click(screen.getByRole('button', { name: 'True or False' }));
      await change('Question editor', '<p>This is <strong>Rick</strong>.</p>');
      await addLink('https://youtu.be/dQw4w9WgXcQ');
      expect(screen.getByRole('button', { name: 'Remove YouTube video' })).toBeInTheDocument();
      await submitQuestion();

      await waitFor(() =>
        expect(mocks.addQuestion).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: '<p>This is <strong>Rick</strong>.</p>',
            media: [{ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', name: null }],
          }),
        ),
      );
    });

    it('needs words in the question, not just formatting, without calling it an error', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await click(screen.getByRole('button', { name: 'True or False' }));
      await change('Question editor', '<p><strong> </strong></p>');

      await waitFor(() => expect(questionSubmit()).toBeDisabled());
      expect(screen.queryByText(/Add a question/)).not.toBeInTheDocument();
    });

    it('saves a question that is only media', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await click(screen.getByRole('button', { name: 'True or False' }));
      await change('Question editor', '<p> </p>');
      await waitFor(() => expect(questionSubmit()).toBeDisabled());

      await addLink('https://cdn.example.com/tune.mp3');
      await submitQuestion();

      await waitFor(() =>
        expect(mocks.addQuestion).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: '',
            media: [{ kind: 'audio', url: 'https://cdn.example.com/tune.mp3', name: null }],
          }),
        ),
      );
    });

    it('explains links it cannot use', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await addLink('http://example.com/a.jpg');
      expect(screen.getByText('Links must start with https://')).toBeInTheDocument();

      await addLink('https://example.com/page');
      expect(screen.getByText(/Use a YouTube link/)).toBeInTheDocument();
    });

    it('uploads a sound clip and saves its link', async () => {
      (uploadQuestionMedia as jest.Mock).mockResolvedValue(
        'https://abc.public.blob.vercel-storage.com/quiz-media/tune-x1.mp3',
      );
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await click(screen.getByRole('button', { name: 'True or False' }));
      await change('Question editor', 'Name that tune');
      const file = new File(['abc'], 'tune.mp3', { type: 'audio/mpeg' });
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      expect(uploadQuestionMedia).toHaveBeenCalledWith(file, expect.any(Function));
      expect(await screen.findByRole('button', { name: 'Remove tune.mp3' })).toBeInTheDocument();
      await submitQuestion();

      await waitFor(() =>
        expect(mocks.addQuestion).toHaveBeenCalledWith(
          expect.objectContaining({
            media: [
              {
                kind: 'audio',
                url: 'https://abc.public.blob.vercel-storage.com/quiz-media/tune-x1.mp3',
                name: 'tune.mp3',
              },
            ],
          }),
        ),
      );
    });

    it('offers links only until uploads are set up', async () => {
      (useUploadsEnabled as jest.Mock).mockReturnValue(false);
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));

      expect(screen.getByLabelText('Upload media')).toBeDisabled();
      expect(screen.getByText('File uploads aren’t set up yet')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Media link' })).toBeEnabled();
    });

    it("removes a question's media when editing it", async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: 'Edit question 2' }));
      await click(screen.getByRole('button', { name: 'Remove bat.mp3' }));
      await submitQuestion('Save Changes');

      await waitFor(() =>
        expect(mocks.updateQuestion).toHaveBeenCalledWith(
          'q-tf',
          expect.objectContaining({ media: [] }),
        ),
      );
    });

    it('offers to add media only until the question has one', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: 'Edit question 2' }));
      expect(screen.queryByLabelText('Media link')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Upload media')).not.toBeInTheDocument();

      await click(screen.getByRole('button', { name: 'Remove bat.mp3' }));
      expect(screen.getByLabelText('Media link')).toBeInTheDocument();
      expect(screen.getByLabelText('Upload media')).toBeInTheDocument();
    });

    // Paste events carry what was copied; these stand in for the browser's clipboard.
    const clipboard = (files: File[], data: Record<string, string> = {}) => ({
      clipboardData: { files, getData: (type: string) => data[type] ?? '' },
    });

    it('adds a link pasted into the link box straight away', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      await act(async () => {
        fireEvent.paste(
          screen.getByLabelText('Media link'),
          clipboard([], { text: 'https://youtu.be/dQw4w9WgXcQ' }),
        );
      });

      expect(screen.getByRole('button', { name: 'Remove YouTube video' })).toBeInTheDocument();
      // One media item per question, so there's nowhere to add another.
      expect(screen.queryByLabelText('Media link')).not.toBeInTheDocument();
      // The type follows what was added.
      expect(screen.getByRole('button', { name: 'Video' })).toBeDisabled();
    });

    it('asks whether to add a photo, video or audio', async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      expect(screen.getByText('Upload Photo')).toBeInTheDocument();
      expect(screen.getByLabelText('Upload media')).toHaveAttribute('accept', 'image/*');

      await click(screen.getByRole('button', { name: 'Audio' }));
      expect(screen.getByText('Upload Sound Clip')).toBeInTheDocument();
      expect(screen.getByLabelText('Upload media')).toHaveAttribute('accept', 'audio/*');
      expect(screen.getByLabelText('Media link')).toHaveAttribute(
        'placeholder',
        'Or paste a sound clip link',
      );
    });

    it("shows an edited question's media type, locked until the media is removed", async () => {
      await setup(FLAT);

      await click(screen.getByRole('button', { name: 'Edit question 2' }));
      expect(screen.getByRole('button', { name: 'Audio' })).toBeDisabled();

      await click(screen.getByRole('button', { name: 'Remove bat.mp3' }));
      expect(screen.getByRole('button', { name: 'Audio' })).toBeEnabled();
      expect(screen.getByText('Upload Sound Clip')).toBeInTheDocument();
    });

    it('uploads a file pasted anywhere in the form', async () => {
      (uploadQuestionMedia as jest.Mock).mockResolvedValue(
        'https://abc.public.blob.vercel-storage.com/quiz-media/shot-x1.png',
      );
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      const file = new File(['png'], 'shot.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.paste(screen.getByLabelText('Question editor'), clipboard([file]));
      });

      expect(uploadQuestionMedia).toHaveBeenCalledWith(file, expect.any(Function));
      expect(await screen.findByRole('button', { name: 'Remove shot.png' })).toBeInTheDocument();
    });

    it('replaces the media with a pasted file', async () => {
      (uploadQuestionMedia as jest.Mock).mockResolvedValue(
        'https://abc.public.blob.vercel-storage.com/quiz-media/owl-x1.png',
      );
      await setup(FLAT);

      await click(screen.getByRole('button', { name: 'Edit question 2' }));
      const file = new File(['png'], 'owl.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.paste(screen.getByLabelText('Question editor'), clipboard([file]));
      });

      expect(await screen.findByRole('button', { name: 'Remove owl.png' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove bat.mp3' })).not.toBeInTheDocument();
      await submitQuestion('Save Changes');
      await waitFor(() =>
        expect(mocks.updateQuestion).toHaveBeenCalledWith(
          'q-tf',
          expect.objectContaining({
            media: [
              {
                kind: 'image',
                url: 'https://abc.public.blob.vercel-storage.com/quiz-media/owl-x1.png',
                name: 'owl.png',
              },
            ],
          }),
        ),
      );
    });

    it('adds a copied web photo by its link until uploads are set up', async () => {
      (useUploadsEnabled as jest.Mock).mockReturnValue(false);
      await setup(FLAT);

      await click(screen.getByRole('button', { name: /Add Question/ }));
      const file = new File(['png'], 'image.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.paste(
          screen.getByLabelText('Question editor'),
          clipboard([file], { 'text/html': '<img src="https://cdn.example.com/owl.jpg">' }),
        );
      });

      expect(uploadQuestionMedia).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Remove Photo from cdn.example.com' }),
      ).toBeInTheDocument();

      // A copied file with no web link can't be added yet.
      await act(async () => {
        fireEvent.paste(screen.getByLabelText('Question editor'), clipboard([file]));
      });
      expect(
        screen.getByText('File uploads aren’t set up yet, so paste a link instead.'),
      ).toBeInTheDocument();
    });
  });
});
