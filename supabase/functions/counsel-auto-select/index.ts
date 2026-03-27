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
const MAX_REQUESTS_PER_HOUR = 30;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

// ─── Agent Registry ──────────────────────────────────────────────────────
interface AgentDef {
  id: string;
  name: string;
  defaultOn: boolean;
  tags: string[];
}

const AGENT_REGISTRY: AgentDef[] = [
  { id: "security",    name: "Security Architect",   defaultOn: true,  tags: ["security","auth","vulnerabilities","encryption","OWASP"] },
  { id: "compliance",  name: "Compliance Officer",   defaultOn: true,  tags: ["compliance","regulatory","GDPR","SOC2","audit"] },
  { id: "product",     name: "Product Manager",      defaultOn: true,  tags: ["product","requirements","user-stories","prioritization"] },
  { id: "qa",          name: "QA Lead",              defaultOn: true,  tags: ["testing","quality","edge-cases","regression","coverage"] },
  { id: "backend",     name: "Backend Engineer",     defaultOn: true,  tags: ["backend","architecture","performance","scalability"] },
  { id: "frontend",    name: "Frontend Engineer",    defaultOn: false, tags: ["frontend","React","UI/UX","accessibility","TypeScript"] },
  { id: "db",          name: "Database Architect",   defaultOn: false, tags: ["database","schema","queries","optimization","migrations"] },
  { id: "devops",      name: "DevOps Engineer",      defaultOn: false, tags: ["devops","CI/CD","deployment","infrastructure","monitoring"] },
  { id: "api",         name: "API Designer",         defaultOn: false, tags: ["REST","GraphQL","contracts","versioning","integration"] },
  { id: "googleplay",  name: "Google Play Policy",   defaultOn: false, tags: ["google-play","app-store","policy","mobile","compliance"] },
];

// ─── Route → Tag Map ─────────────────────────────────────────────────────
const ROUTE_TAG_MAP: Record<string, string[]> = {
  security: ["security", "compliance"],
  frontend: ["frontend", "qa", "product"],
  backend:  ["backend", "db", "api", "security"],
  database: ["db", "backend", "security", "compliance"],
  devops:   ["devops", "security", "backend"],
  api:      ["api", "backend", "security", "frontend"],
  product:  ["product", "qa", "frontend"],
  audit:    ["security", "compliance", "backend", "db"],
  all:      AGENT_REGISTRY.map((a) => a.id),
};

const VALID_CATEGORIES = [
  "security", "frontend", "backend", "database",
  "devops", "api", "product", "audit", "all",
] as const;

type Category = typeof VALID_CATEGORIES[number];

