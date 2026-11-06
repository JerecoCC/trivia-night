'use strict';

// Quizzes are private to the planner who wrote them: they hold the answers. Another
// user's quiz is reported as not found rather than forbidden, so ids reveal nothing.

const { sql } = require('../db');
const { HttpError } = require('../middleware/errors');
const { normalizeMedia, normalizePrompt } = require('./questionContent');
const { badRequest, isUuid, toOptionalText, toText } = require('./validation');

const QUIZ_STRUCTURES = ['flat', 'categorized', 'rounds'];
const QUESTION_TYPES = ['multiple_choice', 'written', 'true_false'];

const QUIZ_NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const ROUND_NAME_MAX = 80;
const CATEGORY_NAME_MAX = 80;
const CHOICE_MAX = 200;
const WRITTEN_ANSWER_MAX = 200;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

/** The name of the category that holds existing questions when a flat quiz gains categories. */
const DEFAULT_CATEGORY_NAME = 'General';
/** The round that holds the existing categories when a quiz is split into rounds. */
const DEFAULT_ROUND_NAME = 'Round 1';

const notFound = () => new HttpError(404, 'Quiz not found');

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Validates a complete quiz. PATCH merges its changes onto the stored quiz first. */
function normalizeQuizInput(body = {}) {
  const input = body ?? {};
  const structure = input.structure ?? 'flat';
  if (!QUIZ_STRUCTURES.includes(structure)) {
    throw badRequest(`structure must be one of: ${QUIZ_STRUCTURES.join(', ')}`);
  }
  return {
    name: toText(input.name, 'name', QUIZ_NAME_MAX),
    description: toOptionalText(input.description, 'description', DESCRIPTION_MAX),
    structure,
  };
}

/** Validates a complete round. PATCH merges its changes onto the stored round first. */
function normalizeRoundInput(body = {}) {
  return { name: toText((body ?? {}).name, 'name', ROUND_NAME_MAX) };
}

/** Validates a complete category. PATCH merges its changes onto the stored category first. */
function normalizeCategoryInput(body = {}) {
  const input = body ?? {};
  const questionType = input.question_type ?? 'multiple_choice';
  if (!QUESTION_TYPES.includes(questionType)) {
    throw badRequest(`question_type must be one of: ${QUESTION_TYPES.join(', ')}`);
  }
  return {
    name: toText(input.name, 'name', CATEGORY_NAME_MAX),
    question_type: questionType,
  };
}

/**
 * Validates a complete question: its prompt is cleaned to simple formatting (see
 * questionContent.js), its media checked, and its answer shaped for its type. The prompt
 * may be left out when the question has media, such as a photo or sound clip to identify.
 * - multiple_choice: 2–6 distinct choices, and `answer` is the index of the correct one
 * - true_false: `answer` is true or false
 * - written: `answer` is the expected answer the planner checks players' answers against
 */
function normalizeQuestionInput(body = {}) {
  const input = body ?? {};
  const type = input.question_type;
  if (!QUESTION_TYPES.includes(type)) {
    throw badRequest(`question_type must be one of: ${QUESTION_TYPES.join(', ')}`);
  }
  const media = normalizeMedia(input.media);
  const prompt = normalizePrompt(input.prompt, { required: media.length === 0 });

  if (type === 'true_false') {
    if (typeof input.answer !== 'boolean') throw badRequest('answer must be true or false');
    return { question_type: type, prompt, media, choices: null, answer: input.answer };
  }

  if (type === 'written') {
    return {
      question_type: type,
      prompt,
      media,
      choices: null,
      answer: toText(input.answer, 'answer', WRITTEN_ANSWER_MAX),
    };
  }

  if (!Array.isArray(input.choices)) throw badRequest('choices must be a list');
  const choices = input.choices.map((choice, index) =>
    toText(choice, `choice ${index + 1}`, CHOICE_MAX),
  );
  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    throw badRequest(`A multiple choice question needs ${MIN_CHOICES} to ${MAX_CHOICES} choices`);
  }
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
    throw badRequest('Choices must all be different');
  }
  const answer = input.answer;
  if (!Number.isInteger(answer) || answer < 0 || answer >= choices.length) {
    throw badRequest('answer must be the index of one of the choices');
  }
  return { question_type: type, prompt, media, choices, answer };
}

