'use strict';

jest.mock('../db', () => ({ sql: jest.fn() }));

const { sql } = require('../db');
const {
  assertOwnQuiz,
  findOwnedQuiz,
  normalizeCategoryInput,
  normalizeQuestionInput,
  normalizeQuizInput,
  normalizeRoundInput,
  planQuizOrder,
  resolveCategoryRound,
  resolveQuestionCategory,
} = require('./quizzes');

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const CAT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROUND_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ROUND_2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

beforeEach(() => jest.clearAllMocks());

describe('normalizeQuizInput', () => {
  it('trims the fields and defaults to a flat quiz', () => {
    expect(normalizeQuizInput({ name: ' 80s Night ', description: '  ' })).toEqual({
      name: '80s Night',
      description: null,
      structure: 'flat',
    });
  });

  it('accepts categories and rounds, and rejects unknown structures', () => {
    expect(normalizeQuizInput({ name: 'Q', structure: 'categorized' }).structure).toBe(
      'categorized',
    );
    expect(normalizeQuizInput({ name: 'Q', structure: 'rounds' }).structure).toBe('rounds');
    expect(() => normalizeQuizInput({ name: 'Q', structure: 'sections' })).toThrow(/structure/);
    expect(() => normalizeQuizInput({ name: ' ' })).toThrow('name is required');
  });
});

describe('normalizeRoundInput', () => {
  it('needs a name', () => {
    expect(normalizeRoundInput({ name: ' Round 2 ' })).toEqual({
      name: 'Round 2',
    });
    expect(() => normalizeRoundInput({ name: '' })).toThrow('name is required');
  });
});

describe('normalizeCategoryInput', () => {
  it('defaults new questions to multiple choice and checks the type', () => {
    expect(normalizeCategoryInput({ name: ' Music ' })).toEqual({
      name: 'Music',
      question_type: 'multiple_choice',
    });
    expect(normalizeCategoryInput({ name: 'Music', question_type: 'written' }).question_type).toBe(
      'written',
    );
    expect(() => normalizeCategoryInput({ name: 'Music', question_type: 'essay' })).toThrow(
      /question_type/,
    );
  });
});

describe('normalizeQuestionInput', () => {
  it('keeps the choices and the index of the correct one for multiple choice', () => {
    expect(
      normalizeQuestionInput({
        question_type: 'multiple_choice',
        prompt: ' Capital of France? ',
        choices: [' Paris ', 'Lyon', 'Nice'],
        answer: 0,
      }),
    ).toEqual({
      question_type: 'multiple_choice',
      prompt: '<p>Capital of France?</p>',
      media: [],
      choices: ['Paris', 'Lyon', 'Nice'],
      answer: 0,
    });
  });

  it.each([
    [{ choices: ['Only one'], answer: 0 }, /2 to 6 choices/],
    [{ choices: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], answer: 0 }, /2 to 6 choices/],
    [{ choices: ['Paris', 'paris'], answer: 0 }, /different/],
    [{ choices: ['A', ''], answer: 0 }, /choice 2 is required/],
    [{ choices: ['A', 'B'], answer: 2 }, /index of one of the choices/],
    [{ choices: ['A', 'B'], answer: '0' }, /index of one of the choices/],
    [{ answer: 0 }, /choices must be a list/],
  ])('rejects multiple choice %#', (fields, message) => {
    expect(() =>
      normalizeQuestionInput({
        question_type: 'multiple_choice',
        prompt: 'Q',
        ...fields,
      }),
    ).toThrow(message);
  });

  it('stores a true/false answer and drops any choices', () => {
    expect(
      normalizeQuestionInput({
        question_type: 'true_false',
        prompt: 'The sky is blue',
        choices: ['x', 'y'],
        answer: false,
      }),
    ).toEqual({
      question_type: 'true_false',
      prompt: '<p>The sky is blue</p>',
      media: [],
      choices: null,
      answer: false,
    });
    expect(() =>
      normalizeQuestionInput({
        question_type: 'true_false',
        prompt: 'Q',
        answer: 'true',
      }),
    ).toThrow('answer must be true or false');
  });

  it('requires the expected answer for a written question', () => {
    expect(
      normalizeQuestionInput({
        question_type: 'written',
        prompt: 'Who?',
        answer: ' Ada ',
      }),
    ).toEqual({
      question_type: 'written',
      prompt: '<p>Who?</p>',
      media: [],
      choices: null,
      answer: 'Ada',
    });
    expect(() =>
      normalizeQuestionInput({
        question_type: 'written',
        prompt: 'Who?',
        answer: '',
      }),
    ).toThrow('answer is required');
  });

  it('rejects unknown types and blank prompts', () => {
    expect(() => normalizeQuestionInput({ question_type: 'essay', prompt: 'Q' })).toThrow(
      /question_type/,
    );
    expect(() =>
      normalizeQuestionInput({
        question_type: 'written',
        prompt: '',
        answer: 'A',
      }),
    ).toThrow('prompt is required');
  });
});

