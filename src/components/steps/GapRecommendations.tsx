import type { RecommendedProfession } from '../../types/counsel';

interface GapRecommendationsProps {
  professions: RecommendedProfession[];
  isGenerating: boolean;
  generatingProfession: string | null;
  generatedAgentIds: string[];
  onGenerate: (profession: RecommendedProfession) => void;
}

function GapRecommendations({
  professions,
  isGenerating,
  generatingProfession,
  generatedAgentIds,
  onGenerate,
}: GapRecommendationsProps) {
  if (!professions.length) return null;

  // Check if an agent with a matching title has already been generated
  const isGenerated = (title: string) =>
    generatedAgentIds.some(
      (id) => id.toLowerCase().replace(/[\s_-]+/g, '') === title.toLowerCase().replace(/[\s_-]+/g, '')
    );

  return (
    <div style={{ borderTop: '2px dashed #6366f1', paddingTop: 20, marginTop: 24 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 16, color: '#a5b4fc' }}>+</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>
          Expand Your Review Board
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.6 }}>
        The following specialist roles would improve coverage for this review topic.
      </p>

      {/* Profession cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {professions.map((prof, idx) => {
          const generated = isGenerated(prof.title);
          const generating = isGenerating && generatingProfession === prof.title;

          return (
            <div
              key={idx}
              style={{
                border: '1px solid #1e293b',
                background: 'rgba(255,255,255,0.02)',
                padding: 14,
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
                  {prof.title}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>
                  {prof.rationale}
                </div>
                {prof.suggestedExpertiseTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {prof.suggestedExpertiseTags.map((tag, ti) => (
                      <span
                        key={ti}
                        style={{
                          fontSize: 9,
                          fontFamily: 'monospace',
                          color: '#6366f1',
                          background: 'rgba(99,102,241,0.1)',
                          border: '1px solid rgba(99,102,241,0.25)',
                          borderRadius: 3,
                          padding: '1px 6px',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action button / status */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {generated ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#4ade80',
                      background: 'rgba(74,222,128,0.1)',
                      border: '1px solid rgba(74,222,128,0.3)',
                      borderRadius: 4,
                      padding: '4px 10px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Added &#x2713;
                  </span>
                ) : generating ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: '#a5b4fc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        border: '2px solid #6366f1',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    Generating...
                  </span>
                ) : (
                  <button
                    onClick={() => onGenerate(prof)}
                    disabled={isGenerating}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isGenerating ? '#475569' : '#a5b4fc',
                      background: isGenerating ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.1)',
                      border: `1px solid ${isGenerating ? '#1e293b' : 'rgba(99,102,241,0.3)'}`,
                      borderRadius: 4,
                      padding: '5px 12px',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Generate &amp; Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Spin keyframe (injected once) */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default GapRecommendations;
