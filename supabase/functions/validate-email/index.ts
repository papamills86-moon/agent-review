import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
};

// ─── Structured Logging ─────────────────────────────────────────────────
function genRequestId(): string {
  return "agt_" + Math.random().toString(16).slice(2, 8);
}

function createLogger(requestId: string, sourceApp: string, fnName: string) {
  return function log(phase: string, extra: Record<string, unknown> = {}) {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      request_id: requestId,
      source_app: sourceApp,
      fn: fnName,
      phase,
      ...extra,
    }));
  };
}

function getAllowedEmails(): Set<string> {
  const raw = Deno.env.get("ALLOWED_EMAILS") ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify shared secret
  const secret = req.headers.get("x-agent-secret");
  if (secret !== Deno.env.get("EDGE_FUNCTION_SECRET")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const t0 = performance.now();
    const requestId = genRequestId();

    const { email } = (await req.json()) as { email: string };

    const log = createLogger(requestId, "agent-counsel", "validate-email");
    log("request_in", { email: email ?? "missing" });

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allowed = getAllowedEmails().has(email.trim().toLowerCase());

    log("request_out", {
      allowed,
      duration_ms: Math.round(performance.now() - t0),
    });

    return new Response(
      JSON.stringify({ allowed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        fn: "validate-email",
        phase: "error",
        status: "error",
        message: errMsg,
      }));
    } catch { /* logging must never throw */ }
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
