---
applyTo: "src/**/*.ts,src/**/*.tsx"
---

# TypeScript Standards — src/

## Type Safety

- No `any` without an explicit `// TODO: type this` comment on the same line
- All component props must be explicitly typed — no implicit prop inference from usage
- All `useState` calls with non-primitive types must include an explicit generic:
  ```ts
  const [result, setResult] = useState<AgentResult | null>(null);
  ```
- All records from Edge Function API responses must be typed before use — no raw JSON assignment
- Prefer `Record<string, T>` over index signatures for agent/result maps

---

## File Roles — Do Not Blur These

| File | Role |
|------|------|
| `src/App.tsx` | `LoginGate` wrapper + root mount only — no business logic |
| `src/components/MultiAgentReview.tsx` | Production review pipeline — calls Edge Function |
| `src/api/multi-agent-review-v2.jsx` | Dev/demo artifact — NOT imported in production path |

If a change would move logic into `App.tsx` or import from `multi-agent-review-v2.jsx` in the production tree, stop and flag it.

---

## Component Rules

- Functional components only — no class components
- No external component or UI libraries
- **Inline styles only** — no CSS modules, Tailwind, styled-components, or emotion
- All async operations wrapped in `useCallback` with errors surfaced visibly in the UI
- No `useEffect` for data fetching — use `useCallback` triggered by user action (button click, form submit)
- Loading and error states must always be represented in component state and rendered

---

## Import Rules

- No barrel imports (`index.ts` re-exports) from within `src/`
- Import React hooks explicitly:
  ```ts
  import { useState, useCallback } from "react";
  ```
- No default re-exports wrapping third-party libraries

---

## Inline Style Rules

- Background palette anchors: `#080d18` (page), `#0f172a` (card), `#0a0e1a` (input/inset)
- Border color: `#1e293b`
- Primary text: `#e2e8f0`, secondary: `#94a3b8`, muted: `#475569`, label: `#374151`
- Accent blue: `#60a5fa`, accent blue bg: `#0f2744`
- Font family: `inherit` (monospace for labels and token counts)
- No hardcoded pixel values for font sizes without a comment if they deviate from the established scale (9px labels, 11px secondary, 13px body, 16px title)

---

## Naming

| Thing | Convention |
|-------|-----------|
| Components | `PascalCase` |
| Hooks | `camelCase` prefixed with `use` |
| Util functions | `camelCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Agent IDs | lowercase single-word matching `AGENT_PROMPTS` keys |

---

## Token Tracking in Frontend

- Every Edge Function response includes a `tokenUsage` array — always pass it to state
- `TokenSummary` component must receive the full `tokenLog` and render compress + agent + orchestrator subtotals
- Never remove `tokenLog` state, the `setTokenLog` call after a review completes, or the `TokenSummary` render
