'use strict';

jest.mock('../db', () => {
  const sql = jest.fn();
  sql.transaction = jest.fn();
  return { sql };
});
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  },
}));
jest.mock('../lib/quizzes', () => {
  const actual = jest.requireActual('../lib/quizzes');
  return {
    ...actual,
    fetchQuizDetail: jest.fn(),
    fetchQuizSummaries: jest.fn(),
    findOwnedQuiz: jest.fn(),
  };
});

const request = require('supertest');
const express = require('express');
const { del } = require('@vercel/blob');
const { sql } = require('../db');
const { errorHandler } = require('../middleware/errors');
const { HttpError } = require('../middleware/errors');
const { fetchQuizDetail, fetchQuizSummaries, findOwnedQuiz } = require('../lib/quizzes');
const router = require('./quizzes');

const app = express();
app.use(express.json());
app.use('/api/quizzes', router);
app.use(errorHandler);

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const CAT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const Q1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const Q2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ROUND_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ROUND_2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const FLAT = {
  id: QUIZ_ID,
  owner_id: 'user-1',
  name: '80s',
  description: null,
  structure: 'flat',
};
const CATEGORIZED = { ...FLAT, structure: 'categorized' };
const ROUNDS = { ...FLAT, structure: 'rounds' };
const DETAIL = { id: QUIZ_ID, name: '80s', categories: [], questions: [] };

/** The SQL text of every query handed to the most recent transaction. */
const transactionSql = () => {
  const queryCount = sql.transaction.mock.calls.at(-1)[0].length;
  return sql.mock.calls.slice(-queryCount).map((call) => call[0].join('?'));
};

beforeEach(() => {
  jest.clearAllMocks();
  sql.mockResolvedValue([]);
  sql.transaction.mockResolvedValue([]);
  findOwnedQuiz.mockResolvedValue(FLAT);
  fetchQuizDetail.mockResolvedValue(DETAIL);
  fetchQuizSummaries.mockResolvedValue([{ id: QUIZ_ID, name: '80s' }]);
});

