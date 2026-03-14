import { useState, useCallback } from "react";

// ─── Models (labels only — execution happens server-side) ────────────────────
const MODEL_AGENT = "claude-haiku-4-5-20251001";
const MODEL_ORCH  = "claude-sonnet-4-20250514";
const TOKENS_AGENT = 450;
const TOKENS_ORCH  = 800;
const INPUT_COMPRESS_THRESHOLD = 600;

// ─── Agent Registry ──────────────────────────────────────────────────────────
const ALL_AGENTS = [
  {
    id: "security", name: "Security Architect", abbr: "SEC", group: "governance",
    accentColor: "#f87171", bgColor: "rgba(248,113,113,0.07)",
    defaultOn: true,
    systemPrompt: ""
  },
  {
    id: "compliance", name: "Compliance Officer", abbr: "CMP", group: "governance",
    accentColor: "#34d399", bgColor: "rgba(52,211,153,0.07)",
    defaultOn: true,
    systemPrompt: ""
  },
  {
    id: "product", name: "Product Manager", abbr: "PM", group: "product",
    accentColor: "#38bdf8", bgColor: "rgba(56,189,248,0.07)",
    defaultOn: true,
    systemPrompt: ""
  },
  {
    id: "qa", name: "QA Lead", abbr: "QA", group: "product",
    accentColor: "#fbbf24", bgColor: "rgba(251,191,36,0.07)",
    defaultOn: true,
    systemPrompt: ""
  },
  {
    id: "backend", name: "Backend Engineer", abbr: "ENG", group: "engineering",
    accentColor: "#a78bfa", bgColor: "rgba(167,139,250,0.07)",
    defaultOn: true,
    systemPrompt: ""
  },
  {
    id: "frontend", name: "Frontend Engineer", abbr: "FE", group: "engineering",
    accentColor: "#fb923c", bgColor: "rgba(251,146,60,0.07)",
    defaultOn: false,
    systemPrompt: ""
  },
  {
    id: "db", name: "Database Architect", abbr: "DB", group: "engineering",
    accentColor: "#e879f9", bgColor: "rgba(232,121,249,0.07)",
    defaultOn: false,
    systemPrompt: ""
  },
  {
    id: "devops", name: "DevOps Engineer", abbr: "OPS", group: "engineering",
    accentColor: "#4ade80", bgColor: "rgba(74,222,128,0.07)",
    defaultOn: false,
    systemPrompt: ""
  },
  {
    id: "api", name: "API Designer", abbr: "API", group: "engineering",
    accentColor: "#67e8f9", bgColor: "rgba(103,232,249,0.07)",
    defaultOn: false,
    systemPrompt: ""
  },
  {
    id: "googleplay", name: "Google Play Policy", abbr: "GP", group: "engineering",
    accentColor: "#34a853", bgColor: "rgba(52,168,83,0.07)",
    defaultOn: false,
    systemPrompt: ""
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CONCERN_ORDER: Record<string, number> = { critical:0, high:1, medium:2, low:3, none:4 };
const CONCERN_COLOR: Record<string, string> = { critical:"#f87171", high:"#fb923c", medium:"#fbbf24", low:"#4ade80", none:"#6b7280" };
const VERDICT_META: Record<string, { label: string; color: string; bg: string }> = {
  approve:                 { label:"APPROVED",                color:"#4ade80", bg:"rgba(74,222,128,0.1)" },
  approve_with_conditions: { label:"APPROVED WITH CONDITIONS", color:"#fbbf24", bg:"rgba(251,191,36,0.1)" },
  defer:                   { label:"DEFERRED",                color:"#a78bfa", bg:"rgba(167,139,250,0.1)" },
  reject:                  { label:"REJECTED",                color:"#f87171", bg:"rgba(248,113,113,0.1)" },
};

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

async function callEdgeFunction(input: string, agents: string[], email: string) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/multi-agent-review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "x-agent-secret": import.meta.env.VITE_EDGE_FUNCTION_SECRET,
      },
      body: JSON.stringify({ input, agents, email }),
    }
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Edge Function error ${res.status}: ${errorText}`);
  }
  return res.json() as Promise<{
    agentResults: Record<string, any>;
    orchestratorResult: any;
    tokenUsage: any[];
  }>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const Badge = ({ text, color, bg }: { text: string; color: string; bg?: string }) => (
  <span style={{
    fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase",
    padding:"2px 8px", borderRadius:"3px", color, background: bg ?? `${color}18`,
    border:`1px solid ${color}50`
  }}>{text}</span>
);

function TokenPill({ input, output }: { input: number; output: number }) {
  const total = input + output;
  return (
    <span style={{
      fontFamily:"monospace", fontSize:"9px", color:"#475569",
      background:"rgba(71,85,105,0.15)", border:"1px solid #334155",
      borderRadius:"3px", padding:"1px 6px", letterSpacing:"0.05em"
    }}>
      {total.toLocaleString()}T
    </span>
  );
}

function AgentToggle({ agent, enabled, onToggle }: { agent: any; enabled: boolean; onToggle: (id: string) => void }) {
  return (
    <button onClick={() => onToggle(agent.id)} style={{
      display:"flex", alignItems:"center", gap:"7px",
      padding:"5px 10px", borderRadius:"4px", cursor:"pointer",
      background: enabled ? agent.bgColor : "rgba(255,255,255,0.02)",
      border:`1px solid ${enabled ? agent.accentColor+"50" : "#1e293b"}`,
      transition:"all 0.15s"
    }}>
      <span style={{
        width:"8px", height:"8px", borderRadius:"50%",
        background: enabled ? agent.accentColor : "#334155",
        transition:"background 0.15s", flexShrink:0
      }} />
      <span style={{
        fontFamily:"monospace", fontSize:"9px", fontWeight:700,
        color: enabled ? agent.accentColor : "#4b5563", letterSpacing:"0.1em"
      }}>{agent.abbr}</span>
      <span style={{ fontSize:"11px", color: enabled ? "#94a3b8" : "#374151" }}>{agent.name}</span>
    </button>
  );
}

function AgentCard({ agent, result, isLoading, tokenData }: { agent: any; result: any; isLoading: boolean; tokenData: any }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      border:`1px solid ${agent.accentColor}25`,
      borderLeft:`3px solid ${isLoading ? "#1e293b" : agent.accentColor}`,
      borderRadius:"6px", background: isLoading ? "rgba(255,255,255,0.01)" : agent.bgColor,
      padding:"14px 18px", transition:"all 0.3s"
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        cursor: result ? "pointer" : "default" }}
        onClick={() => result && setOpen(o => !o)}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <span style={{
            fontFamily:"monospace", fontSize:"9px", fontWeight:700,
            color:agent.accentColor, background:`${agent.accentColor}18`,
            padding:"2px 6px", borderRadius:"2px", letterSpacing:"0.1em"
          }}>{agent.abbr}</span>
          <span style={{ fontWeight:600, fontSize:"13px", color:"#e2e8f0" }}>{agent.name}</span>
          <span style={{ fontSize:"9px", color:"#374151", letterSpacing:"0.05em", textTransform:"uppercase" }}>
            {MODEL_AGENT.split("-")[2]}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          {tokenData && <TokenPill input={tokenData.inputTokens} output={tokenData.outputTokens} />}
          {isLoading && <span style={{ color:"#374151", fontSize:"11px", fontStyle:"italic" }}>analyzing…</span>}
          {result && !isLoading && <Badge text={result.concern_level ?? "?"} color={CONCERN_COLOR[result.concern_level] ?? "#6b7280"} />}
          {result && <span style={{ color:"#374151", fontSize:"11px" }}>{open ? "▲" : "▼"}</span>}
        </div>
      </div>

      {isLoading && (
        <div style={{ display:"flex", gap:"4px", marginTop:"10px" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width:"5px", height:"5px", borderRadius:"50%",
              background:agent.accentColor, opacity:0.5,
              animation:"pulse 1.1s ease-in-out infinite", animationDelay:`${i*0.18}s` }} />
          ))}
        </div>
      )}

      {result && open && !isLoading && (
        <div style={{ marginTop:"12px", display:"flex", flexDirection:"column", gap:"10px" }}>
          {result.error
            ? <p style={{ color:"#f87171", fontSize:"12px", margin:0 }}>Parse error: {result.error}</p>
            : <>
              <p style={{ color:"#94a3b8", fontSize:"12px", margin:0, lineHeight:1.65 }}>{result.summary}</p>
              {result.findings?.length > 0 && (
                <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:"4px" }}>
                  {result.findings.map((f: string, i: number) => (
                    <li key={i} style={{ fontSize:"12px", color:"#cbd5e1", paddingLeft:"12px", position:"relative", lineHeight:1.5 }}>
                      <span style={{ position:"absolute", left:0, color:agent.accentColor }}>›</span>{f}
                    </li>
                  ))}
                </ul>
              )}
              {result.recommendation && (
                <div style={{ borderTop:`1px solid ${agent.accentColor}18`, paddingTop:"9px",
                  fontSize:"12px", color:"#e2e8f0", lineHeight:1.6, fontStyle:"italic" }}>
                  <span style={{ color:agent.accentColor, fontStyle:"normal", fontWeight:700, marginRight:"6px" }}>→</span>
                  {result.recommendation}
                </div>
              )}
              {result.questions?.length > 0 && result.questions[0] && (
                <div style={{ fontSize:"11px", color:"#475569", lineHeight:1.5 }}>
                  {result.questions.map((q: string, i: number) => (
                    <div key={i} style={{ paddingLeft:"12px", position:"relative" }}>
                      <span style={{ position:"absolute", left:0 }}>?</span>{q}
                    </div>
                  ))}
                </div>
              )}
            </>
          }
        </div>
      )}
    </div>
  );
}

function OrchestratorPanel({ result, isLoading, tokenData }: { result: any; isLoading: boolean; tokenData: any }) {
  if (!isLoading && !result) return null;
  const meta = result ? (VERDICT_META[result.verdict] ?? VERDICT_META.defer) : null;
  return (
    <div style={{
      border:"1px solid #1e293b", borderTop:"3px solid #64748b",
      borderRadius:"6px", background:"rgba(255,255,255,0.02)", padding:"18px 22px"
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <span style={{
            fontFamily:"monospace", fontSize:"9px", fontWeight:700,
            color:"#94a3b8", background:"rgba(148,163,184,0.1)",
            padding:"2px 6px", borderRadius:"2px", letterSpacing:"0.1em"
          }}>ORCH</span>
          <span style={{ fontWeight:700, fontSize:"14px", color:"#f1f5f9" }}>Orchestrator Verdict</span>
          <span style={{ fontSize:"9px", color:"#374151", letterSpacing:"0.05em", textTransform:"uppercase" }}>
            {MODEL_ORCH.split("-")[2]}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          {tokenData && <TokenPill input={tokenData.inputTokens} output={tokenData.outputTokens} />}
          {isLoading && <span style={{ color:"#374151", fontSize:"11px", fontStyle:"italic" }}>synthesizing…</span>}
          {meta && !isLoading && (
            <div style={{ padding:"4px 12px", borderRadius:"4px",
              background:meta.bg, border:`1px solid ${meta.color}50`,
              color:meta.color, fontWeight:800, fontSize:"10px", letterSpacing:"0.1em" }}>
              {meta.label}
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div style={{ display:"flex", gap:"4px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width:"5px", height:"5px", borderRadius:"50%",
              background:"#94a3b8", opacity:0.4,
              animation:"pulse 1.1s ease-in-out infinite", animationDelay:`${i*0.13}s` }} />
          ))}
        </div>
      )}

      {result && !isLoading && !result.error && (
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <p style={{ color:"#94a3b8", fontSize:"13px", margin:0, lineHeight:1.7 }}>{result.rationale}</p>

          {result.required_actions?.length > 0 && (
            <div>
              <div style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.1em", color:"#374151",
                textTransform:"uppercase", marginBottom:"8px" }}>Required Before Proceeding</div>
              {result.required_actions.map((a: string, i: number) => (
                <div key={i} style={{ display:"flex", gap:"9px", marginBottom:"5px", alignItems:"flex-start" }}>
                  <span style={{ minWidth:"18px", height:"18px", borderRadius:"50%",
                    background:"rgba(148,163,184,0.1)", color:"#94a3b8",
                    fontSize:"9px", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {i+1}
                  </span>
                  <span style={{ fontSize:"12px", color:"#e2e8f0", lineHeight:1.6 }}>{a}</span>
                </div>
              ))}
            </div>
          )}

          {result.open_questions?.length > 0 && (
            <div>
              <div style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.1em", color:"#374151",
                textTransform:"uppercase", marginBottom:"6px" }}>Unresolved Questions</div>
              {result.open_questions.map((q: string, i: number) => (
                <div key={i} style={{ fontSize:"11px", color:"#475569", paddingLeft:"12px",
                  position:"relative", lineHeight:1.5, marginBottom:"3px" }}>
                  <span style={{ position:"absolute", left:0 }}>?</span>{q}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TokenSummary({ tokenLog }: { tokenLog: any[] }) {
  if (!tokenLog.length) return null;
  const total = tokenLog.reduce((s: number, t: any) => s + t.inputTokens + t.outputTokens, 0);
  const agentTotal = tokenLog.filter((t: any) => t.type === "agent").reduce((s: number, t: any) => s + t.inputTokens + t.outputTokens, 0);
  const orchTotal = tokenLog.filter((t: any) => t.type === "orch").reduce((s: number, t: any) => s + t.inputTokens + t.outputTokens, 0);
  const compressTotal = tokenLog.filter((t: any) => t.type === "compress").reduce((s: number, t: any) => s + t.inputTokens + t.outputTokens, 0);
  return (
    <div style={{
      background:"rgba(15,23,42,0.8)", border:"1px solid #1e293b",
      borderRadius:"5px", padding:"10px 14px",
      display:"flex", gap:"20px", flexWrap:"wrap", alignItems:"center"
    }}>
      <span style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.1em", color:"#374151", textTransform:"uppercase" }}>Token Usage</span>
      {compressTotal > 0 && <Stat label="Compress" val={compressTotal} />}
      <Stat label={`Agents (${MODEL_AGENT.includes("haiku") ? "Haiku" : "Sonnet"})`} val={agentTotal} />
      <Stat label={`Orchestrator (Sonnet)`} val={orchTotal} />
      <div style={{ marginLeft:"auto", display:"flex", gap:"4px", alignItems:"center" }}>
        <span style={{ fontSize:"9px", color:"#475569" }}>TOTAL</span>
        <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:700, color:"#94a3b8" }}>
          {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
const Stat = ({ label, val }: { label: string; val: number }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:"2px" }}>
    <span style={{ fontSize:"9px", color:"#374151", letterSpacing:"0.05em" }}>{label}</span>
    <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#64748b" }}>{val.toLocaleString()}</span>
  </div>
);

// ─── Samples ──────────────────────────────────────────────────────────────────
const SAMPLES = [
  { label:"Share Feature CR", agents:["security","compliance","product","qa","backend","api"],
    text:"We want to add a 'Share Inventory' feature that generates a public, unauthenticated URL for any user's estate inventory. The link never expires unless manually revoked. Items marked 'private' are hidden, but all other items are visible to anyone with the link." },
  { label:"DB Migration", agents:["db","backend","devops","security","compliance"],
    text:"We're adding a new 'valuation_history' table that will store one row per item per day tracking estimated_value. The migration adds the table and backfills 6 months of historical data (~2M rows) from an external valuation API. We plan to run this during business hours." },
  { label:"Frontend Perf Audit", agents:["frontend","qa","devops","backend"],
    text:"The InventoryScreen is re-rendering on every keystroke in the search field because useSubmissions is called at the top level of the screen component and the entire list re-renders. There are also three separate Supabase queries fired on mount with no loading state coordination." },
  { label:"JWT Auth Finding", agents:["security","compliance","backend","api"],
    text:"Security audit finding: The analyze-item Edge Function does not verify user JWTs before executing. Any request with a valid anon key can trigger item analysis. This function has been live for 6 months and processes uploaded images." },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MultiAgentReview({ email }: { email: string }) {
  const [input, setInput] = useState("");
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_AGENTS.map(a => [a.id, a.defaultOn]))
  );
  const [agentResults, setAgentResults] = useState<Record<string, any>>({});
  const [agentLoading, setAgentLoading] = useState<Record<string, boolean>>({});
  const [agentTokens, setAgentTokens]   = useState<Record<string, any>>({});
  const [orchResult, setOrchResult]     = useState<any>(null);
  const [orchLoading, setOrchLoading]   = useState(false);
  const [orchTokens, setOrchTokens]     = useState<any>(null);
  const [phase, setPhase] = useState<"idle" | "reviewing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tokenLog, setTokenLog] = useState<any[]>([]);

  const activeAgents = ALL_AGENTS.filter(a => enabledAgents[a.id]);
  const needsCompression = input.length > INPUT_COMPRESS_THRESHOLD;
  const inputTokenEst = tokenEstimate(input);

  const toggleAgent = (id: string) => {
    setEnabledAgents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const applySample = (sample: typeof SAMPLES[number]) => {
    setInput(sample.text);
    const next = Object.fromEntries(ALL_AGENTS.map(a => [a.id, sample.agents.includes(a.id)]));
    setEnabledAgents(next);
  };

  const runReview = useCallback(async () => {
    if (!input.trim() || !activeAgents.length) return;

    // Reset state
    setPhase("reviewing");
    setAgentResults({}); setAgentLoading({}); setAgentTokens({});
    setOrchResult(null); setOrchTokens(null);
    setTokenLog([]); setErrorMsg("");

    // Show loading state for all active agents
    const loadingState = Object.fromEntries(activeAgents.map(a => [a.id, true]));
    setAgentLoading(loadingState);
    setOrchLoading(true);

    try {
      // Single Edge Function call — it handles compression, fan-out, and orchestration
      const agentIds = activeAgents.map(a => a.id);
      const payload = await callEdgeFunction(input, agentIds, email);

      // Populate agent results all at once
      setAgentResults(payload.agentResults);
      setAgentLoading(Object.fromEntries(activeAgents.map(a => [a.id, false])));

      // Populate agent token data from payload
      const agentTokenData: Record<string, any> = {};
      for (const entry of payload.tokenUsage) {
        if (entry.type === "agent") {
          agentTokenData[entry.id] = { inputTokens: entry.inputTokens, outputTokens: entry.outputTokens };
        }
      }
      setAgentTokens(agentTokenData);

      // Populate orchestrator result
      setOrchResult(payload.orchestratorResult);
      setOrchLoading(false);

      const orchEntry = payload.tokenUsage.find((t: any) => t.type === "orch");
      if (orchEntry) {
        setOrchTokens({ inputTokens: orchEntry.inputTokens, outputTokens: orchEntry.outputTokens });
      }

      // Set full token log
      setTokenLog(payload.tokenUsage);
      setPhase("done");
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err.message ?? "Unknown error");
      setAgentLoading(Object.fromEntries(activeAgents.map(a => [a.id, false])));
      setOrchLoading(false);
    }
  }, [input, activeAgents]);

  const reset = () => {
    setInput(""); setAgentResults({}); setAgentLoading({}); setAgentTokens({});
    setOrchResult(null); setOrchLoading(false); setOrchTokens(null);
    setTokenLog([]); setErrorMsg("");
    setPhase("idle");
  };

  const sortedActiveAgents = phase === "done"
    ? [...activeAgents].sort((a,b) =>
        (CONCERN_ORDER[agentResults[a.id]?.concern_level] ?? 99) -
        (CONCERN_ORDER[agentResults[b.id]?.concern_level] ?? 99))
    : activeAgents;

  const groups = ["governance", "product", "engineering"];
  const isRunning = phase === "reviewing";

  return (
    <div style={{
      minHeight:"100vh", background:"#080d18",
      fontFamily:"'DM Sans', 'Segoe UI', sans-serif",
      color:"#e2e8f0", padding:"28px 20px"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:0.9} }
        textarea { outline:none; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:2px; }
      `}</style>

      <div style={{ maxWidth:"780px", margin:"0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom:"28px", borderBottom:"1px solid #0f172a", paddingBottom:"20px" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:"12px" }}>
            <h1 style={{ fontFamily:"DM Mono, monospace", fontSize:"18px", fontWeight:500,
              margin:0, color:"#f1f5f9", letterSpacing:"-0.02em" }}>
              Multi-Agent Review Board
            </h1>
            <span style={{ fontFamily:"DM Mono, monospace", fontSize:"10px",
              color:"#374151", letterSpacing:"0.1em" }}>v2.0</span>
          </div>
          <p style={{ margin:"6px 0 0", color:"#374151", fontSize:"12px", lineHeight:1.6 }}>
            Parallel expert review · Model tiering (Haiku → Sonnet) · Input compression · Conditional routing
          </p>
        </div>

        {/* Agent Configurator */}
        {phase === "idle" && (
          <div style={{ marginBottom:"24px" }}>
            <div style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.12em",
              color:"#374151", textTransform:"uppercase", marginBottom:"10px" }}>
              Active Reviewers — {activeAgents.length} selected
            </div>
            {groups.map(g => (
              <div key={g} style={{ marginBottom:"10px" }}>
                <div style={{ fontSize:"9px", color:"#1e293b", letterSpacing:"0.08em",
                  textTransform:"uppercase", marginBottom:"6px" }}>{g}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                  {ALL_AGENTS.filter(a => a.group === g).map(a => (
                    <AgentToggle key={a.id} agent={a} enabled={enabledAgents[a.id]} onToggle={toggleAgent} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Samples */}
        {phase === "idle" && (
          <div style={{ display:"flex", gap:"7px", marginBottom:"14px", flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:"10px", color:"#374151" }}>Load sample:</span>
            {SAMPLES.map(s => (
              <button key={s.label} onClick={() => applySample(s)} style={{
                padding:"4px 11px", borderRadius:"4px", cursor:"pointer",
                background:"transparent", border:"1px solid #1e293b",
                color:"#475569", fontSize:"11px", transition:"all 0.15s"
              }}
              onMouseOver={e => { (e.target as HTMLElement).style.borderColor="#334155"; (e.target as HTMLElement).style.color="#94a3b8"; }}
              onMouseOut={e => { (e.target as HTMLElement).style.borderColor="#1e293b"; (e.target as HTMLElement).style.color="#475569"; }}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        {phase === "idle" && (
          <div style={{ marginBottom:"20px" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Describe a change request or paste an audit finding…"
              style={{
                width:"100%", minHeight:"130px", background:"#0c1221",
                border:"1px solid #1e293b", borderRadius:"6px",
                color:"#e2e8f0", fontSize:"13px", padding:"13px 15px",
                resize:"vertical", lineHeight:1.7, boxSizing:"border-box",
                fontFamily:"DM Sans, sans-serif", transition:"border-color 0.15s"
              }}
              onFocus={e => e.target.style.borderColor="#334155"}
              onBlur={e => e.target.style.borderColor="#1e293b"}
            />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"10px" }}>
              <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                <span style={{ fontFamily:"DM Mono, monospace", fontSize:"10px", color:"#374151" }}>
                  ~{inputTokenEst} tokens
                </span>
                {needsCompression && (
                  <span style={{
                    fontSize:"10px", color:"#fbbf24", background:"rgba(251,191,36,0.08)",
                    border:"1px solid rgba(251,191,36,0.2)", borderRadius:"3px", padding:"2px 8px"
                  }}>
                    ↓ Will be compressed before routing
                  </span>
                )}
              </div>
              <button onClick={runReview} disabled={!input.trim() || !activeAgents.length} style={{
                padding:"9px 22px", background: (input.trim() && activeAgents.length) ? "#0f2744" : "#0c1221",
                border:`1px solid ${(input.trim() && activeAgents.length) ? "#1d4ed850" : "#1e293b"}`,
                borderRadius:"5px", color:(input.trim() && activeAgents.length) ? "#60a5fa" : "#374151",
                fontSize:"12px", fontWeight:600, cursor:(input.trim() && activeAgents.length) ? "pointer" : "default",
                transition:"all 0.15s"
              }}>
                Submit for Review →
              </button>
            </div>
          </div>
        )}

        {/* Status bar */}
        {isRunning && (
          <div style={{ display:"flex", alignItems:"center", gap:"8px",
            marginBottom:"16px", padding:"8px 14px",
            background:"#0c1221", border:"1px solid #1e293b", borderRadius:"5px" }}>
            <div style={{ width:"6px", height:"6px", borderRadius:"50%",
              background:"#60a5fa", animation:"pulse 1s ease-in-out infinite" }} />
            <span style={{ fontSize:"11px", color:"#475569", fontFamily:"DM Mono, monospace" }}>
              Running {activeAgents.length} agents via Edge Function…
            </span>
          </div>
        )}

        {/* Error display */}
        {phase === "error" && (
          <div style={{ marginBottom:"16px", padding:"12px 16px",
            background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)",
            borderRadius:"5px", fontSize:"12px", color:"#f87171" }}>
            <strong>Error:</strong> {errorMsg}
            <button onClick={reset} style={{
              marginLeft:"12px", padding:"4px 10px", background:"transparent",
              border:"1px solid rgba(248,113,113,0.3)", borderRadius:"3px",
              color:"#f87171", fontSize:"11px", cursor:"pointer"
            }}>Try Again</button>
          </div>
        )}

        {/* Input summary when reviewing */}
        {phase !== "idle" && input && (
          <div style={{
            background:"#0c1221", border:"1px solid #1e293b", borderRadius:"5px",
            padding:"10px 14px", marginBottom:"18px",
            display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"16px"
          }}>
            <p style={{ margin:0, fontSize:"11px", color:"#374151", lineHeight:1.6, maxWidth:"600px" }}>
              {input.length > 180 ? input.slice(0,180) + "…" : input}
            </p>
            {(phase === "done" || phase === "error") && (
              <button onClick={reset} style={{
                padding:"4px 10px", background:"transparent",
                border:"1px solid #1e293b", borderRadius:"3px",
                color:"#475569", fontSize:"10px", cursor:"pointer", whiteSpace:"nowrap"
              }}>New Review</button>
            )}
          </div>
        )}

        {/* Agent Cards */}
        {(phase === "reviewing" || phase === "done") && (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"16px" }}>
            <div style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.12em",
              color:"#1e293b", textTransform:"uppercase", marginBottom:"2px" }}>
              Phase 1 — Parallel Expert Review · {MODEL_AGENT.includes("haiku") ? "claude-haiku" : "claude-sonnet"} · max {TOKENS_AGENT} tokens/agent
            </div>
            {sortedActiveAgents.map(agent => (
              <AgentCard
                key={agent.id} agent={agent}
                result={agentResults[agent.id]}
                isLoading={agentLoading[agent.id] ?? false}
                tokenData={agentTokens[agent.id]}
              />
            ))}
          </div>
        )}

        {/* Orchestrator */}
        {(phase === "reviewing" || phase === "done") && (
          <div style={{ marginBottom:"16px" }}>
            <div style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.12em",
              color:"#1e293b", textTransform:"uppercase", marginBottom:"8px" }}>
              Phase 2 — Synthesis · claude-sonnet · max {TOKENS_ORCH} tokens
            </div>
            <OrchestratorPanel result={orchResult} isLoading={orchLoading} tokenData={orchTokens} />
          </div>
        )}

        {/* Token summary */}
        {tokenLog.length > 0 && <TokenSummary tokenLog={tokenLog} />}

      </div>
    </div>
  );
}
