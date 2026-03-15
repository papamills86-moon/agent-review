# Audit Standards — Agent Counsel

## When to Run an Audit

- Before any significant feature addition to the pipeline
- After 10+ file changes accumulate
- Before any Edge Function change that touches the auth path or the Anthropic API key path
- Before adding a new agent or changing the orchestrator contract
- Before any change to token tracking logic

---

## 4-Pass Audit Structure

### Pass 1 — Security & Auth
**Haiku scan → Sonnet review**

Haiku scans all Edge Function files for:
- Any request path that does not verify `x-agent-secret` before executing
- Any location where `ANTHROPIC_API_KEY` value could be returned or logged to the client
- Any email validation bypass (missing null checks, case sensitivity gaps)
- Any rate limit bypass (missing or incorrect Map key logic)
- Hardcoded secrets, emails, or keys anywhere in source

Sonnet interprets Haiku findings, classifies severity, and recommends fixes.

---

### Pass 2 — Contract Integrity
**Haiku scan → Sonnet review**

Haiku scans for:
- Agent JSON outputs that deviate from the schema (`concern_level`, `summary`, `findings`, `recommendation`, `questions`)
- Orchestrator outputs that deviate from the schema (`verdict`, `overall_risk`, `rationale`, `required_actions`, `open_questions`, `approved_to_proceed`)
- Frontend code that reads keys not in the agent or orchestrator contracts
- Token logging calls that are missing, incomplete, or bypass the `tokenUsage.push(...)` pattern
- Any Anthropic API call in the Edge Function that does not log tokens

Sonnet evaluates contract drift risk and recommends fixes.

---

### Pass 3 — Frontend Correctness
**Sonnet review of `src/components/MultiAgentReview.tsx`**

Sonnet checks:
- Production path calls the Supabase Edge Function — not the Anthropic API directly
- `src/api/multi-agent-review-v2.jsx` is not imported anywhere in the production component tree
- Token tracking data flows correctly from Edge Function response to UI display
- The `agent-review-email` key is the only `localStorage` usage in the file
- Agent `systemPrompt` fields in `ALL_AGENTS` are empty strings (prompts are server-side only)
- `VITE_EDGE_FUNCTION_SECRET` is the only secret referenced in frontend env vars

---

### Pass 4 — Environment & Deployment
**Sonnet review**

Sonnet checks:
- All seven required env vars are accounted for (see copilot-instructions.md)
- CORS headers are correct in both Edge Functions (`validate-email` and `multi-agent-review`)
- Both functions have `verify_jwt = false` in `supabase/config.toml`
- Rate limit logic is present and correctly keyed on normalized email in `multi-agent-review`
- `ALLOWED_EMAILS` parsing handles: comma-separation, `.trim()`, `.toLowerCase()`, empty string filtering

---

## Finding Format

```
[PASS N] [SEVERITY: critical|high|medium|low] [FILE: path/to/file.ts:LINE if applicable]
Finding: <what is wrong or at risk>
Risk:    <what could happen if unaddressed>
Fix:     <recommended action>
```

Example:
```
[PASS 1] [SEVERITY: high] [FILE: supabase/functions/multi-agent-review/index.ts:47]
Finding: Email allowlist check runs after rate limit check, allowing unauthenticated callers to burn rate limit slots.
Risk:    Malicious callers could exhaust the in-memory rate limit map for legitimate users.
Fix:     Move email allowlist verification before rate limit check in the request handler.
```

---

## Model Routing for Audit Work

| Pass | Stage | Model |
|------|-------|-------|
| 1, 2 | Scan / extraction | **Haiku** |
| 1, 2 | Finding interpretation + severity classification | **Sonnet** |
| 3, 4 | Full review (no scan stage) | **Sonnet** |

Never produce a fix recommendation from a Haiku pass alone. Haiku findings are inputs to Sonnet — not outputs to the engineer.
