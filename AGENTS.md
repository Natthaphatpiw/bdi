# Repository Guidelines

## Project Structure & Module Organization
This is a Next.js 15 TypeScript app serving two surfaces: the web app in `app/(web)` and the LINE LIFF app in `app/liff`. Shared API handlers live in `app/api/**/route.ts`. UI is grouped by domain in `components/` (`screens`, `layout`, `chat`, `cards`, `passport`, `ui`). Core product logic and integrations live in `lib/`, including orchestration, safety checks, rule evaluation, Gemini, RunPod, Neo4j, Supabase, and client helpers. Static fallback data is in `lib/data/*.json`; Supabase setup is in `supabase/*.sql`; assets are in `public/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start local development at `http://localhost:3000`; LIFF routes are under `/liff`.
- `npm run typecheck`: run strict TypeScript checks with `tsc --noEmit`.
- `npm run build`: create a production build and catch route/runtime build errors.
- `npm run start`: serve the production build after `npm run build`.
- `npm run lint`: run the configured Next.js lint command.

## Coding Style & Naming Conventions
Use TypeScript and React functional components. Keep component files in PascalCase, such as `PassportModal.tsx`; hooks use `use*.ts`; API folders expose `route.ts`. Prefer the `@/*` path alias over deep relative imports. Keep server-only logic in `lib/` or `app/api`, and browser helpers under `lib/client`. Use Tailwind utilities and existing `components/ui` primitives before adding new styling patterns. Preserve strict typing and avoid `any` unless an SDK boundary requires it.

## Testing Guidelines
There is no dedicated test suite or `tests/` directory yet. Before submitting changes, run `npm run typecheck` and `npm run build`. For API or orchestration work, manually exercise relevant routes, especially `/api/health`, `/api/turn`, `/api/eligibility`, and document upload routes when touched. Keep future tests close to the feature or introduce a clear `tests/` convention in the same PR.

## Commit & Pull Request Guidelines
Git history uses short Thai summaries such as `ปรับ result 1` plus brief iteration labels like `f1`. Keep commits concise, descriptive, and focused on one logical change. Pull requests should include purpose, affected routes/components, setup or env changes, verification commands, and screenshots for visible UI changes. Link related issues or hackathon tasks when available.

## Security & Configuration Tips
Do not commit `.env.local` or secrets. Required services include Supabase, Gemini, RunPod, Neo4j, and LINE LIFF; document new environment variables in `SETUP.md`. Keep PII in Supabase-backed flows and preserve the rule engine as the source of eligibility decisions.