describe('quizzes', () => {
  it("lists the planner's quizzes", async () => {
    const res = await request(app).get('/api/quizzes');

    expect(res.status).toBe(200);
    expect(fetchQuizSummaries).toHaveBeenCalledWith('user-1');
  });

  it('creates a quiz for the planner', async () => {
    sql.mockResolvedValueOnce([{ id: QUIZ_ID }]);

    const res = await request(app)
      .post('/api/quizzes')
      .send({ name: ' 80s ', structure: 'categorized' });

    expect(res.status).toBe(201);
    expect(sql.mock.calls[0].slice(1)).toEqual(['user-1', '80s', null, 'categorized']);
  });

  it("is a 404 for someone else's quiz", async () => {
    findOwnedQuiz.mockRejectedValueOnce(new HttpError(404, 'Quiz not found'));

    const res = await request(app).get(`/api/quizzes/${QUIZ_ID}`);

    expect(res.status).toBe(404);
    expect(fetchQuizDetail).not.toHaveBeenCalled();
  });

  it('moves existing questions into a General category when categories are turned on', async () => {
    const res = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}`)
      .send({ structure: 'categorized' });

    expect(res.status).toBe(200);
    const [update, general] = transactionSql();
    expect(update).toContain('UPDATE quizzes SET');
    expect(general).toContain('INSERT INTO quiz_categories');
    expect(general).toContain('UPDATE quiz_questions SET category_id');
  });

  it('flattens the questions in category order and drops the categories when turned off', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ structure: 'flat' });

    const [, flatten, drop] = transactionSql();
    expect(flatten).toContain('ROW_NUMBER() OVER');
    expect(drop).toContain('DELETE FROM quiz_categories');
  });

  it("puts a flat quiz's questions in a General category inside Round 1 when rounds are turned on", async () => {
    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ structure: 'rounds' });

    const [, move] = transactionSql();
    expect(move).toContain('INSERT INTO quiz_rounds');
    expect(move).toContain('INSERT INTO quiz_categories');
    expect(move).toContain('UPDATE quiz_questions SET category_id');
  });

  it('puts the existing categories in Round 1 when rounds are turned on', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ structure: 'rounds' });

    const [, move] = transactionSql();
    expect(move).toContain('INSERT INTO quiz_rounds');
    expect(move).toContain('UPDATE quiz_categories SET round_id');
  });

  it('keeps the categories, in round order, before deleting the rounds when rounds are turned off', async () => {
    findOwnedQuiz.mockResolvedValueOnce(ROUNDS);

    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ structure: 'categorized' });

    const [, renumber, drop, ...rest] = transactionSql();
    expect(renumber).toContain('UPDATE quiz_categories qc SET round_id = NULL');
    expect(drop).toContain('DELETE FROM quiz_rounds');
    expect(rest).toEqual([]);
  });

  it('flattens a rounds quiz into one list of questions', async () => {
    findOwnedQuiz.mockResolvedValueOnce(ROUNDS);

    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ structure: 'flat' });

    const [, flatten, dropCategories, dropRounds] = transactionSql();
    expect(flatten).toContain('ORDER BY r.position');
    expect(dropCategories).toContain('DELETE FROM quiz_categories');
    expect(dropRounds).toContain('DELETE FROM quiz_rounds');
  });

  it('only renames when the structure stays the same', async () => {
    await request(app).patch(`/api/quizzes/${QUIZ_ID}`).send({ name: 'Renamed' });

    expect(transactionSql()).toHaveLength(1);
  });
});

describe('PUT /api/quizzes/:id/order', () => {
  it('saves the new order of a categorized quiz in one transaction', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);
    sql
      .mockResolvedValueOnce([{ id: CAT_A }, { id: CAT_B }])
      .mockResolvedValueOnce([{ id: Q1 }, { id: Q2 }]);

    const res = await request(app)
      .put(`/api/quizzes/${QUIZ_ID}/order`)
      .send({
        categories: [
          { id: CAT_B, question_ids: [Q2, Q1] },
          { id: CAT_A, question_ids: [] },
        ],
      });

    expect(res.status).toBe(200);
    expect(sql.transaction).toHaveBeenCalledTimes(1);
    const categoryUpdate = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_categories'),
    );
    expect(categoryUpdate.slice(1, 3)).toEqual([
      [CAT_B, CAT_A],
      [0, 1],
    ]);
    const questionUpdate = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_questions'),
    );
    expect(questionUpdate.slice(1, 4)).toEqual([
      [Q2, Q1],
      [0, 1],
      [CAT_B, CAT_B],
    ]);
  });

  it('saves the order of rounds and moves categories between them', async () => {
    findOwnedQuiz.mockResolvedValueOnce(ROUNDS);
    sql
      .mockResolvedValueOnce([{ id: CAT_A }, { id: CAT_B }])
      .mockResolvedValueOnce([{ id: Q1 }])
      .mockResolvedValueOnce([{ id: ROUND_1 }, { id: ROUND_2 }]);

    const res = await request(app)
      .put(`/api/quizzes/${QUIZ_ID}/order`)
      .send({
        rounds: [
          { id: ROUND_2, categories: [] },
          {
            id: ROUND_1,
            categories: [
              { id: CAT_B, question_ids: [Q1] },
              { id: CAT_A, question_ids: [] },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    const roundUpdate = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_rounds'),
    );
    expect(roundUpdate.slice(1, 3)).toEqual([
      [ROUND_2, ROUND_1],
      [0, 1],
    ]);
    const categoryUpdate = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_categories'),
    );
    expect(categoryUpdate.slice(1, 4)).toEqual([
      [CAT_B, CAT_A],
      [0, 1],
      [ROUND_1, ROUND_1],
    ]);
  });

  it('rejects an order that leaves out a question', async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: Q1 }, { id: Q2 }]);

    const res = await request(app)
      .put(`/api/quizzes/${QUIZ_ID}/order`)
      .send({ question_ids: [Q1] });

    expect(res.status).toBe(400);
    expect(sql.transaction).not.toHaveBeenCalled();
  });
});

describe('rounds', () => {
  it('can only be added once the quiz has rounds', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/rounds`).send({ name: 'Round 2' });

    expect(res.status).toBe(400);
    expect(sql.transaction).not.toHaveBeenCalled();
  });

  it('are added at the end', async () => {
    findOwnedQuiz.mockResolvedValueOnce(ROUNDS);

    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/rounds`)
      .send({ name: ' Round 2 ' });

    expect(res.status).toBe(201);
    const [insert] = transactionSql();
    expect(insert).toContain('INSERT INTO quiz_rounds');
    expect(insert).toContain('COALESCE(MAX(position), -1) + 1');
    expect(sql.mock.calls.find((call) => call[0].join('?') === insert).slice(1, 3)).toEqual([
      QUIZ_ID,
      'Round 2',
    ]);
  });

  it('are renamed and deleted, and 404 when they belong to another quiz', async () => {
    findOwnedQuiz.mockResolvedValue(ROUNDS);
    sql.mockResolvedValueOnce([{ id: ROUND_1, name: 'Round 1' }]);
    const renamed = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/rounds/${ROUND_1}`)
      .send({ name: 'Finale' });
    expect(renamed.status).toBe(200);
    expect(transactionSql()[0]).toContain('UPDATE quiz_rounds SET name');

    sql.mockResolvedValueOnce([{ id: ROUND_1, name: 'Finale' }]);
    const deleted = await request(app).delete(`/api/quizzes/${QUIZ_ID}/rounds/${ROUND_1}`);
    expect(deleted.status).toBe(200);
    expect(transactionSql()[0]).toContain('DELETE FROM quiz_rounds');

    const missing = await request(app).delete(`/api/quizzes/${QUIZ_ID}/rounds/${ROUND_2}`);
    expect(missing.status).toBe(404);
  });
});

