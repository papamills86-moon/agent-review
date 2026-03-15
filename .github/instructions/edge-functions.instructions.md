---
applyTo: "supabase/functions/**/*.ts"
---

# Edge Function Standards — supabase/functions/

## Pre-Deploy Checklist (every function, every deploy)

- [ ] Handles `OPTIONS` preflight and returns correct CORS headers
- [ ] Verifies `x-agent-secret` header — returns 403 if missing or incorrect
- [ ] Validates all required request body fields — returns 400 on missing or malformed input
- [ ] Returns `Content-Type: application/json` on all non-preflight responses
- [ ] Never logs or returns the value of `ANTHROPIC_API_KEY`
- [ ] Token usage logged for every Anthropic API call (compress, agent, orch)

---

## Required CORS Pattern

Use exactly this in every function — do not modify field names or structure:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
};

if (req.method === "OPTIONS") {
  return new Response("ok", { headers: corsHeaders });
}
```

---

## Required Secret Verification Pattern

Use exactly this immediately after the OPTIONS check — before any other logic:

```typescript
const secret = req.headers.get("x-agent-secret");
if (secret !== Deno.env.get("EDGE_FUNCTION_SECRET")) {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## Required Request Execution Order

Every function that accepts a request body must execute in this order:

1. OPTIONS preflight check
2. Secret verification (`x-agent-secret`)
3. Body parsing + field validation
4. Email allowlist check (`ALLOWED_EMAILS`)
5. Rate limit check
6. Business logic

Never reorder steps 2–5. Email and rate limit checks must always come after secret verification.

---

## Anthropic API Call Pattern

```typescript
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  }),
});

if (!res.ok) {
  const errText = await res.text();
  throw new Error(`Anthropic API ${res.status}: ${errText}`);
}

const data = await res.json();
const raw: string = data.content?.[0]?.text ?? "{}";
```

Always strip markdown fences before parsing:

```typescript
let parsed: Record<string, unknown>;
try {
  parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
} catch {
  parsed = { error: raw };
}
```

---

## Token Logging Pattern (required on every Anthropic call)

```typescript
tokenUsage.push({
  type: "compress" | "agent" | "orch",
  id: agentId,   // include only for agent calls; omit for compress and orch
  inputTokens: data.usage?.input_tokens ?? 0,
  outputTokens: data.usage?.output_tokens ?? 0,
});
```

`tokenUsage` is returned in the function response body under the key `tokenUsage`. The frontend reads this and populates `tokenLog` state. Never omit this from the response.

---

## Rate Limiting Pattern

```typescript
const MAX_REQUESTS_PER_HOUR = 10;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const normalizedEmail = email.trim().toLowerCase();
const now = Date.now();
const entry = requestCounts.get(normalizedEmail);

if (entry && now < entry.resetAt) {
  if (entry.count >= MAX_REQUESTS_PER_HOUR) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  entry.count++;
} else {
  requestCounts.set(normalizedEmail, { count: 1, resetAt: now + 60 * 60 * 1000 });
}
```

---

## Email Allowlist Pattern

```typescript
const raw = Deno.env.get("ALLOWED_EMAILS") ?? "";
const allowedEmails = new Set(
  raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);

if (!allowedEmails.has(email.trim().toLowerCase())) {
  return new Response(JSON.stringify({ error: "Unauthorized email" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## Deploy Command

```bash
npx supabase functions deploy [function-name] --no-verify-jwt
```

- Always use `npx supabase` — never the scoop shim
- Always include `--no-verify-jwt` — never remove this flag
- Verify `supabase/config.toml` has `verify_jwt = false` for each function

---

## Deno Import Rules

- Type declarations: `import "jsr:@supabase/functions-js/edge-runtime.d.ts";`
- Deno std: pinned at `0.224.0` — never upgrade without an explicit decision
- No third-party Deno modules without prior approval
