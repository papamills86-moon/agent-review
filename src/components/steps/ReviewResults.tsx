import { useState, useEffect } from 'react';
import type { CounselMember, TokenUsageEntry, RecommendedProfession } from '../../types/counsel';
import type { AgentDef } from '../../data/agentRegistry';
import GapRecommendations from './GapRecommendations';

// ─── Constants ──────────────────────────────────────────────────────────────

const CONCERN_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
const CONCERN_COLOR: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#4ade80',
  none: '#6b7280',
};

const VERDICT_META: Record<string, { label: string; color: string; bg: string }> = {
  approve: { label: 'APPROVED', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  approve_with_conditions: { label: 'APPROVED WITH CONDITIONS', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  defer: { label: 'DEFERRED', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  reject: { label: 'REJECTED', color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

const RISK_COLOR: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#4ade80',
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface ReviewResultsProps {
  members: CounselMember[];
  allAgents: AgentDef[];
  agentResults: Record<string, Record<string, unknown>>;
  orchestratorResult: Record<string, unknown> | null;
  reviewTokenUsage: TokenUsageEntry[];
  enhancementTokenUsage: TokenUsageEntry[];
  generationTokenUsage: TokenUsageEntry[];
  recommendedProfessions: RecommendedProfession[];
  insufficientCoverage: boolean;
  isReviewing: boolean;
  isGenerating: boolean;
  generatingProfession: string | null;
  onGenerateAgent: (profession: RecommendedProfession) => void;
  onSaveAgent: (agent: any) => void;
  generatedAgents: any[];
  onStartOver: () => void;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Badge({ text, color, bg }: { text: string; color: string; bg?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 3,
        color,
        background: bg ?? `${color}18`,
        border: `1px solid ${color}50`,
      }}
    >
      {text}
    </span>
  );
}

function TokenPill({ input, output }: { input: number; output: number }) {
  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: '#475569',
        background: 'rgba(71,85,105,0.15)',
        border: '1px solid #334155',
        borderRadius: 3,
        padding: '1px 6px',
        letterSpacing: '0.05em',
      }}
    >
      {(input + output).toLocaleString()}T
    </span>
  );
}

function Stat({ label, val }: { label: string; val: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: '#374151', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
        {val.toLocaleString()}
      </span>
    </div>
  );
}

// ─── Agent Card ─────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  result,
  tokenData,
}: {
  agent: AgentDef;
  result: Record<string, unknown>;
  tokenData: TokenUsageEntry | undefined;
}) {
  const [open, setOpen] = useState(true);
  const r = result as any;

  return (
    <div
      style={{
        border: `1px solid ${agent.accentColor}25`,
        borderLeft: `3px solid ${agent.accentColor}`,
        borderRadius: 6,
        background: agent.bgColor,
        padding: '14px 18px',
        transition: 'all 0.3s',
      }}
    >
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              fontWeight: 700,
              color: agent.accentColor,
              background: `${agent.accentColor}18`,
              padding: '2px 6px',
              borderRadius: 2,
              letterSpacing: '0.1em',
            }}
          >
            {agent.abbr}
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{agent.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tokenData && <TokenPill input={tokenData.inputTokens} output={tokenData.outputTokens} />}
          <Badge
            text={String(r.concern_level ?? '?')}
            color={CONCERN_COLOR[r.concern_level as string] ?? '#6b7280'}
          />
          <span style={{ color: '#374151', fontSize: 11 }}>{open ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {r.error ? (
            <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>Parse error: {r.error}</p>
          ) : (
            <>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, lineHeight: 1.65 }}>{r.summary}</p>
              {r.findings?.length > 0 && (
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {(r.findings as string[]).map((f: string, i: number) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12,
                        color: '#cbd5e1',
                        paddingLeft: 12,
                        position: 'relative',
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ position: 'absolute', left: 0, color: agent.accentColor }}>
                        ›
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              {r.recommendation && (
                <div
                  style={{
                    borderTop: `1px solid ${agent.accentColor}18`,
                    paddingTop: 9,
                    fontSize: 12,
                    color: '#e2e8f0',
                    lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}
                >
                  <span
                    style={{
                      color: agent.accentColor,
                      fontStyle: 'normal',
                      fontWeight: 700,
                      marginRight: 6,
                    }}
                  >
                    →
                  </span>
                  {r.recommendation}
                </div>
              )}
              {r.questions?.length > 0 && r.questions[0] && (
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
                  {(r.questions as string[]).map((q: string, i: number) => (
                    <div key={i} style={{ paddingLeft: 12, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0 }}>?</span>
                      {q}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Orchestrator Verdict Panel ─────────────────────────────────────────────

function OrchestratorPanel({ result }: { result: Record<string, unknown> }) {
  const r = result as any;
  const meta = VERDICT_META[r.verdict] ?? VERDICT_META.defer;
  const riskColor = RISK_COLOR[r.overall_risk as string] ?? '#6b7280';

  return (
    <div
      style={{
        border: '1px solid #1e293b',
        borderTop: '3px solid #64748b',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.02)',
        padding: '18px 22px',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              fontWeight: 700,
              color: '#94a3b8',
              background: 'rgba(148,163,184,0.1)',
              padding: '2px 6px',
              borderRadius: 2,
              letterSpacing: '0.1em',
            }}
          >
            ORCH
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Orchestrator Verdict</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Risk badge */}
          <Badge text={`risk: ${r.overall_risk ?? 'unknown'}`} color={riskColor} />
          {/* Verdict badge */}
          <div
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              background: meta.bg,
              border: `1px solid ${meta.color}50`,
              color: meta.color,
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            {meta.label}
          </div>
        </div>
      </div>

      {/* Content */}
      {!r.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.7 }}>{r.rationale}</p>

          {r.required_actions?.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#374151',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Required Before Proceeding
              </div>
              {(r.required_actions as string[]).map((a: string, i: number) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 9,
                    marginBottom: 5,
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(148,163,184,0.1)',
                      color: '#94a3b8',
                      fontSize: 9,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>{a}</span>
                </div>
              ))}
            </div>
          )}

          {r.open_questions?.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#374151',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Unresolved Questions
              </div>
              {(r.open_questions as string[]).map((q: string, i: number) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    color: '#475569',
                    paddingLeft: 12,
                    position: 'relative',
                    lineHeight: 1.5,
                    marginBottom: 3,
                  }}
                >
                  <span style={{ position: 'absolute', left: 0 }}>?</span>
                  {q}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading State ──────────────────────────────────────────────────────────

function ReviewingIndicator({ members, allAgents }: { members: CounselMember[]; allAgents: AgentDef[] }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 45_000; // 45 seconds to reach 85%
    const maxPct = 85;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(maxPct, (elapsed / duration) * maxPct);
      setProgress(pct);
    };

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  const agentMap = new Map(allAgents.map((a) => [a.id, a]));

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: 12,
        border: '1px solid #1e293b',
        padding: '48px 32px',
        textAlign: 'center',
      }}
    >
      {/* Pulsing agent initials */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        {members.map((m, i) => {
          const def = agentMap.get(m.id);
          const color = def?.accentColor ?? '#64748b';
          const abbr = def?.abbr ?? m.name.slice(0, 2).toUpperCase();
          return (
            <span
              key={m.id}
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                fontWeight: 700,
                color,
                background: `${color}18`,
                padding: '3px 8px',
                borderRadius: 3,
                letterSpacing: '0.1em',
                animation: 'pulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.12}s`,
              }}
            >
              {abbr}
            </span>
          );
        })}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          maxWidth: 320,
          height: 4,
          background: '#1e293b',
          borderRadius: 2,
          margin: '0 auto 14px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
            borderRadius: 2,
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>

      <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>Reviewing...</div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Token Summary ──────────────────────────────────────────────────────────

function TokenSummary({
  enhancementTokenUsage,
  reviewTokenUsage,
  generationTokenUsage,
}: {
  enhancementTokenUsage: TokenUsageEntry[];
  reviewTokenUsage: TokenUsageEntry[];
  generationTokenUsage: TokenUsageEntry[];
}) {
  const sum = (entries: TokenUsageEntry[]) =>
    entries.reduce((s, t) => s + t.inputTokens + t.outputTokens, 0);

  const enhanceTotal = sum(enhancementTokenUsage);
  const reviewTotal = sum(reviewTokenUsage);
  const genTotal = sum(generationTokenUsage);
  const combinedTotal = enhanceTotal + reviewTotal + genTotal;

  if (!reviewTotal && !enhanceTotal && !genTotal) return null;

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#374151',
    textTransform: 'uppercase',
  };

  return (
    <div
      style={{
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid #1e293b',
        borderRadius: 5,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <span style={{ ...sectionLabelStyle }}>Token Usage</span>

      {/* Enhancement section */}
      {enhanceTotal > 0 && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...sectionLabelStyle, color: '#a78bfa' }}>Enhancement</span>
          <Stat label="Tokens" val={enhanceTotal} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#475569' }}>Subtotal</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>
              {enhanceTotal.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Review section */}
      {reviewTotal > 0 && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...sectionLabelStyle, color: '#60a5fa' }}>Review</span>
          {(() => {
            const agentTotal = sum(reviewTokenUsage.filter((t) => t.type === 'agent'));
            const orchTotal = sum(
              reviewTokenUsage.filter((t) => t.type === 'orch' || t.type === 'orchestrator')
            );
            const compressTotal = sum(reviewTokenUsage.filter((t) => t.type === 'compress'));
            return (
              <>
                {compressTotal > 0 && <Stat label="Compress" val={compressTotal} />}
                <Stat label="Agents" val={agentTotal} />
                <Stat label="Orchestrator" val={orchTotal} />
              </>
            );
          })()}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#475569' }}>Subtotal</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>
              {reviewTotal.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Generation section */}
      {genTotal > 0 && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...sectionLabelStyle, color: '#4ade80' }}>Generation</span>
          <Stat label="Tokens" val={genTotal} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#475569' }}>Subtotal</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
              {genTotal.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Combined total */}
      <div
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#475569',
            textTransform: 'uppercase',
          }}
        >
          Combined Total
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
          {combinedTotal.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function ReviewResults({
  members,
  allAgents,
  agentResults,
  orchestratorResult,
  reviewTokenUsage,
  enhancementTokenUsage,
  generationTokenUsage,
  recommendedProfessions,
  insufficientCoverage: _insufficientCoverage,
  isReviewing,
  isGenerating,
  generatingProfession,
  onGenerateAgent,
  onSaveAgent: _onSaveAgent,
  generatedAgents,
  onStartOver,
}: ReviewResultsProps) {
  // Build agent lookup
  const agentMap = new Map(allAgents.map((a) => [a.id, a]));

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isReviewing) {
    return <ReviewingIndicator members={members} allAgents={allAgents} />;
  }

  // ─── No results yet ───────────────────────────────────────────────────────
  const hasResults = orchestratorResult || Object.keys(agentResults).length > 0;
  if (!hasResults) return null;

  // ─── Sort agents by concern level (critical first) ────────────────────────
  const sortedAgentIds = Object.keys(agentResults).sort((a, b) => {
    const levelA = (agentResults[a] as any)?.concern_level ?? 'none';
    const levelB = (agentResults[b] as any)?.concern_level ?? 'none';
    return (CONCERN_ORDER[levelA] ?? 4) - (CONCERN_ORDER[levelB] ?? 4);
  });

  // Build token lookup for agent cards
  const tokenMap = new Map<string, TokenUsageEntry>();
  for (const entry of reviewTokenUsage) {
    if (entry.type === 'agent' && entry.id) {
      tokenMap.set(entry.id, entry);
    }
  }

  // IDs of already-generated agents (for gap recommendations)
  const generatedAgentIds = generatedAgents.map((a: any) => a.name ?? a.id ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Orchestrator Verdict Panel */}
      {orchestratorResult && <OrchestratorPanel result={orchestratorResult} />}

      {/* 2. Agent Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sortedAgentIds.map((agentId) => {
          const def = agentMap.get(agentId);
          if (!def) return null;
          return (
            <AgentCard
              key={agentId}
              agent={def}
              result={agentResults[agentId]}
              tokenData={tokenMap.get(agentId)}
            />
          );
        })}
      </div>

      {/* 3. Gap Recommendations */}
      {recommendedProfessions.length > 0 && (
        <GapRecommendations
          professions={recommendedProfessions}
          isGenerating={isGenerating}
          generatingProfession={generatingProfession}
          generatedAgentIds={generatedAgentIds}
          onGenerate={onGenerateAgent}
        />
      )}

      {/* 4. Token Summary */}
      <TokenSummary
        enhancementTokenUsage={enhancementTokenUsage}
        reviewTokenUsage={reviewTokenUsage}
        generationTokenUsage={generationTokenUsage}
      />

      {/* 5. Footer */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 8 }}>
        <button
          onClick={onStartOver}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#94a3b8',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: '8px 24px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Run New Review
        </button>
      </div>
    </div>
  );
}

export default ReviewResults;