describe('planQuizOrder', () => {
  it('numbers the questions of a flat quiz in the order given', () => {
    expect(
      planQuizOrder(
        'flat',
        { question_ids: ['q2', 'q1'] },
        { categoryIds: [], questionIds: ['q1', 'q2'] },
      ),
    ).toEqual({
      rounds: [],
      categories: [],
      questions: [
        { id: 'q2', category_id: null, position: 0 },
        { id: 'q1', category_id: null, position: 1 },
      ],
    });
  });

  it('orders categories and their questions, including moves between categories', () => {
    const plan = planQuizOrder(
      'categorized',
      {
        categories: [
          { id: CAT_B, question_ids: ['q3', 'q1'] },
          { id: CAT_A, question_ids: ['q2'] },
        ],
      },
      { categoryIds: [CAT_A, CAT_B], questionIds: ['q1', 'q2', 'q3'] },
    );

    expect(plan.rounds).toEqual([]);
    expect(plan.categories).toEqual([
      { id: CAT_B, round_id: null, position: 0 },
      { id: CAT_A, round_id: null, position: 1 },
    ]);
    expect(plan.questions).toEqual([
      { id: 'q3', category_id: CAT_B, position: 0 },
      { id: 'q1', category_id: CAT_B, position: 1 },
      { id: 'q2', category_id: CAT_A, position: 0 },
    ]);
  });

  it.each([
    ['a missing question', { question_ids: ['q1'] }],
    ['a repeated question', { question_ids: ['q1', 'q1'] }],
    ['a question from elsewhere', { question_ids: ['q1', 'other'] }],
  ])('rejects %s', (_label, body) => {
    expect(() =>
      planQuizOrder('flat', body, {
        categoryIds: [],
        questionIds: ['q1', 'q2'],
      }),
    ).toThrow(/exactly once/);
  });

  it('orders rounds, numbering categories within each round, including moves between rounds', () => {
    const plan = planQuizOrder(
      'rounds',
      {
        rounds: [
          { id: ROUND_2, categories: [{ id: CAT_A, question_ids: ['q1'] }] },
          {
            id: ROUND_1,
            categories: [
              { id: CAT_B, question_ids: ['q2'] },
              { id: 'cat-c', question_ids: [] },
            ],
          },
        ],
      },
      {
        roundIds: [ROUND_1, ROUND_2],
        categoryIds: [CAT_A, CAT_B, 'cat-c'],
        questionIds: ['q1', 'q2'],
      },
    );

    expect(plan.rounds).toEqual([
      { id: ROUND_2, position: 0 },
      { id: ROUND_1, position: 1 },
    ]);
    expect(plan.categories).toEqual([
      { id: CAT_A, round_id: ROUND_2, position: 0 },
      { id: CAT_B, round_id: ROUND_1, position: 0 },
      { id: 'cat-c', round_id: ROUND_1, position: 1 },
    ]);
    expect(plan.questions).toEqual([
      { id: 'q1', category_id: CAT_A, position: 0 },
      { id: 'q2', category_id: CAT_B, position: 0 },
    ]);
  });

  it('rejects a rounds order that leaves out a round', () => {
    expect(() =>
      planQuizOrder(
        'rounds',
        { rounds: [{ id: ROUND_1, categories: [] }] },
        { roundIds: [ROUND_1, ROUND_2], categoryIds: [], questionIds: [] },
      ),
    ).toThrow(/exactly once/);
  });

  it('rejects a categorized order that leaves out a category', () => {
    expect(() =>
      planQuizOrder(
        'categorized',
        { categories: [{ id: CAT_A, question_ids: ['q1'] }] },
        { categoryIds: [CAT_A, CAT_B], questionIds: ['q1'] },
      ),
    ).toThrow(/exactly once/);
  });
});

