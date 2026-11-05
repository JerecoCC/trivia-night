const { pgTable, text, timestamp, uuid } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

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

module.exports = { users };
