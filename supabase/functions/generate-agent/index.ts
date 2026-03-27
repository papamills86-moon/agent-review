import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Supabase Admin (module-scope — reused across warm isolate invocations) ──
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function resolveIdentity(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user?.email) return null;
    return user.email.toLowerCase();
  } catch {
    return null;
  }
}

// ─── CORS ────────────────────────────────────────────────────────────────────
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

// ─── Rate Limiting ───────────────────────────────────────────────────────
const MAX_REQUESTS_PER_HOUR = 5;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

// ─── Model ──────────────────────────────────────────────────────────────────
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 600;

// ─── Color palette for generated agents ─────────────────────────────────────
const AGENT_COLORS = [
  { accent: "#f472b6", bg: "rgba(244,114,182,0.07)" },
  { accent: "#c084fc", bg: "rgba(192,132,252,0.07)" },
  { accent: "#22d3ee", bg: "rgba(34,211,238,0.07)" },
  { accent: "#facc15", bg: "rgba(250,204,21,0.07)" },
  { accent: "#2dd4bf", bg: "rgba(45,212,191,0.07)" },
  { accent: "#f97316", bg: "rgba(249,115,22,0.07)" },
  { accent: "#818cf8", bg: "rgba(129,140,248,0.07)" },
  { accent: "#a3e635", bg: "rgba(163,230,53,0.07)" },
  { accent: "#fb7185", bg: "rgba(251,113,133,0.07)" },
  { accent: "#38bdf8", bg: "rgba(56,189,248,0.07)" },
];

// ─── Few-shot examples for the generation prompt ────────────────────────────
const EXAMPLE_AGENTS = `Example 1:
{
  "id": "security",
  "name": "Security Architect",
  "abbr": "SEC",
  "system_prompt": "Security Architect. Lens: auth, authz, injection, data exposure, OWASP, secrets, supply chain. Ignore business concerns.",
  "expertise_tags": ["security", "auth", "vulnerabilities", "encryption", "OWASP"],
  "group": "governance"
}

Example 2:
{
  "id": "devops",
  "name": "DevOps Engineer",
  "abbr": "OPS",
  "system_prompt": "Staff DevOps Engineer. Lens: CI/CD pipeline impact, deployment risk, rollback feasibility, env config drift, secret surface area, container changes, infra-as-code correctness, observability gaps. Focus on what could cause a bad deploy or make a bad deploy hard to recover from.",
  "expertise_tags": ["devops", "CI/CD", "deployment", "infrastructure", "monitoring"],
  "group": "engineering"
}`;

const SYSTEM_PROMPT = `You are an agent definition generator for a multi-agent review board. Given a profession title, rationale, and suggested expertise tags, generate a JSON agent definition.

Rules:
- id: lowercase, hyphenated, 1-3 words (e.g. "data-engineer", "ml-ops")
- name: Professional title, 2-4 words (e.g. "Data Engineer", "ML Operations Lead")
- abbr: 2-4 uppercase letters (e.g. "DE", "MLO")
- system_prompt: 1-3 sentences defining the review lens. Start with the role title. List specific concerns. End with what to focus on or ignore. Follow the style of the examples below.
- expertise_tags: 3-5 lowercase tags relevant to the profession
- group: one of "governance", "engineering", "product", "custom"
- Do NOT duplicate any of the existing agent IDs listed below

${EXAMPLE_AGENTS}

Respond with JSON only, no markdown fences.`;

// ─── Main Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = req.headers.get("x-agent-secret");
  if (secret !== Deno.env.get("EDGE_FUNCTION_SECRET")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const tRequest = performance.now();
    const requestId = genRequestId();

    const resolvedEmail = await resolveIdentity(req);
    if (!resolvedEmail) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      profession_title,
      rationale,
      suggested_tags = [],
      existing_agent_ids = [],
      source_app: sourceApp = "unknown",
    } = (await req.json()) as {
      profession_title: string;
      rationale: string;
      suggested_tags?: string[];
      existing_agent_ids?: string[];
      source_app?: string;
    };

    const log = createLogger(requestId, sourceApp, "generate-agent");
    log("request_in", { email: resolvedEmail, auth_mode: "jwt", profession_title });

    // Rate limit
    const now = Date.now();
    const entry = requestCounts.get(resolvedEmail);
    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_REQUESTS_PER_HOUR) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      entry.count++;
    } else {
      requestCounts.set(resolvedEmail, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }

    if (!profession_title || typeof profession_title !== "string") {
      return new Response(
        JSON.stringify({ error: "Request must include 'profession_title' (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the user prompt
    const userContent = `Generate an agent definition for:
Title: ${profession_title}
Rationale: ${rationale}
Suggested tags: ${suggested_tags.join(", ")}

Existing agent IDs (do NOT reuse): ${existing_agent_ids.join(", ")}`;

    // Call Haiku
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const tGen = performance.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "{}";
    const inputTokens: number = data.usage?.input_tokens ?? 0;
    const outputTokens: number = data.usage?.output_tokens ?? 0;

    log("generation", {
      status: "ok",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Math.round(performance.now() - tGen),
    });

    const cleaned = raw.replace(/```json|```/g, "").trim();
    let agentDef: Record<string, unknown>;
    try {
      agentDef = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "AI produced invalid JSON", raw: cleaned }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Assign color from palette based on a hash of the id
    const id = (agentDef.id as string) ?? profession_title.toLowerCase().replace(/\s+/g, "-");
    const colorIndex = Math.abs(id.split("").reduce((h, c) => h + c.charCodeAt(0), 0));
    const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length];

    const fullDef = {
      id,
      name: agentDef.name ?? profession_title,
      abbr: agentDef.abbr ?? profession_title.slice(0, 3).toUpperCase(),
      group: agentDef.group ?? "custom",
      accent_color: color.accent,
      bg_color: color.bg,
      expertise_tags: agentDef.expertise_tags ?? suggested_tags,
      system_prompt: agentDef.system_prompt ?? "",
      created_by: resolvedEmail,
    };

    const tokenUsage = [{ type: "generation", inputTokens, outputTokens }];

    log("request_out", {
      status: "ok",
      agent_id: fullDef.id,
      total_duration_ms: Math.round(performance.now() - tRequest),
    });

    return new Response(
      JSON.stringify({ agent_def: fullDef, tokenUsage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "x-auth-mode": "jwt" } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        fn: "generate-agent",
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
