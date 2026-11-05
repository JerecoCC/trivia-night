require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { runtimeSecret } = require('./config/env');
const session = require('express-session');
const passport = require('passport');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

const { initSchema, sql } = require('./db');
require('./config/passport');

const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5004;

// ---------------------------------------------------------------------------
// Schema init – run immediately so the promise is ready before any request
// arrives, regardless of whether we're in local dev or Vercel serverless.
// ---------------------------------------------------------------------------
const schemaReady = initSchema().catch((err) => {
  console.error('Failed to initialise database schema:', err);
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5177').trim(),
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
// API data is per-user and changes with every edit, so browsers and the
// Vercel edge must never answer from a cached copy.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(
  session({
    secret: runtimeSecret('SESSION_SECRET', 'trivia-night-secret'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Ensure schema is ready before any route handler runs
app.use((_req, _res, next) => {
  schemaReady.then(() => next()).catch(next);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const result = await sql`SELECT NOW() AS db_time`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: { connected: true, db_time: result[0].db_time },
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: { connected: false, error: err.message },
    });
  }
});

// Keep error responses consistent for uncaught route failures and unknown APIs.
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start – run DB migrations then listen (local dev only)
// ---------------------------------------------------------------------------
if (require.main === module) {
  // Running directly: `node src/index.js` or `npm run dev:server`
  // schemaReady is already in flight; wait for it before accepting connections.
  schemaReady.then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }).catch((err) => {
    console.error('Failed to initialise database schema:', err);
    process.exit(1);
  });
}

// Export for Vercel serverless
module.exports = app;

