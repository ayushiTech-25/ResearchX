# ResearchX

### Research Smarter. Discover More.

ResearchX is an AI-powered research intelligence platform for exploring scholarly literature, discovering researchers, understanding research trends, and organizing work in one workspace.

## About the Project

ResearchX brings live scholarly data and AI-assisted research tools together in a focused workspace. Search papers and researchers using OpenAlex, with Crossref support for paper discovery and DOI records. Explore topic and publication trends, review researcher profiles, and organize selected work into private collections and project workspaces.

The AI assistant and paper analyzer use Gemini from the server. The assistant is intended for research exploration and reasoning—not fabricated citations—and analyzer results distinguish information extracted from supplied text from AI-generated interpretation. Verify important claims against the original sources.

## Key Features

- **AI Research Assistant** — Explore research questions, compare methods, and outline literature reviews with Gemini. Requires a signed-in account and server-side AI configuration.
- **Research Paper Discovery** — Search scholarly works with title, author, topic, and publication-year filters. OpenAlex is the primary source; Crossref provides fallback paper search and DOI records.
- **AI Paper Analyzer** — Analyze supplied paper text for objectives, methods, datasets, results, contributions, limitations, and related suggestions. Analysis history is tied to the signed-in account.
- **Researcher Discovery** — Search researcher records and view available profile, affiliation, publication, and authorship information. OpenAlex is used when available, with a Crossref-based search fallback.
- **Research Trends** — Explore live research concepts and publication counts by year, with OpenAlex data and Crossref keyword-result fallbacks where available.
- **Saved Research and Collections** — Save papers and researchers and organize them into private collections.
- **Dashboard and Research Workspaces** — View research metrics, trends, recent papers, and account activity. Create workspaces to organize papers and researchers around projects.
- **Research Network** — Explore co-author relationships based on authors listed together in retrieved OpenAlex work records.
- **Accounts and Profiles** — Register and sign in with password-hashed credentials and HTTP-only session cookies.

## Screenshots

Screenshots will be added here.

<!-- Add genuine ResearchX screenshots here when available. -->

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query |
| UI and charts | Tailwind CSS, Lucide React, Recharts, DM Sans, Manrope |
| Backend | Node.js 20+, Express 5, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Validation and authentication | Zod, bcryptjs, JSON Web Tokens, cookie-parser |
| Research data | OpenAlex and Crossref public APIs |
| AI | Google Gemini Interactions API, called server-side |

## Project Structure

```text
.
├── prisma/
│   ├── migrations/          # PostgreSQL schema migrations
│   └── schema.prisma        # Prisma data models
├── server/
│   ├── middleware/          # Authentication middleware
│   ├── services/            # Research providers, AI, and persistence
│   ├── db.ts                # Prisma client
│   └── index.ts             # Express API and production static server
├── src/
│   ├── components/          # Shared layout and UI components
│   ├── pages/               # Application pages
│   ├── services/            # Frontend API client
│   ├── App.tsx              # Application routes
│   ├── main.tsx             # Frontend entry point
│   ├── styles.css           # Application styles
│   └── types.ts             # Shared frontend types
├── .env.example             # Environment variable template
├── index.html               # Vite HTML entry
├── package.json             # Dependencies and scripts
├── package-lock.json        # Locked npm dependency versions
└── vite.config.ts           # Vite configuration and API proxy
```

## Installation and Setup

### Prerequisites

- Node.js 20 or later and npm
- Access to a PostgreSQL database for account, saved research, and workspace features
- A Gemini API key to use the AI assistant and analyzer

### 1. Clone the repository

```sh
git clone https://github.com/ayushiTech-25/ResearchX.git
cd ResearchX
```

These commands work in Terminal on macOS and Linux, and in PowerShell, Windows Terminal, or Command Prompt on Windows.

### 2. Install dependencies

```sh
npm ci
```

### 3. Configure the environment

Copy `.env.example` to `.env` in the project root, then fill in the values described below. Keep `.env` private and do not commit it.

macOS or Linux:

```sh
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4. Generate Prisma Client and apply database migrations

Set `DATABASE_URL` in `.env` to your PostgreSQL connection string before running these commands:

```sh
npm run db:generate
npm run db:migrate
```

### 5. Start the development application

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development server proxies `/api` requests to the Express API on port `3001` by default.

## Environment Variables

Set server-side values in the root `.env` file. The examples below are placeholders, not real credentials:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
JWT_SECRET="replace-with-a-random-secret-at-least-32-characters"
GEMINI_API_KEY="your-gemini-api-key"
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For database-backed features and migrations | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | For registration and sign-in | Signing secret of at least 32 characters for session cookies |
| `GEMINI_API_KEY` | For AI features | Server-side key for the Gemini assistant and paper analyzer |
| `OPENALEX_API_KEY` | No | Optional key for authenticated OpenAlex API requests and higher limits |
| `OPENALEX_MAILTO` | No | Optional contact email included with OpenAlex requests |
| `CROSSREF_MAILTO` | No | Optional contact email for Crossref requests |
| `API_PORT` | No | Development API port; defaults to `3001` |
| `PORT` | No | Production API port; defaults to `3001` when `API_PORT` is not set |
| `CLIENT_ORIGIN` | No | Allowed browser origin for API requests; defaults to `http://localhost:5173` |
| `NODE_ENV` | No | Set to `production` for production cookie and static-file behavior |

OpenAlex and Crossref research discovery do not require API keys for basic use. AI features remain unavailable until `GEMINI_API_KEY` is configured. Account, collection, and workspace features require a reachable PostgreSQL database and a valid `JWT_SECRET`. Never put secrets in frontend variables, source files, or URLs.

## Running the Application

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend and Express API together |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run dev:server` | Start only the Express API in watch mode |
| `npm run typecheck` | Type-check the frontend, Vite configuration, and server |
| `npm run build` | Generate Prisma Client, type-check, build the frontend, and compile the server |
| `npm start` | Start the built production server |
| `npm run preview` | Preview the built frontend with Vite |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply checked-in Prisma migrations |
| `npm run db:migrate:dev` | Create or apply migrations during development |
| `npm run db:push` | Synchronize the Prisma schema directly to the configured database |

For a production build, run `npm run db:migrate` and `npm run build`, then start the application with `npm start`. In production mode, Express serves the built frontend and API.

## Future Enhancements

Possible future improvements—not currently implemented—include:

- Exporting collections and analyses to additional research-friendly formats
- More granular search and discovery filters
- Automated tests for key frontend and API workflows
- Additional accessibility and localization options

## Contributing

Contributions are welcome:

1. Open an issue to describe a proposed change or report a reproducible problem.
2. Create a focused branch and keep changes scoped to the issue.
3. Run `npm run typecheck` and `npm run build` before submitting.
4. Open a pull request with a concise summary and relevant verification details.

Do not include credentials, `.env` files, or personal data in commits.

## License

No license file has been added to this repository yet. Add a license before granting reuse or redistribution permissions.
