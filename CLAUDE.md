# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `.github/instructions/copilot-instructions.md` for full engineering standards.
See `.github/instructions/edge-functions.instructions.md` for Edge Function patterns.

---

## Build & Dev Commands

```bash
npm run dev          # Start Vite dev server (React frontend)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run preview      # Preview production build locally

# Edge Functions (use npx, never the scoop shim)
npx supabase functions deploy multi-agent-review --no-verify-jwt
npx supabase functions deploy prompt-enhance --no-verify-jwt
npx supabase functions deploy counsel-auto-select --no-verify-jwt
npx supabase functions deploy generate-agent --no-verify-jwt

# Database migration
npx supabase db push   # Apply migrations (supabase/migrations/)
```

No test framework exists — no `.test.ts` or `.spec.ts` files.

---

## Architecture

**Stack:** React 19 + Vite 8 (TypeScript), Supabase Edge Functions (Deno), Anthropic Claude API, Supabase Postgres (custom_agents table).
No component library, no routing library, no state management library — inline styles, single-page, `useState`/`useReducer` only.

### Unified Workflow (single linear pipeline)

```
App.tsx (LoginGate: Supabase OTP auth)
  └── UnifiedWorkflow.tsx (orchestrator)
        ├── useUnifiedWorkflow hook (reducer state machine)
        ├── Steps:
        │     PromptInput → EnhancementReview → FinalPromptReview
        │     → BoardPreview → ReviewResults (+ GapRecommendations)
        └── Edge Functions:
              prompt-enhance → counsel-auto-select → multi-agent-review
              → generate-agent (pool expansion)
```

**Phase flow:** `idle → enhancing → clarifying → enhanced → selecting → board_preview → reviewing → complete → [generating]`

Users can skip enhancement and go directly from idle → selecting via "Skip to Review".

### Agent Registry

Single source of truth: `src/data/agentRegistry.ts` exports `BUILTIN_AGENTS` (10 hardcoded agents) + helpers to merge with custom agents from the `custom_agents` Supabase table.

Custom agents: AI-generated via `generate-agent` Edge Function, persisted in shared Supabase table, loaded on mount via `src/lib/agentDb.ts`.

### Review Pipeline (multi-agent-review)

1. **Input compression** — if input > 600 chars, Haiku summarizes to < 200 words
2. **Parallel agent calls** — selected agents run concurrently via Haiku (supports both built-in and custom agent system prompts)
3. **Orchestrator synthesis** — Sonnet produces verdict from agent outputs
4. **Gap detection** — when `coverage_insufficient=true`, orchestrator also recommends 3-5 new professions
5. All steps return `tokenUsage` array; UI surfaces per-phase and session totals

### Agent Selection (counsel-auto-select)

Dynamic selection of 5-7 agents based on scoring (category match + complexity + defaults). Custom agents from Supabase are merged into the candidate pool. Returns `coverage_assessment` indicating whether ≥4 agents hit 70% confidence threshold.

### Prompt Enhancement (prompt-enhance)

Two-stage flow: 3 specialist agents (prompt_engineer, prompt_security, intent_analyst) → orchestrator synthesis. Supports `stage: "initial"` (returns follow-up questions) and `stage: "further"` (incorporates user clarifications).

### Agent Generation (generate-agent)

Generates new agent definitions from profession title + rationale using Haiku. Returns `{id, name, abbr, system_prompt, expertise_tags, group}` with auto-assigned colors. Saved to `custom_agents` table.

### Models

| Role | Model | Max Tokens |
|------|-------|------------|
| Agent calls (review + enhance) | `claude-haiku-4-5-20251001` | 1024 (review) / 450 (enhance) |
| Input compression | `claude-haiku-4-5-20251001` | 300 |
| Review orchestrator | `claude-sonnet-4-20250514` | 1500 (2000 with gap detection) |
| Enhance orchestrator | `claude-sonnet-4-20250514` | 800 |
| Agent generation | `claude-haiku-4-5-20251001` | 600 |

### 10 Built-in Agent IDs

`security`, `compliance`, `product`, `qa`, `backend`, `frontend`, `db`, `devops`, `api`, `googleplay`

5 are default-on: security, compliance, product, qa, backend. Custom agents can be added dynamically via pool expansion.

