# CLAUDE.md — Agent Counsel

See `.github/instructions/copilot-instructions.md` for full engineering standards.
See `.github/instructions/edge-functions.instructions.md` for Edge Function patterns.

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

### Deprecated — do not use
- validate-email Edge Function: still deployed, no longer called. Do not delete until
  confirmed unused in production logs. Do not add new callers.

### Permanent deployment constraints (never override these)

multi-agent-review — deploy WITHOUT --no-verify-jwt after Phase 3:
  supabase functions deploy multi-agent-review
  JWT required at gateway level + code level (defense-in-depth).

prompt-enhance — deploy WITHOUT --no-verify-jwt after Phase 3:
  supabase functions deploy prompt-enhance
  Same constraint as multi-agent-review.

### Standing rules
- x-agent-secret header is kept on all protected functions as defense-in-depth — never remove
- resolvedEmail from JWT must flow into: rate limit key, all log calls
- Token tracking is untouched by auth changes — always verify it survives any auth PR
- If session is null at fetch time: catch the 401, call supabase.auth.signOut(),
  redirect to login — never pass an empty Bearer token silently

### Migration cleanup (Phase 3 TODO)
When Phase 3 lands, update these files to reflect the new auth model:
- `.github/instructions/copilot-instructions.md` — remove "no Supabase Auth" and
  "no JWT verification" from Auth & Security section; update localStorage rule;
  update the blanket "--no-verify-jwt — never remove this flag" to the per-function
  rules documented above; remove ALLOWED_EMAILS from env var table
- `.github/instructions/edge-functions.instructions.md` — update Deploy Command section
  to show per-function deploy flags; add resolveIdentity() to Required Request
  Execution Order (between secret verification and body parsing); remove Email
  Allowlist Pattern section
