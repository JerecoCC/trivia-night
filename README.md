# Trivia Night

Same stack as hockey-tracker:

- **client/** – Vite + React 18 + TypeScript, SCSS modules, `@jerecocc/tracker-ui`, React Router 7,
  TanStack Query, React Hook Form, react-toastify. Tests with Jest + Testing Library; Storybook 8.
- **server/** – Express 5 (CommonJS), Neon serverless Postgres + Drizzle ORM, JWT auth with
  email/password (bcrypt) and Google OAuth (Passport). Tests with Jest + Supertest.
- Deployed to Vercel via the root `vercel.json` (`/api/*` → server, everything else → client).

## Setup

```sh
npm install
npm install --prefix server
npm install --prefix client
cp server/.env.example server/.env   # fill in POSTGRES_URL, JWT_SECRET, Google OAuth keys
cp client/.env.example client/.env
npm run dev                          # server on :5004, client on :5177
```

The server creates its tables on first start (see `server/src/db.js`).

## Scripts

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Run server and client together      |
| `npm test`          | Client then server Jest suites      |
| `npm run lint`      | ESLint (client)                     |
| `npm run typecheck` | `tsc --noEmit` for the client       |
| `npm run build`     | Production client build             |
