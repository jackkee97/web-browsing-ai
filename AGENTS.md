# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all React + TypeScript source (`App.tsx`, `main.tsx`, `index.css`, `env.d.ts`).
- `index.html` is the Vite entry HTML.
- `vite.config.ts` defines dev server settings (including the Manus proxy).
- No dedicated `tests/` directory is present.

## Build, Test, and Development Commands
- `pnpm install` sets up dependencies.
- `pnpm dev` starts the Vite dev server on port 5173.
- `pnpm build` runs TypeScript project build (`tsc -b`) and produces a production bundle.
- `pnpm preview` serves the production build locally.
- `pnpm lint` runs ESLint for `src/**/*.{ts,tsx}`.

## Coding Style & Naming Conventions
- Use TypeScript + React with 2-space indentation, matching existing files.
- Prefer functional components and hooks.
- Keep file names PascalCase for components (e.g., `App.tsx`) and lower-case for entry points (`main.tsx`).
- ESLint is configured; format code to keep lint clean (no Prettier scripts are defined).

## Testing Guidelines
- No automated test framework is configured.
- If adding tests, introduce a `tests/` or `src/__tests__/` folder and document new commands here.
- Use descriptive test names that mirror user-facing behavior.

## Commit & Pull Request Guidelines
- The git history only shows `init`, so no formal convention exists.
- Use short, imperative commit messages (e.g., "Add Manus proxy defaults").
- PRs should include: a clear description, the motivation, and any relevant screenshots for UI changes.
- Link related issues/tickets when available.

## Configuration & Security Notes
- Only `VITE_MANUS_API_KEY` is read from env; store it in `.env.local` and never commit secrets.
- Dev requests proxy through `/manus`; production uses `https://api.manus.ai` directly.
