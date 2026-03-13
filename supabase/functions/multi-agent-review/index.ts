import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Models ──────────────────────────────────────────────────────────────────
const MODEL_AGENT = "claude-haiku-4-5-20251001";
const MODEL_ORCH = "claude-sonnet-4-20250514";
const TOKENS_AGENT = 450;
const TOKENS_COMPRESS = 300;
const TOKENS_ORCH = 800;
const INPUT_COMPRESS_THRESHOLD = 600; // chars

// ─── Agent System Prompts ────────────────────────────────────────────────────
const JSON_SCHEMA = `JSON only, no markdown:
{"concern_level":"critical|high|medium|low|none","summary":"one sentence","findings":["finding"],"recommendation":"one sentence","questions":["question if needed"]}`;

const AGENT_PROMPTS: Record<string, string> = {
  security: `Security Architect. Lens: auth, authz, injection, data exposure, OWASP, secrets, supply chain.
Ignore business concerns. ${JSON_SCHEMA}`,

  compliance: `Compliance Officer. Lens: GDPR, SOC2, HIPAA, audit trail, data retention, access policy, change management.
Ignore implementation. ${JSON_SCHEMA}`,

  product: `Senior Product Manager. Lens: user impact, scope creep, priority, stakeholder alignment, rollout risk.
Leave implementation to engineers. ${JSON_SCHEMA}`,

  qa: `QA Lead. Lens: test coverage gaps, regression risk, edge cases, acceptance criteria, release readiness.
Flag anything that makes this risky to ship. ${JSON_SCHEMA}`,

  backend: `Staff Backend Engineer. Lens: implementation complexity, tech debt, scalability, dependency risk, regression potential.
Be blunt about hidden complexity. ${JSON_SCHEMA}`,

  frontend: `Staff Frontend Engineer. Lens: rendering performance, bundle size, component contracts, CSS regressions, accessibility (WCAG), state management impact, mobile UX.
Focus on what breaks or degrades for the user's browser experience. ${JSON_SCHEMA}`,

  db: `Database Architect. Lens: schema backward compatibility, migration risk, index strategy, query plan impact, RLS policy, N+1 patterns, connection pool pressure.
Flag anything that could corrupt data or cause irreversible schema state. ${JSON_SCHEMA}`,

  devops: `Staff DevOps Engineer. Lens: CI/CD pipeline impact, deployment risk, rollback feasibility, env config drift, secret surface area, container changes, infra-as-code correctness, observability gaps.
Focus on what could cause a bad deploy or make a bad deploy hard to recover from. ${JSON_SCHEMA}`,

  api: `API Design Lead. Lens: breaking changes to contracts, REST/GraphQL semantics, versioning strategy, consumer impact, error shape consistency, auth header patterns, pagination design, rate limiting.
Flag any change that could silently break existing API consumers. ${JSON_SCHEMA}`,

  googleplay: `Google Play Policy Reviewer. Lens: Google Play Developer Program Policies, content ratings, data safety section accuracy, permissions justification, target API level requirements, restricted permissions, Families Policy compliance, billing policy, store listing accuracy, user data transparency.
Flag anything that could trigger a policy rejection, app suspension, or required disclosure change. ${JSON_SCHEMA}`,
};

const AGENT_NAMES: Record<string, string> = {
  security: "Security Architect",
  compliance: "Compliance Officer",
  product: "Product Manager",
  qa: "QA Lead",
  backend: "Backend Engineer",
  frontend: "Frontend Engineer",
  db: "Database Architect",
  devops: "DevOps Engineer",
  api: "API Designer",
  googleplay: "Google Play Policy",
};

const ORCH_SYSTEM = `Principal Architect. You receive expert reviews and synthesize a final verdict. Identify highest-severity concerns, resolve conflicts, produce actionable verdict.
JSON only, no markdown:
{"verdict":"approve|approve_with_conditions|defer|reject","overall_risk":"critical|high|medium|low","rationale":"2-3 sentences","required_actions":["action"],"open_questions":["question"],"approved_to_proceed":true}`;

// ─── Anthropic API Helper ────────────────────────────────────────────────────
async function callClaude(
  system: string,
  userContent: string,
  model: string,
  maxTokens: number,
): Promise<{ parsed: Record<string, unknown>; inputTokens: number; outputTokens: number }> {
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
  const inputTokens: number = data.usage?.input_tokens ?? 0;
  const outputTokens: number = data.usage?.output_tokens ?? 0;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    parsed = { error: raw };
  }

  return { parsed, inputTokens, outputTokens };
}

// ─── Input Compression ──────────────────────────────────────────────────────
async function compressInput(
  input: string,
): Promise<{ compressed: string; inputTokens: number; outputTokens: number }> {
  const system =
    "Compress the following change request or audit finding into a precise technical summary under 200 words. Preserve all specific technical details, file names, endpoints, and risk signals. Remove filler language. Output plain text only.";

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
      model: MODEL_AGENT,
      max_tokens: TOKENS_COMPRESS,
      system,
      messages: [{ role: "user", content: input }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return {
    compressed: data.content?.[0]?.text ?? input,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ─── Main Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify JWT via Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { input, agents } = (await req.json()) as {
      input: string;
      agents: string[];
    };

    if (!input || !agents?.length) {
      return new Response(
        JSON.stringify({ error: "Request must include 'input' (string) and 'agents' (string[])" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate requested agents
    const validAgentIds = agents.filter((id) => AGENT_PROMPTS[id]);
    if (!validAgentIds.length) {
      return new Response(
        JSON.stringify({ error: `No valid agent IDs. Available: ${Object.keys(AGENT_PROMPTS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokenUsage: Array<{
      type: string;
      id?: string;
      inputTokens: number;
      outputTokens: number;
    }> = [];

    // Step 1 — Compress input if long
    let reviewInput = input;
    if (input.length > INPUT_COMPRESS_THRESHOLD) {
      const { compressed, inputTokens, outputTokens } = await compressInput(input);
      reviewInput = compressed;
      tokenUsage.push({ type: "compress", inputTokens, outputTokens });
    }

    // Step 2 — Parallel agent calls
    const agentPromises = validAgentIds.map(async (id) => {
      const { parsed, inputTokens, outputTokens } = await callClaude(
        AGENT_PROMPTS[id],
        `Review this:\n\n${reviewInput}`,
        MODEL_AGENT,
        TOKENS_AGENT,
      );
      tokenUsage.push({ type: "agent", id, inputTokens, outputTokens });
      return { id, name: AGENT_NAMES[id] ?? id, result: parsed };
    });

    const allResults = await Promise.all(agentPromises);

    const agentResults: Record<string, Record<string, unknown>> = {};
    for (const { id, result } of allResults) {
      agentResults[id] = result;
    }

    // Step 3 — Orchestrator synthesis
    const orchInput = [
      `Original request:\n${reviewInput}`,
      "---",
      ...allResults.map(
        ({ name, result }) =>
          `## ${name}\nLevel: ${result.concern_level ?? "?"} | ${result.summary ?? ""}\nFindings: ${((result.findings as string[]) ?? []).join("; ")}\nRec: ${result.recommendation ?? ""}`,
      ),
    ].join("\n\n");

    const { parsed: orchestratorResult, inputTokens: oIn, outputTokens: oOut } = await callClaude(
      ORCH_SYSTEM,
      orchInput,
      MODEL_ORCH,
      TOKENS_ORCH,
    );
    tokenUsage.push({ type: "orch", inputTokens: oIn, outputTokens: oOut });

    // Return combined payload
    return new Response(
      JSON.stringify({ agentResults, orchestratorResult, tokenUsage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