describe('categories', () => {
  it('can only be added once the quiz has categories', async () => {
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/categories`)
      .send({ name: 'Music' });

    expect(res.status).toBe(400);
    expect(sql.transaction).not.toHaveBeenCalled();
  });

  it('are added at the end', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/categories`)
      .send({ name: 'Music' });

    expect(res.status).toBe(201);
    expect(transactionSql()[0]).toContain('COALESCE(MAX(position), -1) + 1');
    expect(res.body).toEqual(DETAIL);
  });

  it('are created with the type their new questions start as', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/categories`)
      .send({ name: 'Music', question_type: 'true_false' });

    const insert = sql.mock.calls.find((call) =>
      call[0].join('?').includes('INSERT INTO quiz_categories'),
    );
    expect(insert.slice(1, 4)).toEqual([QUIZ_ID, 'Music', 'true_false']);
  });

  it('need a round in a rounds quiz, and are added at the end of it', async () => {
    findOwnedQuiz.mockResolvedValue(ROUNDS);

    const missing = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/categories`)
      .send({ name: 'Music' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Choose a round for this category');

    sql.mockResolvedValueOnce([{ id: ROUND_1 }]);
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/categories`)
      .send({ name: 'Music', round_id: ROUND_1 });
    expect(res.status).toBe(201);
    const insert = sql.mock.calls.find((call) =>
      call[0].join('?').includes('INSERT INTO quiz_categories'),
    );
    expect(insert.slice(1)).toEqual([
      QUIZ_ID,
      'Music',
      'multiple_choice',
      ROUND_1,
      QUIZ_ID,
      ROUND_1,
    ]);
  });

  it('move to the end of another round', async () => {
    findOwnedQuiz.mockResolvedValue(ROUNDS);
    sql
      .mockResolvedValueOnce([
        {
          id: CAT_A,
          round_id: ROUND_1,
          name: 'Music',
          question_type: 'multiple_choice',
        },
      ])
      .mockResolvedValueOnce([{ id: ROUND_2 }]);

    const res = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/categories/${CAT_A}`)
      .send({ round_id: ROUND_2 });

    expect(res.status).toBe(200);
    const update = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_categories'),
    );
    expect(update[0].join('?')).toContain('COALESCE(MAX(position), -1) + 1');
    expect(update.slice(1, 4)).toEqual(['Music', 'multiple_choice', ROUND_2]);
  });

  it('keep their type when only renamed', async () => {
    sql.mockResolvedValueOnce([{ id: CAT_A, name: 'Music', question_type: 'written' }]);

    const res = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/categories/${CAT_A}`)
      .send({ name: 'Songs' });

    expect(res.status).toBe(200);
    const update = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_categories'),
    );
    expect(update.slice(1, 3)).toEqual(['Songs', 'written']);
  });
});

describe('questions', () => {
  const MC = {
    question_type: 'multiple_choice',
    prompt: 'Capital of France?',
    choices: ['Paris', 'Lyon'],
    answer: 0,
  };

  it('are added to the end of a flat quiz with their choices as JSON', async () => {
    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/questions`).send(MC);

    expect(res.status).toBe(201);
    const insert = sql.mock.calls.find((call) =>
      call[0].join('?').includes('INSERT INTO quiz_questions'),
    );
    expect(insert.slice(1)).toEqual([
      QUIZ_ID,
      null,
      'multiple_choice',
      '<p>Capital of France?</p>',
      '["Paris","Lyon"]',
      '0',
      '[]',
      QUIZ_ID,
      null,
    ]);
  });

  it('need a category in a categorized quiz', async () => {
    findOwnedQuiz.mockResolvedValueOnce(CATEGORIZED);

    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/questions`).send(MC);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Choose a category for this question');
  });

  it('start their answer over when the type changes', async () => {
    sql.mockResolvedValueOnce([
      {
        id: Q1,
        category_id: null,
        question_type: 'multiple_choice',
        prompt: 'Q',
        choices: ['A', 'B'],
        answer: 1,
      },
    ]);

    const toTrueFalse = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`)
      .send({ question_type: 'true_false' });

    expect(toTrueFalse.status).toBe(400);
    expect(toTrueFalse.body.error).toBe('answer must be true or false');
  });

  it('can be edited without resending every field', async () => {
    sql.mockResolvedValueOnce([
      {
        id: Q1,
        category_id: null,
        question_type: 'written',
        prompt: 'Who?',
        choices: null,
        answer: 'Ada',
      },
    ]);

    const res = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`)
      .send({ prompt: 'Who wrote the first program?' });

    expect(res.status).toBe(200);
    const update = sql.mock.calls.find((call) =>
      call[0].join('?').includes('UPDATE quiz_questions'),
    );
    expect(update.slice(1, 6)).toEqual([
      'written',
      '<p>Who wrote the first program?</p>',
      null,
      '"Ada"',
      '[]',
    ]);
  });

  it('is a 404 for a question in another quiz', async () => {
    const res = await request(app).delete(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`);

    expect(res.status).toBe(404);
    expect(sql.transaction).not.toHaveBeenCalled();
  });
});