const sameIds = (given, expected) =>
  given.length === expected.length &&
  new Set(given).size === given.length &&
  given.every((id) => expected.includes(id));

const idList = (value, name) => {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw badRequest(`${name} must be a list of ids`);
  }
  return value;
};

const toCategoryOrder = (category) => ({
  id: category?.id,
  question_ids: idList(category?.question_ids, 'question_ids'),
});

/**
 * Turns the planner's new order into positions. The body must list every round, category
 * and question in the quiz exactly once:
 * - flat:        { question_ids: [...] }
 * - categorized: { categories: [{ id, question_ids: [...] }, ...] }
 * - rounds:      { rounds: [{ id, categories: [{ id, question_ids: [...] }, ...] }, ...] }
 * Questions may move between categories, and categories between rounds, this way.
 */
function planQuizOrder(structure, body, { roundIds = [], categoryIds, questionIds }) {
  const input = body ?? {};
  const mismatch = () =>
    badRequest('The order must list every round, category and question in the quiz exactly once');

  if (structure === 'flat') {
    const ids = idList(input.question_ids, 'question_ids');
    if (!sameIds(ids, questionIds)) throw mismatch();
    return {
      rounds: [],
      categories: [],
      questions: ids.map((id, position) => ({
        id,
        category_id: null,
        position,
      })),
    };
  }

  let rounds;
  if (structure === 'rounds') {
    if (!Array.isArray(input.rounds)) throw badRequest('rounds must be a list');
    rounds = input.rounds.map((round) => {
      if (!Array.isArray(round?.categories)) throw badRequest('categories must be a list');
      return {
        id: round.id,
        categories: round.categories.map(toCategoryOrder),
      };
    });
  } else {
    if (!Array.isArray(input.categories)) throw badRequest('categories must be a list');
    rounds = [{ id: null, categories: input.categories.map(toCategoryOrder) }];
  }

  const categories = rounds.flatMap((round) =>
    round.categories.map((category, position) => ({
      ...category,
      round_id: round.id,
      position,
    })),
  );
  const roundsMatch =
    structure !== 'rounds' ||
    sameIds(
      rounds.map((round) => round.id),
      roundIds,
    );
  if (
    !roundsMatch ||
    !sameIds(
      categories.map((category) => category.id),
      categoryIds,
    ) ||
    !sameIds(
      categories.flatMap((category) => category.question_ids),
      questionIds,
    )
  ) {
    throw mismatch();
  }
  return {
    rounds: structure === 'rounds' ? rounds.map(({ id }, position) => ({ id, position })) : [],
    categories: categories.map(({ id, round_id, position }) => ({
      id,
      round_id,
      position,
    })),
    questions: categories.flatMap((category) =>
      category.question_ids.map((id, position) => ({
        id,
        category_id: category.id,
        position,
      })),
    ),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The planner's quizzes with their counts, by name. Pass `id` to fetch a single quiz. */
function fetchQuizSummaries(userId, { id = null } = {}) {
  return sql`
    SELECT
      q.id,
      q.name,
      q.description,
      q.structure,
      (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
      (SELECT COUNT(*)::int FROM quiz_categories qc WHERE qc.quiz_id = q.id) AS category_count,
      (SELECT COUNT(*)::int FROM quiz_rounds qr WHERE qr.quiz_id = q.id) AS round_count,
      (SELECT COUNT(*)::int FROM events e WHERE e.quiz_id = q.id) AS event_count,
      q.created_at,
      q.updated_at
    FROM quizzes q
    WHERE q.owner_id = ${userId} AND (${id}::uuid IS NULL OR q.id = ${id}::uuid)
    ORDER BY lower(q.name), q.created_at
  `;
}

/**
 * A quiz with its rounds, categories and questions, each in the planner's order.
 * Categories are listed round by round and questions category by category. A flat quiz's
 * questions have a null category_id; only a rounds quiz's categories have a round_id.
 */
async function fetchQuizDetail(userId, quizId) {
  const [[quiz], rounds, categories, questions] = await Promise.all([
    fetchQuizSummaries(userId, { id: quizId }),
    sql`
      SELECT id, name, position
      FROM quiz_rounds
      WHERE quiz_id = ${quizId}
      ORDER BY position, created_at
    `,
    sql`
      SELECT qc.id, qc.round_id, qc.name, qc.question_type, qc.position
      FROM quiz_categories qc
      LEFT JOIN quiz_rounds qr ON qr.id = qc.round_id
      WHERE qc.quiz_id = ${quizId}
      ORDER BY qr.position NULLS FIRST, qr.created_at, qc.position, qc.created_at
    `,
    sql`
      SELECT qq.id, qq.category_id, qq.position, qq.question_type, qq.prompt, qq.media, qq.choices,
             qq.answer
      FROM quiz_questions qq
      LEFT JOIN quiz_categories qc ON qc.id = qq.category_id
      LEFT JOIN quiz_rounds qr ON qr.id = qc.round_id
      WHERE qq.quiz_id = ${quizId}
      ORDER BY qr.position NULLS FIRST, qr.created_at, qc.position NULLS FIRST, qc.created_at,
               qq.position, qq.created_at
    `,
  ]);
  if (!quiz) throw notFound();
  return { ...quiz, rounds, categories, questions };
}

/** Loads the editable fields of one of the planner's quizzes, or 404s. */
async function findOwnedQuiz(userId, id) {
  if (!isUuid(id)) throw notFound();
  const [quiz] = await sql`
    SELECT id, owner_id, name, description, structure
    FROM quizzes WHERE id = ${id} AND owner_id = ${userId}
  `;
  if (!quiz) throw notFound();
  return quiz;
}

/** Rejects a quiz_id that isn't one of the planner's quizzes. null means "no quiz". */
async function assertOwnQuiz(userId, quizId) {
  if (quizId == null) return;
  const [quiz] = await sql`SELECT 1 FROM quizzes WHERE id = ${quizId} AND owner_id = ${userId}`;
  if (!quiz) throw badRequest('Choose one of your own quizzes');
}

/**
 * Checks where a category may go: a rounds quiz needs one of its own rounds, and a
 * categorized quiz takes none.
 */
async function resolveCategoryRound(quiz, roundId) {
  if (quiz.structure !== 'rounds') {
    if (roundId != null) throw badRequest('This quiz has no rounds');
    return null;
  }
  if (!isUuid(roundId)) throw badRequest('Choose a round for this category');
  const [round] = await sql`
    SELECT id FROM quiz_rounds WHERE id = ${roundId} AND quiz_id = ${quiz.id}
  `;
  if (!round) throw badRequest('Choose one of this quiz’s rounds');
  return roundId;
}

/**
 * Checks where a question may go: a quiz with categories (with or without rounds) needs
 * one of its own categories, and a flat quiz takes none.
 */
async function resolveQuestionCategory(quiz, categoryId) {
  if (quiz.structure === 'flat') {
    if (categoryId != null) throw badRequest('This quiz has no categories');
    return null;
  }
  if (!isUuid(categoryId)) throw badRequest('Choose a category for this question');
  const [category] = await sql`
    SELECT id FROM quiz_categories WHERE id = ${categoryId} AND quiz_id = ${quiz.id}
  `;
  if (!category) throw badRequest('Choose one of this quiz’s categories');
  return categoryId;
}

/** Choices and answers are stored as JSONB; a missing value stays SQL NULL. */
const toJson = (value) => (value == null ? null : JSON.stringify(value));

module.exports = {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_ROUND_NAME,
  assertOwnQuiz,
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
};
