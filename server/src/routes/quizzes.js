'use strict';

// A planner's quizzes, their rounds, categories and questions. Every route is limited to
// the signed-in planner's own quizzes. Changes to rounds, categories and questions respond with
// the whole quiz, so the client can show the new order without another request.

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { HttpError, asyncRoute } = require('../middleware/errors');
const { sql } = require('../db');
const { deleteUploadedMedia, mediaUrls } = require('../lib/uploads');
const { isUuid } = require('../lib/validation');
const {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_ROUND_NAME,
  fetchQuizDetail,
  fetchQuizSummaries,
  findOwnedQuiz,
  normalizeCategoryInput,
  normalizeQuestionInput,
  normalizeQuizInput,
  normalizeRoundInput,
  planQuizOrder,
  resolveCategoryRound,
  resolveQuestionCategory,
  toJson,
} = require('../lib/quizzes');

router.use(requireAuth);

const touchQuiz = (quizId) => sql`UPDATE quizzes SET updated_at = NOW() WHERE id = ${quizId}`;

async function findRound(quizId, roundId) {
  if (!isUuid(roundId)) throw new HttpError(404, 'Round not found');
  const [round] = await sql`
    SELECT id, name FROM quiz_rounds WHERE id = ${roundId} AND quiz_id = ${quizId}
  `;
  if (!round) throw new HttpError(404, 'Round not found');
  return round;
}

async function findCategory(quizId, categoryId) {
  if (!isUuid(categoryId)) throw new HttpError(404, 'Category not found');
  const [category] = await sql`
    SELECT id, round_id, name, question_type
    FROM quiz_categories WHERE id = ${categoryId} AND quiz_id = ${quizId}
  `;
  if (!category) throw new HttpError(404, 'Category not found');
  return category;
}

/**
 * The queries that move a quiz's content into a new structure without losing any of it:
 * - Gaining categories puts a flat quiz's questions in a "General" category.
 * - Gaining rounds puts the existing categories (or that "General" category) in "Round 1".
 * - Losing rounds keeps the categories, in round order.
 * - Losing categories keeps every question, in order, and drops the categories and rounds.
 */
function restructureQueries(id, from, to) {
  if (from === to) return [];

  if (to === 'flat') {
    return [
      sql`
        UPDATE quiz_questions qq SET category_id = NULL, position = ordered.position
        FROM (
          SELECT q.id,
                 ROW_NUMBER() OVER (
                   ORDER BY r.position, r.created_at, c.position, c.created_at,
                            q.position, q.created_at
                 ) - 1 AS position
          FROM quiz_questions q
          LEFT JOIN quiz_categories c ON c.id = q.category_id
          LEFT JOIN quiz_rounds r ON r.id = c.round_id
          WHERE q.quiz_id = ${id}
        ) ordered
        WHERE qq.id = ordered.id
      `,
      sql`DELETE FROM quiz_categories WHERE quiz_id = ${id}`,
      sql`DELETE FROM quiz_rounds WHERE quiz_id = ${id}`,
    ];
  }

  if (from === 'flat' && to === 'categorized') {
    return [
      sql`
        WITH general AS (
          INSERT INTO quiz_categories (quiz_id, name, position)
          SELECT ${id}, ${DEFAULT_CATEGORY_NAME}, 0
          WHERE EXISTS (SELECT 1 FROM quiz_questions WHERE quiz_id = ${id})
          RETURNING id
        )
        UPDATE quiz_questions SET category_id = (SELECT id FROM general)
        WHERE quiz_id = ${id}
      `,
    ];
  }

  if (from === 'flat' && to === 'rounds') {
    return [
      sql`
        WITH round AS (
          INSERT INTO quiz_rounds (quiz_id, name, position)
          SELECT ${id}, ${DEFAULT_ROUND_NAME}, 0
          WHERE EXISTS (SELECT 1 FROM quiz_questions WHERE quiz_id = ${id})
          RETURNING id
        ), general AS (
          INSERT INTO quiz_categories (quiz_id, round_id, name, position)
          SELECT ${id}, round.id, ${DEFAULT_CATEGORY_NAME}, 0 FROM round
          RETURNING id
        )
        UPDATE quiz_questions SET category_id = (SELECT id FROM general)
        WHERE quiz_id = ${id}
      `,
    ];
  }

  if (to === 'rounds') {
    return [
      sql`
        WITH round AS (
          INSERT INTO quiz_rounds (quiz_id, name, position)
          SELECT ${id}, ${DEFAULT_ROUND_NAME}, 0
          WHERE EXISTS (SELECT 1 FROM quiz_categories WHERE quiz_id = ${id})
          RETURNING id
        )
        UPDATE quiz_categories SET round_id = (SELECT id FROM round)
        WHERE quiz_id = ${id}
      `,
    ];
  }

  // rounds → categorized. The categories leave their rounds before the rounds are deleted,
  // so the delete doesn't cascade to them.
  return [
    sql`
      UPDATE quiz_categories qc SET round_id = NULL, position = ordered.position
      FROM (
        SELECT c.id,
               ROW_NUMBER() OVER (
                 ORDER BY r.position, r.created_at, c.position, c.created_at
               ) - 1 AS position
        FROM quiz_categories c
        LEFT JOIN quiz_rounds r ON r.id = c.round_id
        WHERE c.quiz_id = ${id}
      ) ordered
      WHERE qc.id = ordered.id
    `,
    sql`DELETE FROM quiz_rounds WHERE quiz_id = ${id}`,
  ];
}