---

## Auth Model

### Current (Supabase Magic Link OTP)
- Supabase Auth: email OTP flow (6-digit code, not redirect)
- Session managed by @supabase/supabase-js — signed RS256 JWT, 1hr expiry, auto-refresh
- OTP verification is the sole auth gate — if you can verify email ownership via OTP,
  you're in. No allowlist, no ALLOWED_EMAILS env var.
- All protected Edge Function calls carry: x-agent-secret + Authorization: Bearer <jwt>
- Server-side identity resolved from JWT via supabaseAdmin.auth.getUser() — not from
  request body
- `src/lib/auth.ts` provides `getAuthHeaders()` — shared by all Edge Function callers

### Deprecated — do not use
- validate-email Edge Function: still deployed, no longer called. Do not delete until
  confirmed unused in production logs. Do not add new callers.

### Permanent deployment constraints (never override these)

All Edge Functions deploy WITH --no-verify-jwt:
  Gateway JWT validation causes "invalid jwt" errors; code-level auth
  via resolveIdentity() is the sole JWT gate (defense-in-depth via
  x-agent-secret header remains).

### Standing rules
- x-agent-secret header is kept on all protected functions as defense-in-depth — never remove
- resolvedEmail from JWT must flow into: rate limit key, all log calls
- Token tracking is untouched by auth changes — always verify it survives any auth PR
- If session is null at fetch time: catch the 401, call supabase.auth.signOut(),
  redirect to login — never pass an empty Bearer token silently

---

## Edge Function Patterns

Every Edge Function follows the same execution order:
1. OPTIONS preflight → CORS headers
2. x-agent-secret verification → 403
3. JWT identity via resolveIdentity() → 401
4. Body parsing + field validation → 400
5. Rate limit check (in-memory, per-email) → 429
6. Business logic

Each function has its own `resolveIdentity()`, CORS block, rate limiter, and structured logger (duplicated, not shared — Deno edge functions are isolated).

JSON recovery: `repairJson()` attempts structural closure of truncated responses; `extractFromRaw()` regex-extracts key fields as last resort. Both tag recovered output with `_repaired` / `_truncated` flags.

---

## Database

### custom_agents table
Shared pool of AI-generated agents. No RLS restrictions — all authenticated users can read/write.

Schema: `id (PK), name, abbr, group, accent_color, bg_color, expertise_tags[], system_prompt, created_by, created_at, active`

Migration: `supabase/migrations/001_custom_agents.sql`

---

## Token Tracking — First-Class Feature

Token tracking is **never optional and never removed.**

- Every Anthropic API call logs: `{ type: "compress"|"agent"|"orch"|"generation", id?, inputTokens, outputTokens }`
- `tokenUsage` array returned in every Edge Function response
- UI must surface per-phase token counts (enhancement, review, generation) and combined total
- Any code change that touches the API call path must preserve token logging

---

## Naming Conventions

| Thing | Convention |
|-------|-----------|
| Built-in agent IDs | lowercase single-word (`security`, `compliance`, `backend`, etc.) |
| Custom agent IDs | lowercase hyphenated (`data-engineer`, `ml-ops`) |
| Env vars | `SCREAMING_SNAKE_CASE` |
| Component files | `PascalCase.tsx` |
| Step components | `src/components/steps/PascalCase.tsx` |
| Supabase function directories | `kebab-case` |
| Util functions / hooks | `camelCase` |

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
| `SUPABASE_URL` | Edge Function (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function (admin client) |

---

## Legacy Files (archived, not active)

- `src/components/MultiAgentReview.tsx` — replaced by UnifiedWorkflow + step components
- `src/components/PromptEnhancer.tsx` — replaced by UnifiedWorkflow enhancement steps
- `src/components/ReviewerSelectionPanel.tsx` — replaced by BoardPreview (read-only)
- `src/hooks/useCounsel.ts` — replaced by useUnifiedWorkflow
- `src/api/multi-agent-review-v2.jsx` — dev/demo artifact, never import

---

## What Does Not Exist (do not add without discussion)

- No design token system — inline styles are intentional
- No test framework
- No Capacitor, no service worker, no PWA manifest
- No Gemini API — Anthropic only
- No routing library — single-page app
