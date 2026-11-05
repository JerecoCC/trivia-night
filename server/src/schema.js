const {
  boolean,
  date,
  index,
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
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_scheduled_date_idx").on(table.scheduledDate)],
);

module.exports = { users, events };
