# CLAUDE.md — Agent Counsel

See `.github/instructions/copilot-instructions.md` for full engineering standards.
See `.github/instructions/edge-functions.instructions.md` for Edge Function patterns.

---

## Auth Model

### Current (pre-migration)
- Email allowlist gate only — no Supabase Auth
- Email string stored in localStorage (key: agent-review-email)
- Email passed in Edge Function request body as identity proof
- validate-email Edge Function checks ALLOWED_EMAILS env var

### Post-migration (Magic Link OTP — target state)
- Supabase Auth: email OTP flow (6-digit code, not redirect)
- Session managed by @supabase/supabase-js — signed RS256 JWT, 1hr expiry, auto-refresh
- Allowlist check (validate-email) fires BEFORE signInWithOtp — unauthorized emails
  never receive an OTP
- All protected Edge Function calls carry: x-agent-secret + Authorization: Bearer <jwt>
- Server-side identity resolved from JWT via supabaseAdmin.auth.getUser() — not from
  request body

### Permanent deployment constraints (never override these)

validate-email — ALWAYS deploy with --no-verify-jwt:
  supabase functions deploy validate-email --no-verify-jwt
  Reason: called pre-session during the login flow. Supabase gateway-level JWT
  verification would reject all unauthenticated preflight requests, breaking login
  for all users. This is a permanent constraint, not a migration artifact.

multi-agent-review — deploy WITHOUT --no-verify-jwt after Phase 3:
  supabase functions deploy multi-agent-review
  JWT required at gateway level + code level (defense-in-depth).

prompt-enhance — deploy WITHOUT --no-verify-jwt after Phase 3:
  supabase functions deploy prompt-enhance
  Same constraint as multi-agent-review.

### Standing rules
- x-agent-secret header is kept on all three functions as defense-in-depth — never remove
- Allowlist check (ALLOWED_EMAILS) is the authorization layer; Supabase Auth is authn
- resolvedEmail from JWT must flow into: allowlist check, rate limit key, all log calls
- Token tracking is untouched by auth changes — always verify it survives any auth PR
- If session is null at fetch time: catch the 401, call supabase.auth.signOut(),
  redirect to login — never pass an empty Bearer token silently

### Migration cleanup (Phase 3 TODO)
When Phase 3 lands, update these files to reflect the new auth model:
- `.github/instructions/copilot-instructions.md` — remove "no Supabase Auth" and
  "no JWT verification" from Auth & Security section; update localStorage rule;
  update the blanket "--no-verify-jwt — never remove this flag" to the per-function
  rules documented above
- `.github/instructions/edge-functions.instructions.md` — update Deploy Command section
  to show per-function deploy flags; add resolveIdentity() to Required Request
  Execution Order (between secret verification and body parsing)
