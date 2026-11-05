const {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

const users = pgTable("users", {
  id: id(),
  googleId: text("google_id").unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password"),
  photo: text("photo"),
  role: text("role").notNull().default("user"),
  createdAt: createdAt(),
});

const quizzes = pgTable(
  "quizzes",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // 'flat' | 'categorized' | 'rounds'
    structure: text("structure").notNull().default("flat"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("quizzes_owner_id_idx").on(table.ownerId)],
);

const quizRounds = pgTable(
  "quiz_rounds",
  {
    id: id(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("quiz_rounds_quiz_id_idx").on(table.quizId, table.position)],
);

const quizCategories = pgTable(
  "quiz_categories",
  {
    id: id(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    // Set only in a rounds quiz; position is then the order within the round.
    roundId: uuid("round_id").references(() => quizRounds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    // Default type for new questions: 'multiple_choice' | 'written' | 'true_false'
    questionType: text("question_type").notNull().default("multiple_choice"),
    createdAt: createdAt(),
  },
  (table) => [index("quiz_categories_quiz_id_idx").on(table.quizId, table.position)],
);

const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: id(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => quizCategories.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull(),
    // 'multiple_choice' | 'written' | 'true_false'
    questionType: text("question_type").notNull(),
    // Formatted HTML, cleaned on save (lib/questionContent.js)
    prompt: text("prompt").notNull(),
    choices: jsonb("choices"),
    // Up to four { kind: "image" | "video" | "audio" | "youtube", url, name } shown with the question
    media: jsonb("media").notNull().default([]),
    answer: jsonb("answer").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("quiz_questions_quiz_id_idx").on(table.quizId, table.categoryId, table.position),
  ],
);

const events = pgTable(
  "events",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    scheduledStart: text("scheduled_start").notNull(),
    isOnline: boolean("is_online").notNull().default(false),
    location: text("location"),
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("events_scheduled_date_idx").on(table.scheduledDate)],
);

module.exports = { users, events, quizzes, quizRounds, quizCategories, quizQuestions };
