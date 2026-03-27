import type { CounselMember } from '../../types/counsel';
import type { AgentDef } from '../../data/agentRegistry';

interface BoardPreviewProps {
  members: CounselMember[];
  allAgents: AgentDef[];
  insufficientCoverage: boolean;
  fallbackMode: boolean;
  algorithmVersion: string;
  isSelecting: boolean;
  onConfirm: () => void;
  onStartOver: () => void;
}

function BoardPreview({
  members,
  allAgents,
  insufficientCoverage,
  fallbackMode,
  algorithmVersion,
  isSelecting,
  onConfirm,
  onStartOver,
}: BoardPreviewProps) {
  if (isSelecting) {
    return (
      <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }}>
          {'· · ·'}
        </div>
        <p style={{ margin: 0, fontSize: 15, color: '#94a3b8' }}>Selecting review board...</p>
        <style>{`@keyframes pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#e2e8f0' }}>
        Review Board
      </h2>

      {/* Banners */}
      {fallbackMode && (
        <div style={{
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 12,
          fontSize: 13,
          color: '#fbbf24',
        }}>
          Auto-selection unavailable &mdash; default board loaded
        </div>
      )}

      {insufficientCoverage && (
        <div style={{
          background: 'rgba(56,189,248,0.08)',
          border: '1px solid rgba(56,189,248,0.25)',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 12,
          fontSize: 13,
          color: '#38bdf8',
        }}>
          Limited expert coverage &mdash; fewer than 4 specialists matched with &gt;70% confidence.
          Gap recommendations will be provided after review.
        </div>
      )}

      {/* Agent cards grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {members.map((member) => {
          const agentDef = allAgents.find((a) => a.id === member.id);
          const accent = agentDef?.accentColor ?? '#94a3b8';
          const bg = agentDef?.bgColor ?? 'rgba(148,163,184,0.07)';
          const abbr = agentDef?.abbr ?? member.id.slice(0, 3).toUpperCase();

          return (
            <div
              key={member.id}
              style={{
                flex: '1 1 calc(33.333% - 8px)',
                minWidth: 220,
                border: `1px solid ${accent}25`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: 6,
                background: bg,
                padding: '14px 18px',
              }}
            >
              {/* Header row: badge + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  fontWeight: 700,
                  color: accent,
                  background: `${accent}18`,
                  borderRadius: 3,
                  padding: '2px 5px',
                  letterSpacing: '0.5px',
                }}>
                  {abbr}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                  {member.name}
                </span>
                {member.isCustom && (
                  <span style={{
                    fontSize: 9,
                    color: '#a78bfa',
                    background: 'rgba(167,139,250,0.12)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontWeight: 600,
                  }}>
                    Custom
                  </span>
                )}
              </div>

              {/* Confidence */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 100,
                  height: 4,
                  borderRadius: 2,
                  background: '#1e293b',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(member.confidenceScore, 100)}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: accent,
                  }} />
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(member.confidenceScore)}%
                </span>
              </div>

              {/* Selection reason */}
              <p style={{ margin: '0 0 8px 0', fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                {member.selectionReason}
              </p>

              {/* Expertise tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {member.expertiseTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 9,
                      color: '#94a3b8',
                      background: 'rgba(148,163,184,0.1)',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span style={{ fontSize: 13, color: '#e2e8f0' }}>
            {members.length} board member{members.length !== 1 ? 's' : ''} selected
          </span>
          <span style={{ fontSize: 10, color: '#475569', marginLeft: 10 }}>
            {algorithmVersion}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onStartOver}
            style={{
              background: 'transparent',
              border: '1px solid #1e293b',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 13,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            &larr; Start Over
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: '#0f2744',
              border: '1px solid #2563eb50',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: '#60a5fa',
              cursor: 'pointer',
            }}
          >
            Start Review
          </button>
        </div>
      </div>
    </div>
  );
}

export default BoardPreview;
