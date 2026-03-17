import { useState, useEffect } from 'react';
import type { CounselMember, AuditEntry } from '../types/counsel';

interface CounselResultsPanelProps {
  members: CounselMember[];
  reviewResult: Record<string, unknown> | null;
  reviewStartTimestamp: string;
  auditLog: AuditEntry[];
  phase: 'reviewing' | 'complete';
  tokenUsage: Array<{ type: string; id?: string; inputTokens: number; outputTokens: number }> | null;
  onRunAgain: () => void;
}

function CounselResultsPanel({
  members,
  reviewResult,
  reviewStartTimestamp: _reviewStartTimestamp,
  auditLog,
  phase,
  tokenUsage,
  onRunAgain,
}: CounselResultsPanelProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [lastPollTime, setLastPollTime] = useState(Date.now());
  const [auditOpen, setAuditOpen] = useState(false);

  // Elapsed timer (reviewing only)
  useEffect(() => {
    if (phase !== 'reviewing') return;
    const id = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 30-second poll display
  useEffect(() => {
    const id = setInterval(() => setLastPollTime(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Progress calculation
  useEffect(() => {
    if (phase === 'reviewing') {
      setProgressPercent(elapsedSeconds <= 45 ? Math.round((elapsedSeconds / 45) * 85) : 85);
    } else if (phase === 'complete') {
      setProgressPercent(100);
    }
  }, [elapsedSeconds, phase]);

  const verdict = (reviewResult as { verdict?: string })?.verdict;
  const overallRisk = (reviewResult as { overall_risk?: string })?.overall_risk;
  const rationale = (reviewResult as { rationale?: string })?.rationale;
  const requiredActions = (reviewResult as { required_actions?: string[] })?.required_actions;
  const openQuestions = (reviewResult as { open_questions?: string[] })?.open_questions;
  const agentResults = (reviewResult as { agentResults?: Record<string, unknown> })?.agentResults;

  const verdictStyles: Record<string, { background: string; color: string; label: string }> = {
    approve: { background: '#14532d', color: '#22c55e', label: '✓ APPROVE' },
    approve_with_conditions: { background: '#713f12', color: '#f59e0b', label: '◐ APPROVE WITH CONDITIONS' },
    defer: { background: '#431407', color: '#f97316', label: '⏸ DEFER' },
    reject: { background: '#450a0a', color: '#ef4444', label: '✗ REJECT' },
  };

  const concernStyles: Record<string, { background: string; color: string }> = {
    low: { background: '#14532d', color: '#22c55e' },
    medium: { background: '#713f12', color: '#f59e0b' },
    high: { background: '#431407', color: '#f97316' },
    critical: { background: '#450a0a', color: '#ef4444' },
  };

  const actionColorMap: Record<string, string> = {
    'auto-selected': '#3b82f6',
    'manually-added': '#22c55e',
    'manually-removed': '#6b7280',
    confirmed: '#f59e0b',
  };

  const handleExportAudit = () => {
    const blob = new Blob([JSON.stringify(auditLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    a.href = url;
    a.download = `counsel-audit-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: '#0c1221', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Counsel Review</span>
        {phase === 'complete' && reviewResult && verdict && verdictStyles[verdict] && (
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 700,
              background: verdictStyles[verdict].background,
              color: verdictStyles[verdict].color,
            }}
          >
            {verdictStyles[verdict].label}
          </span>
        )}
      </div>

      {/* Elapsed time */}
      <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
        Time elapsed: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
      </div>

      {/* Progress section (reviewing only) */}
      {phase === 'reviewing' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 12 }}>Review in progress...</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 12 }}>
            {members.map(member => {
              const initials = member.name
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <div
                  key={member.id}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: '#1e3a5f',
                    border: '2px solid #3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#3b82f6', fontSize: 12, fontWeight: 700 }}>{initials}</span>
                </div>
              );
            })}
          </div>
          <div style={{ background: '#0f172a', height: 6, borderRadius: 3, marginBottom: 8 }}>
            <div
              style={{
                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                height: '100%',
                borderRadius: 3,
                width: `${progressPercent}%`,
                transition: 'width 1s linear',
              }}
            />
          </div>
          <div style={{ color: '#4b5563', fontSize: 11 }}>
            Updated {Math.round((Date.now() - lastPollTime) / 1000)}s ago
          </div>
        </div>
      )}

      {/* Results section */}
      {reviewResult !== null && (
        <>
          {/* Orchestrator block */}
          <div
            style={{
              background: '#0c1221',
              border: '1px solid #1e2d3d',
              borderRadius: 8,
              padding: 16,
              marginTop: 16,
            }}
          >
            {overallRisk && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  ...(concernStyles[overallRisk] || { background: '#1e293b', color: '#94a3b8' }),
                }}
              >
                {overallRisk.toUpperCase()} RISK
              </span>
            )}
            {rationale && (
              <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{rationale}</p>
            )}
            {requiredActions && requiredActions.length > 0 && (
              <ol style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.7, paddingLeft: 20, marginTop: 8 }}>
                {requiredActions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ol>
            )}
            {openQuestions && openQuestions.length > 0 && (
              <ul style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.7, paddingLeft: 20, marginTop: 8 }}>
                {openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-reviewer cards */}
          {agentResults && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
                marginTop: 16,
              }}
            >
              {members.map(member => {
                const result = agentResults[member.id] as
                  | { concern_level?: string; summary?: string; findings?: unknown[]; expertise_tags?: string[] }
                  | undefined;
                if (!result) return null;
                const level = result.concern_level || 'low';
                const style = concernStyles[level] || { background: '#1e293b', color: '#94a3b8' };
                const findings = result.findings || [];
                return (
                  <div
                    key={member.id}
                    style={{
                      background: '#0c1221',
                      border: '1px solid #1e2d3d',
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{member.name}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 }}>
                      {member.expertiseTags.map(tag => (
                        <span
                          key={tag}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            background: '#1e293b',
                            color: '#94a3b8',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: style.background,
                        color: style.color,
                      }}
                    >
                      {level.toUpperCase()}
                    </span>
                    {result.summary && (
                      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>{result.summary}</p>
                    )}
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 8,
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: '#1e293b',
                        color: '#64748b',
                      }}
                    >
                      {findings.length} findings
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Token usage */}
          {tokenUsage && tokenUsage.length > 0 && (
            <div
              style={{
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid #1e293b',
                borderRadius: 5,
                padding: '10px 14px',
                marginTop: 16,
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap' as const,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#374151',
                  textTransform: 'uppercase' as const,
                }}
              >
                Token Usage
              </span>
              {tokenUsage.map((entry, i) => {
                const label = entry.id ? `${entry.type}:${entry.id}` : entry.type;
                return (
                  <span key={i} style={{ fontSize: 12, color: '#64748b' }}>
                    {label}{' '}
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      {(entry.inputTokens + entry.outputTokens).toLocaleString()}
                    </span>
                  </span>
                );
              })}
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>
                Total{' '}
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                  {tokenUsage
                    .reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
                    .toLocaleString()}
                </span>
              </span>
            </div>
          )}
        </>
      )}

      {/* Audit Trail */}
      <div>
        <button
          onClick={() => setAuditOpen(o => !o)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            marginTop: 16,
            padding: 0,
          }}
        >
          <span style={{ color: '#64748b', fontSize: 13 }}>
            {auditOpen ? '▼' : '▶'} Audit Trail ({auditLog.length} entries)
          </span>
        </button>
        {auditOpen && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, marginTop: 8 }}>
              <thead>
                <tr>
                  {['Timestamp', 'Action', 'Agent', 'Performed By'].map(h => (
                    <th
                      key={h}
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        textAlign: 'left' as const,
                        padding: '6px 8px',
                        borderBottom: '1px solid #1e2d3d',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...auditLog].reverse().map((entry, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        color: '#94a3b8',
                        fontSize: 12,
                        padding: '6px 8px',
                        borderBottom: '1px solid #0f172a',
                      }}
                    >
                      {entry.timestamp}
                    </td>
                    <td
                      style={{
                        color: actionColorMap[entry.action] || '#94a3b8',
                        fontSize: 12,
                        padding: '6px 8px',
                        borderBottom: '1px solid #0f172a',
                      }}
                    >
                      {entry.action}
                    </td>
                    <td
                      style={{
                        color: '#94a3b8',
                        fontSize: 12,
                        padding: '6px 8px',
                        borderBottom: '1px solid #0f172a',
                      }}
                    >
                      {entry.agentName}
                    </td>
                    <td
                      style={{
                        color: '#94a3b8',
                        fontSize: 12,
                        padding: '6px 8px',
                        borderBottom: '1px solid #0f172a',
                      }}
                    >
                      {entry.performedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={handleExportAudit}
              style={{
                marginTop: 12,
                background: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #1e2d3d',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ⬇ Export Audit JSON
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1e2d3d' }}>
        {phase === 'complete' && (
          <button
            onClick={onRunAgain}
            style={{
              background: '#1e3a5f',
              color: '#3b82f6',
              border: '1px solid #1e4080',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Run Again with Same Counsel
          </button>
        )}
      </div>
    </div>
  );
}

export default CounselResultsPanel;