describe('question media', () => {
  const UPLOADED = 'https://abc.public.blob.vercel-storage.com/quiz-media/song-x1.mp3';
  const LINKED = 'https://example.com/photo.jpg';
  const stored = (media) => ({
    id: Q1,
    category_id: null,
    question_type: 'true_false',
    prompt: '<p>Name that tune</p>',
    media,
    choices: null,
    answer: true,
  });

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('are saved with the question and its formatting kept', async () => {
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/questions`)
      .send({
        question_type: 'true_false',
        prompt: '<p>Is this <strong>bold</strong>?<script>x</script></p>',
        answer: true,
        media: [{ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' }],
      });

    expect(res.status).toBe(201);
    const insert = sql.mock.calls.find((call) =>
      call[0].join('?').includes('INSERT INTO quiz_questions'),
    );
    expect(insert[4]).toBe('<p>Is this <strong>bold</strong>?</p>');
    expect(JSON.parse(insert[7])).toEqual([
      { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', name: null },
    ]);
  });

  it('delete an uploaded file once the question stops using it, but never a linked one', async () => {
    sql.mockResolvedValueOnce([
      stored([
        { kind: 'audio', url: UPLOADED, name: 'song.mp3' },
        { kind: 'audio', url: LINKED, name: null },
      ]),
    ]);

    const res = await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`)
      .send({ media: [] });

    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith([UPLOADED]);
  });

  it('keep uploaded files the question still uses', async () => {
    const media = [{ kind: 'audio', url: UPLOADED, name: 'song.mp3' }];
    sql.mockResolvedValueOnce([stored(media)]);

    await request(app)
      .patch(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`)
      .send({ prompt: 'Name that song' });

    expect(del).not.toHaveBeenCalled();
  });

  it('are deleted with their question', async () => {
    sql.mockResolvedValueOnce([stored([{ kind: 'audio', url: UPLOADED, name: null }])]);

    await request(app).delete(`/api/quizzes/${QUIZ_ID}/questions/${Q1}`);

    expect(del).toHaveBeenCalledWith([UPLOADED]);
  });

  it('are deleted with their quiz', async () => {
    sql.mockResolvedValueOnce([{ media: [{ kind: 'video', url: UPLOADED, name: null }] }]);

    await request(app).delete(`/api/quizzes/${QUIZ_ID}`);

    expect(del).toHaveBeenCalledWith([UPLOADED]);
  });

  it('must be https links', async () => {
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/questions`)
      .send({
        question_type: 'true_false',
        prompt: 'Q',
        answer: true,
        media: [{ kind: 'image', url: 'http://example.com/a.jpg' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('media 1 must be an https link');
  });
});
