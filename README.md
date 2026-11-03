# ResearchX — AI Research Scientist

A Replit-friendly full-stack research intelligence workspace. React, TypeScript, Vite, Express, PostgreSQL, Prisma, and live scholarly APIs are wired together; secrets remain server-side.

## Run on Replit

1. Create a PostgreSQL database and set `DATABASE_URL` in Replit Secrets.
2. Set `JWT_SECRET` to at least 32 random characters in Replit Secrets (generate one locally with `openssl rand -base64 32`). Configure an AI provider in Replit Secrets to enable the assistant and paper analyzer; restart the server after changing secrets.
3. Run `npm install`, then `npm run db:migrate` and `npm run db:generate` to apply the checked-in PostgreSQL migrations and generate the Prisma client.
4. Start the application with `npm run dev`. Vite serves port 5173 and proxies `/api` requests to Express on port 3001.

For local development, create a project-root `.env` containing `GEMINI_API_KEY=` and add your key there. The Express server loads this file through `dotenv/config`; Vite proxies requests to Express and never receives the key. The AI research assistant and paper analyzer use the server-side Gemini Interactions API with the `gemini-3.5-flash-lite` model. Restart `npm run dev` after changing the key. Configure `DATABASE_URL` and `JWT_SECRET` in the same private server environment for database-backed account features. Never put provider credentials in a `VITE_` variable, frontend code, browser storage, or a URL. Then run `npm install`, `npm run db:migrate`, `npm run db:generate`, and `npm run dev`. The server rejects registration and sign-in if the JWT secret is missing or shorter than 32 characters. The OpenAlex APIs used here are public and do not require an API key. AI is unavailable until `GEMINI_API_KEY` is configured.

The first migration is a baseline matching the original three-model schema. Subsequent migrations add normalized research/workspace records and a user-scoped activity feed. For a fresh database, `npm run db:migrate` applies all migrations. For a database created from the earlier app with `db:push`, mark the baseline as applied once with `npx prisma migrate resolve --applied 20261003000000_initial`, then run `npm run db:migrate` to apply the upgrade. Always take a PostgreSQL backup before applying production migrations.

For a production deployment, run `npm run db:migrate`, `npm run build`, then `npm start`. Express serves the generated client and API on `PORT`. Set `CLIENT_ORIGIN` if browser requests come from another origin.

## Environment

Copy `.env.example` to `.env` for local development. Replit users should configure the same values as encrypted Secrets. Never put provider keys in client-side variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required for database, account, and workspace features | PostgreSQL connection string |
| `JWT_SECRET` | Required for registration and sign-in | At least 32 random characters; signs HTTP-only cookie sessions |
| `GEMINI_API_KEY` | Optional until AI features are used | Server-side Google Gemini API key; never exposed to the client |
| `OPENALEX_API_KEY` | No | Optional server-side OpenAlex key for higher authenticated API limits |
| `OPENALEX_MAILTO` | No | Contact email sent with OpenAlex API requests |
| `CROSSREF_MAILTO` | No | Contact email included in the Crossref request user agent |
| `PORT` | No | Express port in production (defaults to `3001`) |
| `API_PORT` | No | Express port in development (defaults to `3001`) |
| `CLIENT_ORIGIN` | No | Allowed browser origin (defaults to `http://localhost:5173`) |
| `NODE_ENV` | No | Set to `production` for production cookie/static-serving behavior |

## Architecture

- `src/`: React application, route pages, reusable components, query state, API client, and design system.
- `server/`: Express API, authentication middleware, Prisma client, and scholarly/AI service integrations.
- `prisma/schema.prisma`: PostgreSQL models for users, scholarly records, saved research, workspaces, analyses, chats, and research relationships.
- Saved papers, collections, workspaces, and activity are scoped to the authenticated user. The activity feed records actions from the time this feature is deployed; older saved-item timestamps are not represented as historical actions.
- Paper and researcher search, profiles, authorship, topic trends, and publication-year aggregates are fetched from OpenAlex. Crossref is a fallback for paper search when OpenAlex is unavailable and supplies DOI paper detail records. Provider fields absent from their records remain null and render as “Data unavailable.”
- If OpenAlex is rate limited, the dashboard and research-trend views fall back to live Crossref keyword-result totals and publication-year facets. These are explicitly labeled as keyword matches, not as a global topic index; unavailable researcher totals remain unavailable rather than being estimated.
- If OpenAlex researcher search is rate limited or unavailable, researcher search falls back to author names in live Crossref work results. Crossref does not supply a canonical author identity or reliable author-level totals for every name, so those metrics remain unavailable and same-name profiles may be ambiguous. Research-field and institution filters become broad text matches in this fallback, not strict filters.
- AI endpoints call Gemini only from the server using `GEMINI_API_KEY`. The paper analyzer labels extracted paper information separately from AI-generated interpretations and suggestions, and stores the supplied text and result in the authenticated user’s analysis history. The assistant does not claim to have searched the literature unless research context is actually supplied.
- Registration validates input, hashes passwords with bcrypt, and creates a signed, HTTP-only, same-site session cookie. Private collection APIs require authentication.
- Workspace co-author relationships are built only from author lists in retrieved OpenAlex work records; shared topics/institutions are not treated as collaborations.
- The original `Collection` and `SavedItem` tables are retained as the physical backing for the `ResearchCollection` and generic saved paper/researcher features. New scholarly records are normalized in `Paper`, `Author`, `Researcher`, and `ResearchTopic` tables as they are saved or added to a workspace.

## Useful commands

```sh
npm run dev
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:migrate:dev
```