describe('findOwnedQuiz', () => {
  it("is a 404 for malformed ids and other planners' quizzes", async () => {
    await expect(findOwnedQuiz('user-1', 'nope')).rejects.toMatchObject({
      status: 404,
    });
    expect(sql).not.toHaveBeenCalled();

    sql.mockResolvedValueOnce([]);
    await expect(findOwnedQuiz('user-1', QUIZ_ID)).rejects.toMatchObject({
      status: 404,
    });
    expect(sql.mock.calls[0].slice(1)).toEqual([QUIZ_ID, 'user-1']);
  });
});

describe('assertOwnQuiz', () => {
  it('allows no quiz and rejects a quiz the planner does not own', async () => {
    await expect(assertOwnQuiz('user-1', null)).resolves.toBeUndefined();
    expect(sql).not.toHaveBeenCalled();

    sql.mockResolvedValueOnce([]);
    await expect(assertOwnQuiz('user-1', QUIZ_ID)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('resolveCategoryRound', () => {
  it('takes no round outside a rounds quiz', async () => {
    const quiz = { id: QUIZ_ID, structure: 'categorized' };
    await expect(resolveCategoryRound(quiz, null)).resolves.toBe(null);
    await expect(resolveCategoryRound(quiz, ROUND_1)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("requires one of the quiz's own rounds in a rounds quiz", async () => {
    const quiz = { id: QUIZ_ID, structure: 'rounds' };
    await expect(resolveCategoryRound(quiz, undefined)).rejects.toThrow(/Choose a round/);

    sql.mockResolvedValueOnce([]);
    await expect(resolveCategoryRound(quiz, ROUND_2)).rejects.toMatchObject({
      status: 400,
    });

    sql.mockResolvedValueOnce([{ id: ROUND_1 }]);
    await expect(resolveCategoryRound(quiz, ROUND_1)).resolves.toBe(ROUND_1);
  });
});

describe('resolveQuestionCategory', () => {
  it('takes no category in a flat quiz', async () => {
    await expect(resolveQuestionCategory({ id: QUIZ_ID, structure: 'flat' }, null)).resolves.toBe(
      null,
    );
    await expect(
      resolveQuestionCategory({ id: QUIZ_ID, structure: 'flat' }, CAT_A),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires one of the quiz's own categories when it has categories", async () => {
    const quiz = { id: QUIZ_ID, structure: 'categorized' };
    await expect(resolveQuestionCategory(quiz, undefined)).rejects.toThrow(/Choose a category/);

    sql.mockResolvedValueOnce([]);
    await expect(resolveQuestionCategory(quiz, CAT_B)).rejects.toMatchObject({
      status: 400,
    });

    sql.mockResolvedValueOnce([{ id: CAT_A }]);
    await expect(resolveQuestionCategory(quiz, CAT_A)).resolves.toBe(CAT_A);
  });
});
