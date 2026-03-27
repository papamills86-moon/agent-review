import type { CustomAgent } from '../types/counsel';

// ─── Built-in Agent Definition ──────────────────────────────────────────────
export interface BuiltinAgent {
  id: string;
  name: string;
  abbr: string;
  group: string;
  accentColor: string;
  bgColor: string;
  defaultOn: boolean;
  expertiseTags: string[];
}

// ─── Unified agent shape used throughout the UI ─────────────────────────────
export interface AgentDef extends BuiltinAgent {
  isCustom: boolean;
  systemPrompt?: string;
}

// ─── The 10 built-in agents ─────────────────────────────────────────────────
export const BUILTIN_AGENTS: BuiltinAgent[] = [
  {
    id: "security", name: "Security Architect", abbr: "SEC", group: "governance",
    accentColor: "#f87171", bgColor: "rgba(248,113,113,0.07)",
    defaultOn: true,
    expertiseTags: ["security","auth","vulnerabilities","encryption","OWASP"],
  },
  {
    id: "compliance", name: "Compliance Officer", abbr: "CMP", group: "governance",
    accentColor: "#34d399", bgColor: "rgba(52,211,153,0.07)",
    defaultOn: true,
    expertiseTags: ["compliance","regulatory","GDPR","SOC2","audit"],
  },
  {
    id: "product", name: "Product Manager", abbr: "PM", group: "product",
    accentColor: "#38bdf8", bgColor: "rgba(56,189,248,0.07)",
    defaultOn: true,
    expertiseTags: ["product","requirements","user-stories","prioritization"],
  },
  {
    id: "qa", name: "QA Lead", abbr: "QA", group: "product",
    accentColor: "#fbbf24", bgColor: "rgba(251,191,36,0.07)",
    defaultOn: true,
    expertiseTags: ["testing","quality","edge-cases","regression","coverage"],
  },
  {
    id: "backend", name: "Backend Engineer", abbr: "ENG", group: "engineering",
    accentColor: "#a78bfa", bgColor: "rgba(167,139,250,0.07)",
    defaultOn: true,
    expertiseTags: ["backend","architecture","performance","scalability"],
  },
  {
    id: "frontend", name: "Frontend Engineer", abbr: "FE", group: "engineering",
    accentColor: "#fb923c", bgColor: "rgba(251,146,60,0.07)",
    defaultOn: false,
    expertiseTags: ["frontend","React","UI/UX","accessibility","TypeScript"],
  },
  {
    id: "db", name: "Database Architect", abbr: "DB", group: "engineering",
    accentColor: "#e879f9", bgColor: "rgba(232,121,249,0.07)",
    defaultOn: false,
    expertiseTags: ["database","schema","queries","optimization","migrations"],
  },
  {
    id: "devops", name: "DevOps Engineer", abbr: "OPS", group: "engineering",
    accentColor: "#4ade80", bgColor: "rgba(74,222,128,0.07)",
    defaultOn: false,
    expertiseTags: ["devops","CI/CD","deployment","infrastructure","monitoring"],
  },
  {
    id: "api", name: "API Designer", abbr: "API", group: "engineering",
    accentColor: "#67e8f9", bgColor: "rgba(103,232,249,0.07)",
    defaultOn: false,
    expertiseTags: ["REST","GraphQL","contracts","versioning","integration"],
  },
  {
    id: "googleplay", name: "Google Play Policy", abbr: "GP", group: "engineering",
    accentColor: "#34a853", bgColor: "rgba(52,168,83,0.07)",
    defaultOn: false,
    expertiseTags: ["google-play","app-store","policy","mobile","compliance"],
  },
];

// ─── Color palette for dynamically generated agents ─────────────────────────
const CUSTOM_AGENT_COLORS = [
  { accent: "#f472b6", bg: "rgba(244,114,182,0.07)" },  // pink
  { accent: "#c084fc", bg: "rgba(192,132,252,0.07)" },  // violet
  { accent: "#22d3ee", bg: "rgba(34,211,238,0.07)" },   // cyan
  { accent: "#facc15", bg: "rgba(250,204,21,0.07)" },   // yellow
  { accent: "#2dd4bf", bg: "rgba(45,212,191,0.07)" },   // teal
  { accent: "#f97316", bg: "rgba(249,115,22,0.07)" },   // orange
  { accent: "#818cf8", bg: "rgba(129,140,248,0.07)" },  // indigo
  { accent: "#a3e635", bg: "rgba(163,230,53,0.07)" },   // lime
  { accent: "#fb7185", bg: "rgba(251,113,133,0.07)" },  // rose
  { accent: "#38bdf8", bg: "rgba(56,189,248,0.07)" },   // sky
];

/** Pick a color for a custom agent based on its index in the custom pool. */
export function getCustomAgentColor(index: number): { accent: string; bg: string } {
  return CUSTOM_AGENT_COLORS[index % CUSTOM_AGENT_COLORS.length];
}

/** Convert a CustomAgent (DB shape) to the unified AgentDef used by UI. */
export function customAgentToDef(agent: CustomAgent): AgentDef {
  return {
    id: agent.id,
    name: agent.name,
    abbr: agent.abbr,
    group: agent.group,
    accentColor: agent.accentColor,
    bgColor: agent.bgColor,
    defaultOn: false,
    expertiseTags: agent.expertiseTags,
    isCustom: true,
    systemPrompt: agent.systemPrompt,
  };
}

/** Merge built-in agents with custom agents from DB into a single AgentDef[]. */
export function mergeAgents(custom: CustomAgent[]): AgentDef[] {
  const builtinDefs: AgentDef[] = BUILTIN_AGENTS.map(a => ({ ...a, isCustom: false }));
  const customDefs: AgentDef[] = custom
    .filter(c => c.active)
    .map(customAgentToDef);
  return [...builtinDefs, ...customDefs];
}

/** Lookup map: agent ID → AgentDef. Built from merged list. */
export function buildAgentMap(agents: AgentDef[]): Map<string, AgentDef> {
  return new Map(agents.map(a => [a.id, a]));
}
