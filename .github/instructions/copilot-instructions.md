# Agent Counsel — Core Engineering Standards

## Project Identity

- **Repo:** papamills86-moon/agent-review
- **Stack:** React + Vite 8 (TypeScript), Supabase Edge Functions (Deno), Anthropic Claude API
- **No PWA, no Capacitor, no mobile, no active Postgres schema**
- **Supabase ref:** rdnwkweprvcsfatvytlz

---

## Git Rules

- Every Claude Code prompt ends with: `git add -A && git commit -m "[message]" && git push`
- Commit messages are descriptive enough to serve as patch notes
- Never commit speculatively — always ask "what needs updating before I commit?"
- No squash merges — preserve commit history

---

## Auth & Security Non-Negotiables

- Auth is **email allowlist only** — no Supabase Auth, no OAuth, no JWT verification
- Every Edge Function **MUST** verify `x-agent-secret` header against `EDGE_FUNCTION_SECRET` env var before processing any request
- Every Edge Function **MUST** handle CORS preflight (`OPTIONS`) using the `ALLOWED_ORIGIN` env var
- Never hardcode secrets, API keys, or allowed emails in source files
- All Edge Functions deployed with `--no-verify-jwt` — never remove this flag
- Never expose `ANTHROPIC_API_KEY` to the frontend — it lives only in Edge Function env vars
- `VITE_EDGE_FUNCTION_SECRET` is the frontend-safe shared secret — it has no Anthropic key access

---

## Edge Function Rules

- **Deploy command:** `npx supabase functions deploy [name] --no-verify-jwt`
- Use `npx supabase` — never the scoop shim
- Every function must execute in this order: verify x-agent-secret → validate email → rate limit check → execute
- Rate limit is in-memory (10 req/hour per email) — acceptable for private internal tool
- CORS headers must include `x-agent-secret` in `Access-Control-Allow-Headers`
- Never add Deno `std` imports above `0.224.0` without an explicit upgrade decision

---

## Frontend Rules

- **Authoritative implementation:** `src/components/MultiAgentReview.tsx` (TypeScript — calls Edge Function)
- `src/api/multi-agent-review-v2.jsx` is a **dev/demo artifact** — never treat it as production path, never import it from the production tree
- No component library — inline styles only (dark-theme palette is the standard)
- `localStorage` usage is limited to exactly one key: `agent-review-email` (the authed email)
- No routing library — single-page, single component tree
- No state management library — React `useState` / `useCallback` only

---

## Token Tracking — First-Class Feature

Token tracking is **never optional and never removed.**

- Every Anthropic API call in the Edge Function logs: `{ type: "compress"|"agent"|"orch", id?, inputTokens, outputTokens }`
- The UI must surface per-agent token counts and a full session summary (compress + agents + orchestrator)
- Any code change that touches the API call path must preserve token logging
- If a PR removes or bypasses token logging, it is a **merge blocker**

---

## Model Routing (for work on this codebase — not the review pipeline itself)

| Task | Model |
|------|-------|
| Scanning files, classifying intent, extracting patterns, boilerplate | **Haiku** |
| Architectural decisions, multi-file changes, debugging, security review, Edge Function logic | **Sonnet** |

- Never skip the Sonnet reasoning stage without flagging it explicitly and getting confirmation
- Claude Code prompts use **CONTEXT / TASK / CONSTRAINTS** format — no exceptions
- All Claude Code prompts end with: `git add -A && git commit -m "[message]" && git push`

---

## Naming Conventions

| Thing | Convention |
|-------|-----------|
| Agent IDs | lowercase single-word (`security`, `compliance`, `backend`, `db`, `devops`, `api`, `frontend`, `qa`, `product`, `googleplay`) |
| Env vars | `SCREAMING_SNAKE_CASE` |
| Component files | `PascalCase.tsx` |
| Supabase function directories | `kebab-case` |
| Util functions | `camelCase` |
| Constants | `SCREAMING_SNAKE_CASE` |

---

## Required Env Vars

| Var | Where |
|-----|-------|
| `ANTHROPIC_API_KEY` | Edge Function only |
| `VITE_SUPABASE_URL` | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Frontend |
| `VITE_EDGE_FUNCTION_SECRET` | Frontend |
| `EDGE_FUNCTION_SECRET` | Edge Function |
| `ALLOWED_ORIGIN` | Edge Function (CORS) |
| `ALLOWED_EMAILS` | Edge Function (comma-separated allowlist) |

---

## What Does Not Exist Here (do not add without explicit discussion)

- No Postgres migrations, no RLS policies, no Supabase DB schema
- No design token system — inline styles are intentional
- No test framework — no `.test.ts` or `.spec.ts` files
- No Capacitor, no service worker, no PWA manifest
- No Gemini API — Anthropic only
- No additional `localStorage` keys beyond `agent-review-email`
