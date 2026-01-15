# Manus Web Agent (pnpm + Vite + React)

Interactive Manus-style web search console with agent traces, built on Vite + React. Manus credentials come from env vars (never asked in the UI). Falls back to offline demo mode when Manus or web search is unavailable.

## Prerequisites
- Node 18+
- pnpm (preferred) or npm/yarn

## Setup
```bash
pnpm install
```

Create a local env file (optional, for Manus):
```bash
cp .env.example .env.local
# edit .env.local with your Manus values
```

## Scripts
- `pnpm dev` – start Vite dev server
- `pnpm build` – type-check and build for production
- `pnpm preview` – serve the production build locally
- `pnpm lint` – run eslint on src

## Env vars
Set these in `.env.local` (not committed):
- `VITE_MANUS_API_KEY` – Manus API key (omit to stay in demo mode)
In dev, requests are proxied through `/manus` to avoid CORS; production uses `https://api.manus.ai` directly.

## How it works
- The UI shows orchestrator input, progress steps, trace log, and search results.
- If a Manus key is present and enabled, agent calls go to Manus; otherwise it uses a lightweight local LLM stub and DuckDuckGo (with offline placeholders when blocked).