async function findQuestion(quizId, questionId) {
  if (!isUuid(questionId)) throw new HttpError(404, 'Question not found');
  const [question] = await sql`
    SELECT id, category_id, question_type, prompt, media, choices, answer
    FROM quiz_questions WHERE id = ${questionId} AND quiz_id = ${quizId}
  `;
  if (!question) throw new HttpError(404, 'Question not found');
  return question;
}

// ---------------------------------------------------------------------------
// GET /api/quizzes  – the planner's quizzes with question, category and event counts
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncRoute(async (req, res) => res.json(await fetchQuizSummaries(req.user.id))),
);

// ---------------------------------------------------------------------------
// POST /api/quizzes  – Body: { name, description?, structure?: 'flat' | 'categorized' | 'rounds' }
// ---------------------------------------------------------------------------
router.post(
  '/',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const input = normalizeQuizInput(req.body);
    const [created] = await sql`
      INSERT INTO quizzes (owner_id, name, description, structure)
      VALUES (${userId}, ${input.name}, ${input.description}, ${input.structure})
      RETURNING id
    `;
    const [quiz] = await fetchQuizSummaries(userId, { id: created.id });
    return res.status(201).json(quiz);
  }),
);

// ---------------------------------------------------------------------------
// GET /api/quizzes/:id  – the quiz with its rounds, categories and questions, in order
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    await findOwnedQuiz(req.user.id, req.params.id);
    return res.json(await fetchQuizDetail(req.user.id, req.params.id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id  – Body: any of { name, description, structure }
// A structure change keeps every question; see restructureQueries.
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const current = await findOwnedQuiz(userId, id);
    const input = normalizeQuizInput({ ...current, ...req.body });

    await sql.transaction([
      sql`
        UPDATE quizzes SET
          name        = ${input.name},
          description = ${input.description},
          structure   = ${input.structure},
          updated_at  = NOW()
        WHERE id = ${id}
      `,
      ...restructureQueries(id, current.structure, input.structure),
    ]);

    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/quizzes/:id  – events that used the quiz are left without one
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    await findOwnedQuiz(userId, id);
    const media = await sql`SELECT media FROM quiz_questions WHERE quiz_id = ${id}`;
    await sql`DELETE FROM quizzes WHERE id = ${id} AND owner_id = ${userId}`;
    await deleteUploadedMedia(mediaUrls(media.map((row) => row.media)));
    return res.json({ id, deleted: true });
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/quizzes/:id/order  – save the planner's order of rounds, categories and questions
// Body (flat):        { question_ids: [...] }
// Body (categorized): { categories: [{ id, question_ids: [...] }, ...] }
// Body (rounds):      { rounds: [{ id, categories: [{ id, question_ids: [...] }, ...] }, ...] }
// ---------------------------------------------------------------------------
router.put(
  '/:id/order',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    const [categoryRows, questionRows, roundRows] = await Promise.all([
      sql`SELECT id FROM quiz_categories WHERE quiz_id = ${id}`,
      sql`SELECT id FROM quiz_questions WHERE quiz_id = ${id}`,
      sql`SELECT id FROM quiz_rounds WHERE quiz_id = ${id}`,
    ]);
    const plan = planQuizOrder(quiz.structure, req.body, {
      roundIds: roundRows.map((row) => row.id),
      categoryIds: categoryRows.map((row) => row.id),
      questionIds: questionRows.map((row) => row.id),
    });

    const queries = [touchQuiz(id)];
    if (plan.rounds.length > 0) {
      queries.push(sql`
        UPDATE quiz_rounds r SET position = o.position
        FROM unnest(
          ${plan.rounds.map((r) => r.id)}::uuid[],
          ${plan.rounds.map((r) => r.position)}::int[]
        ) AS o(id, position)
        WHERE r.id = o.id AND r.quiz_id = ${id}
      `);
    }
    if (plan.categories.length > 0) {
      queries.push(sql`
        UPDATE quiz_categories c SET position = o.position, round_id = o.round_id
        FROM unnest(
          ${plan.categories.map((c) => c.id)}::uuid[],
          ${plan.categories.map((c) => c.position)}::int[],
          ${plan.categories.map((c) => c.round_id)}::uuid[]
        ) AS o(id, position, round_id)
        WHERE c.id = o.id AND c.quiz_id = ${id}
      `);
    }
    if (plan.questions.length > 0) {
      queries.push(sql`
        UPDATE quiz_questions q SET
          position    = o.position,
          category_id = o.category_id,
          updated_at  = NOW()
        FROM unnest(
          ${plan.questions.map((q) => q.id)}::uuid[],
          ${plan.questions.map((q) => q.position)}::int[],
          ${plan.questions.map((q) => q.category_id)}::uuid[]
        ) AS o(id, position, category_id)
        WHERE q.id = o.id AND q.quiz_id = ${id}
      `);
    }
    await sql.transaction(queries);

    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/rounds  – Body: { name }. Added at the end.
// ---------------------------------------------------------------------------
router.post(
  '/:id/rounds',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    if (quiz.structure !== 'rounds') {
      throw new HttpError(400, 'Turn on rounds for this quiz first');
    }
    const input = normalizeRoundInput(req.body);
    await sql.transaction([
      sql`
        INSERT INTO quiz_rounds (quiz_id, name, position)
        SELECT ${id}, ${input.name}, COALESCE(MAX(position), -1) + 1
        FROM quiz_rounds WHERE quiz_id = ${id}
      `,
      touchQuiz(id),
    ]);
    return res.status(201).json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id/rounds/:roundId  – Body: { name }
// ---------------------------------------------------------------------------
router.patch(
  '/:id/rounds/:roundId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, roundId } = req.params;
    await findOwnedQuiz(userId, id);
    const current = await findRound(id, roundId);
    const input = normalizeRoundInput({ ...current, ...req.body });
    await sql.transaction([
      sql`UPDATE quiz_rounds SET name = ${input.name} WHERE id = ${roundId}`,
      touchQuiz(id),
    ]);
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/quizzes/:id/rounds/:roundId  – also deletes its categories and their questions
// ---------------------------------------------------------------------------
router.delete(
  '/:id/rounds/:roundId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, roundId } = req.params;
    await findOwnedQuiz(userId, id);
    await findRound(id, roundId);
    const media = await sql`
      SELECT qq.media FROM quiz_questions qq
      JOIN quiz_categories qc ON qc.id = qq.category_id
      WHERE qc.round_id = ${roundId}
    `;
    await sql.transaction([sql`DELETE FROM quiz_rounds WHERE id = ${roundId}`, touchQuiz(id)]);
    await deleteUploadedMedia(mediaUrls(media.map((row) => row.media)));
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/categories  – Body: { name, question_type?, round_id? }
// Added at the end of the quiz, or of its round in a rounds quiz (where round_id is required).
// question_type (default multiple_choice) is the type new questions in it start as.
// ---------------------------------------------------------------------------
router.post(
  '/:id/categories',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    if (quiz.structure === 'flat') {
      throw new HttpError(400, 'Turn on categories for this quiz first');
    }
    const input = normalizeCategoryInput(req.body);
    const roundId = await resolveCategoryRound(quiz, req.body?.round_id);
    await sql.transaction([
      sql`
        INSERT INTO quiz_categories (quiz_id, name, question_type, round_id, position)
        SELECT ${id}, ${input.name}, ${input.question_type}, ${roundId},
               COALESCE(MAX(position), -1) + 1
        FROM quiz_categories
        WHERE quiz_id = ${id} AND round_id IS NOT DISTINCT FROM ${roundId}::uuid
      `,
      touchQuiz(id),
    ]);
    return res.status(201).json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id/categories/:categoryId  – Body: any of { name, question_type, round_id }
// Changing question_type only changes what new questions start as. Moving a category to
// another round puts it at the end of that round.
// ---------------------------------------------------------------------------
router.patch(
  '/:id/categories/:categoryId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, categoryId } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    const current = await findCategory(id, categoryId);
    const merged = { ...current, ...req.body };
    const input = normalizeCategoryInput(merged);
    const roundId = await resolveCategoryRound(quiz, merged.round_id);
    await sql.transaction([
      sql`
        UPDATE quiz_categories SET
          name          = ${input.name},
          question_type = ${input.question_type},
          round_id      = ${roundId},
          position      = CASE
            WHEN round_id IS NOT DISTINCT FROM ${roundId}::uuid THEN position
            ELSE (
              SELECT COALESCE(MAX(position), -1) + 1 FROM quiz_categories
              WHERE quiz_id = ${id} AND round_id IS NOT DISTINCT FROM ${roundId}::uuid
            )
          END
        WHERE id = ${categoryId}
      `,
      touchQuiz(id),
    ]);
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/quizzes/:id/categories/:categoryId  – also deletes its questions
// ---------------------------------------------------------------------------
router.delete(
  '/:id/categories/:categoryId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, categoryId } = req.params;
    await findOwnedQuiz(userId, id);
    await findCategory(id, categoryId);
    const media = await sql`SELECT media FROM quiz_questions WHERE category_id = ${categoryId}`;
    await sql.transaction([
      sql`DELETE FROM quiz_categories WHERE id = ${categoryId}`,
      touchQuiz(id),
    ]);
    await deleteUploadedMedia(mediaUrls(media.map((row) => row.media)));
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/questions
// Body: { question_type, prompt, media?, choices?, answer, category_id? }. Added at the end
// of its category, or of the quiz when it has no categories. prompt is formatted HTML;
// media is up to four { kind, url, name? } (see lib/questionContent.js).
// ---------------------------------------------------------------------------
router.post(
  '/:id/questions',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    const input = normalizeQuestionInput(req.body);
    const categoryId = await resolveQuestionCategory(quiz, req.body?.category_id);
    await sql.transaction([
      sql`
        INSERT INTO quiz_questions
          (quiz_id, category_id, position, question_type, prompt, choices, answer, media)
        SELECT ${id}, ${categoryId}, COALESCE(MAX(position), -1) + 1, ${input.question_type},
               ${input.prompt}, ${toJson(input.choices)}::jsonb, ${toJson(input.answer)}::jsonb,
               ${toJson(input.media)}::jsonb
        FROM quiz_questions
        WHERE quiz_id = ${id} AND category_id IS NOT DISTINCT FROM ${categoryId}::uuid
      `,
      touchQuiz(id),
    ]);
    return res.status(201).json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id/questions/:questionId  – Body: any of the fields above
// Moving a question to another category puts it at the end of that category.
// ---------------------------------------------------------------------------
router.patch(
  '/:id/questions/:questionId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, questionId } = req.params;
    const quiz = await findOwnedQuiz(userId, id);
    const current = await findQuestion(id, questionId);
    const merged = { ...current, ...req.body };
    // Changing a question's type starts its choices over rather than reusing the old ones.
    if (req.body?.question_type && req.body.question_type !== current.question_type) {
      merged.choices = req.body.choices;
      merged.answer = req.body.answer;
    }
    const input = normalizeQuestionInput(merged);
    const categoryId = await resolveQuestionCategory(quiz, merged.category_id);

    await sql.transaction([
      sql`
        UPDATE quiz_questions SET
          question_type = ${input.question_type},
          prompt        = ${input.prompt},
          choices       = ${toJson(input.choices)}::jsonb,
          answer        = ${toJson(input.answer)}::jsonb,
          media         = ${toJson(input.media)}::jsonb,
          category_id   = ${categoryId},
          position      = CASE
            WHEN category_id IS NOT DISTINCT FROM ${categoryId}::uuid THEN position
            ELSE (
              SELECT COALESCE(MAX(position), -1) + 1 FROM quiz_questions
              WHERE quiz_id = ${id} AND category_id IS NOT DISTINCT FROM ${categoryId}::uuid
            )
          END,
          updated_at    = NOW()
        WHERE id = ${questionId}
      `,
      touchQuiz(id),
    ]);
    const kept = new Set(mediaUrls(input.media));
    await deleteUploadedMedia(mediaUrls(current.media).filter((url) => !kept.has(url)));
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/quizzes/:id/questions/:questionId
// ---------------------------------------------------------------------------
router.delete(
  '/:id/questions/:questionId',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id, questionId } = req.params;
    await findOwnedQuiz(userId, id);
    const question = await findQuestion(id, questionId);
    await sql.transaction([
      sql`DELETE FROM quiz_questions WHERE id = ${questionId}`,
      touchQuiz(id),
    ]);
    await deleteUploadedMedia(mediaUrls(question.media));
    return res.json(await fetchQuizDetail(userId, id));
  }),
);

module.exports = router;
