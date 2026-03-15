# Agent Prompt Standards

## Agent JSON Output Contract

Every agent returns **only** this JSON structure — no markdown, no preamble, no extra keys:

```json
{
  "concern_level": "critical|high|medium|low|none",
  "summary": "one sentence",
  "findings": ["finding"],
  "recommendation": "one sentence",
  "questions": ["question if needed"]
}
```

| Field | Rule |
|-------|------|
| `concern_level` | Enum — exactly one of: `critical`, `high`, `medium`, `low`, `none` |
| `summary` | Always exactly one sentence |
| `findings` | Array of strings — each a distinct, specific finding. Never empty if concern_level ≠ none |
| `recommendation` | Always exactly one sentence |
| `questions` | Optional — omit or return `[]` if no open questions |

Never return partial JSON, nested objects, or keys outside this schema.

---

## Orchestrator JSON Output Contract

The orchestrator (Sonnet) returns **only** this JSON structure:

```json
{
  "verdict": "approve|approve_with_conditions|defer|reject",
  "overall_risk": "critical|high|medium|low",
  "rationale": "2-3 sentences",
  "required_actions": ["action"],
  "open_questions": ["question"],
  "approved_to_proceed": true
}
```

| Field | Rule |
|-------|------|
| `verdict` | Enum — exactly one of: `approve`, `approve_with_conditions`, `defer`, `reject` |
| `overall_risk` | Enum — exactly one of: `critical`, `high`, `medium`, `low` |
| `rationale` | 2–3 sentences max |
| `required_actions` | Array of strings — actionable steps before proceeding. `[]` if verdict is `approve` |
| `open_questions` | Array of strings — unresolved questions. `[]` if none |
| `approved_to_proceed` | Boolean — `true` for `approve` or `approve_with_conditions`, `false` for `defer` or `reject` |

---

## Where Prompts Live

- **Agent system prompts:** `supabase/functions/multi-agent-review/index.ts` → `AGENT_PROMPTS` record
- **Agent names:** same file → `AGENT_NAMES` record
- **Orchestrator system prompt:** same file → `ORCH_SYSTEM` constant
- **Frontend agent registry** (`src/components/MultiAgentReview.tsx`) has `systemPrompt: ""` for all agents — this is **intentional and correct**. Prompts are server-side only.

---

## Adding a New Agent

1. Add agent ID and prompt to `AGENT_PROMPTS` in `supabase/functions/multi-agent-review/index.ts`
2. Add display name to `AGENT_NAMES` in the same file
3. Add to `ALL_AGENTS` array in `src/components/MultiAgentReview.tsx`:
   ```ts
   {
     id: "newagent",
     name: "Display Name",
     abbr: "ABR",
     group: "governance|product|engineering",
     accentColor: "#xxxxxx",
     bgColor: "rgba(r,g,b,0.07)",
     defaultOn: false,
     systemPrompt: ""   // always empty — prompts are server-side
   }
   ```
4. Add to relevant `ROUTE_TAGS` entries in `src/api/multi-agent-review-v2.jsx` if applicable
5. Redeploy: `npx supabase functions deploy multi-agent-review --no-verify-jwt`

---

## Modifying an Agent Prompt

- Change is made in `supabase/functions/multi-agent-review/index.ts` only
- Any prompt change requires a **Sonnet reasoning pass** before writing the Claude Code prompt
- After any prompt change, redeploy the Edge Function:
  ```bash
  npx supabase functions deploy multi-agent-review --no-verify-jwt
  ```
- Never copy prompt text into the frontend — server-side only

---

## Input Compression Rules

- Compression model: Haiku (`claude-haiku-4-5-20251001`) at 300 max tokens
- Fires automatically when input length exceeds 600 characters
- Compression directive: preserve technical details, file names, endpoints, and risk signals — remove filler language
- Output: plain text only (no JSON, no markdown)
- Token usage from the compress call must be logged as `{ type: "compress", inputTokens, outputTokens }`
- Never remove the compression step without an explicit architectural decision

---

## Model Routing for Prompt Work

| Task | Model |
|------|-------|
| Testing JSON schema compliance, boilerplate prompt scaffolding, output format iteration | **Haiku** |
| Evaluating agent lens coverage, identifying gaps between agents, orchestrator synthesis logic, adding new agents | **Sonnet** |