// ─── Helpers ─────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildSelectionReason(score: number, category: string, complexityScore: number): string {
  let reason: string;
  if (score >= 8) {
    reason = `High-priority match for ${category} review`;
  } else if (score >= 6) {
    reason = `Strong match for ${category} review`;
  } else if (score >= 4) {
    reason = `Supporting reviewer for ${category} scope`;
  } else {
    reason = "Included as available specialist";
  }
  if (complexityScore >= 7) {
    reason += "; elevated complexity";
  }
  return reason;
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Handle CORS preflight
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
    const requestId = genRequestId();

    // Resolve JWT identity — required, no fallback
    const resolvedEmail = await resolveIdentity(req);
    if (!resolvedEmail) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Parse request body
    const body = (await req.json()) as {
      case_context?: string;
      input_category?: string;
      complexity_score?: number;
      excluded_agents?: string[];
      source_app?: string;
      custom_agents?: Array<{ id: string; name: string; tags: string[] }>;
    };

    const {
      case_context,
      input_category,
      complexity_score: rawComplexity,
      excluded_agents = [],
      source_app: sourceApp = "unknown",
      custom_agents = [],
    } = body;

    const log = createLogger(requestId, sourceApp, "counsel-auto-select");
    log("request_in", { email: resolvedEmail, auth_mode: "jwt", input_category });

    // Rate limit check (keyed to resolvedEmail — verified identity)
    const now = Date.now();
    const entry = requestCounts.get(resolvedEmail);

    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_REQUESTS_PER_HOUR) {
        return jsonResponse({ error: "Rate limit exceeded. Try again later." }, 429);
      }
      entry.count++;
    } else {
      requestCounts.set(resolvedEmail, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }

    // ── Validation ────────────────────────────────────────────────────
    if (!case_context || typeof case_context !== "string") {
      return jsonResponse({ error: "Request must include 'case_context' (string)" }, 400);
    }
    if (!input_category || typeof input_category !== "string") {
      return jsonResponse({ error: "Request must include 'input_category' (string)" }, 400);
    }
    if (!(VALID_CATEGORIES as readonly string[]).includes(input_category)) {
      return jsonResponse({
        error: `Invalid input_category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      }, 400);
    }

    const category = input_category as Category;
    const complexityScore = Math.max(1, Math.min(10,
      typeof rawComplexity === "number" ? rawComplexity : 5,
    ));
    const excludedSet = new Set(Array.isArray(excluded_agents) ? excluded_agents : []);

    // ── Build candidate pool (remove excluded, merge custom agents) ───
    const customDefs: AgentDef[] = (Array.isArray(custom_agents) ? custom_agents : [])
      .filter((c) => c && typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.tags))
      .map((c) => ({ id: c.id, name: c.name, defaultOn: false, tags: c.tags }));

    const registryIds = new Set(AGENT_REGISTRY.map((a) => a.id));
    const mergedRegistry = [
      ...AGENT_REGISTRY,
      ...customDefs.filter((c) => !registryIds.has(c.id)),
    ];

    const pool = mergedRegistry.filter((a) => !excludedSet.has(a.id));

    // ── Scoring ───────────────────────────────────────────────────────
    const routeAgentIds = new Set(ROUTE_TAG_MAP[category]);

    const scored = pool.map((agent) => {
      // a. Base score
      let score = agent.defaultOn ? 5 : 3;

      // b. Route-tag match
      if (routeAgentIds.has(agent.id)) {
        score += 3;
      }

      // c. Complexity bonus
      if (complexityScore >= 7 && (agent.id === "security" || agent.id === "backend")) {
        score += 2;
      }

      // d. Context length bonus
      if (case_context.length > 600 && (agent.id === "db" || agent.id === "backend")) {
        score += 1;
      }

      return { agent, score };
    });

    // e. Sort descending by score — deterministic tie-breaking by registry order
    scored.sort((a, b) => b.score - a.score);

    // f. Take top 5-7: always take top 5, include 6th/7th if confidence >= MIN_CONFIDENCE
    const MIN_CONFIDENCE = 0.67;
    const maxRawScore = scored.length > 0 ? scored[0].score : 1;

    const top = scored.slice(0, Math.min(5, scored.length));
    for (let i = 5; i < Math.min(7, scored.length); i++) {
      const conf = parseFloat((scored[i].score / maxRawScore).toFixed(2));
      if (conf >= MIN_CONFIDENCE) {
        top.push(scored[i]);
      }
    }

    // g. Backward-compat seventh-slot fields (logic removed — dynamic selection)
    const seventhSlotReason = "Removed \u2014 dynamic selection";

    // h. Compute confidence scores
    const selectedAgents = top
      .map(({ agent, score }) => ({
        id: agent.id,
        name: agent.name,
        expertise_tags: agent.tags,
        confidence_score: parseFloat((score / maxRawScore).toFixed(2)),
        selection_reason: buildSelectionReason(score, category, complexityScore),
      }))
      .filter((a) => a.confidence_score >= MIN_CONFIDENCE);

    // i. Coverage assessment
    const highConfidenceCount = selectedAgents.filter((a) => a.confidence_score >= 0.70).length;

    const insufficientPool = pool.length < 6 || selectedAgents.length < 3;

    log("selection_complete", {
      email: resolvedEmail,
      category,
      complexity_score: complexityScore,
      selected_count: selectedAgents.length,
      seventh_slot_eligible: false,
      insufficient_pool: insufficientPool,
      high_confidence_count: highConfidenceCount,
    });

    return jsonResponse({
      selected_agents: selectedAgents,
      seventh_slot_eligible: false,
      seventh_slot_reason: seventhSlotReason,
      coverage_assessment: {
        high_confidence_count: highConfidenceCount,
        threshold_met: highConfidenceCount >= 4,
      },
      insufficient_pool: insufficientPool,
      algorithm_version: "1.0",
      selection_timestamp: new Date().toISOString(),
    }, 200);
  } catch (err) {
    console.error("counsel-auto-select unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
