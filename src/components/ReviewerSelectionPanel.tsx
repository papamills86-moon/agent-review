import { useState } from 'react';
import type { CounselMember, SeventhSlotStatus } from '../types/counsel';

interface ReviewerSelectionPanelProps {
  members: CounselMember[];
  allAvailableAgents: Array<{ id: string; name: string; expertiseTags: string[]; isDefaultOn: boolean }>;
  seventhSlotStatus: SeventhSlotStatus;
  insufficientPool: boolean;
  fallbackMode: boolean;
  algorithmVersion: string;
  selectionTimestamp: string;
  onAddReviewer: (agentId: string) => void;
  onRemoveReviewer: (agentId: string) => void;
  onReAddReviewer: (agentId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ReviewerSelectionPanel({
  members,
  allAvailableAgents,
  seventhSlotStatus,
  insufficientPool,
  fallbackMode,
  algorithmVersion,
  selectionTimestamp,
  onAddReviewer,
  onRemoveReviewer,
  onReAddReviewer,
  onConfirm,
  onCancel,
}: ReviewerSelectionPanelProps) {
  const [hoveredPill, setHoveredPill] = useState<string | null>(null);

  const activeMembers = members.filter(m => m.status !== 'manually-removed');
  const maxAllowed = seventhSlotStatus.eligible ? 7 : 6;
  const atCap = activeMembers.length >= maxAllowed;
  const addableAgents = allAvailableAgents.filter(
    a => !members.some(m => m.id === a.id && m.status !== 'manually-removed')
  );

  const formattedTimestamp = new Date(selectionTimestamp).toLocaleString();

  return (
    <div style={{ background: '#0c1221', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Counsel Selected</span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ background: '#1e293b', color: '#64748b', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
            v{algorithmVersion}
          </span>
          <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{formattedTimestamp}</span>
        </div>
      </div>

      {/* Fallback banner */}
      {fallbackMode && (
        <div style={{ background: '#451a03', border: '1px solid #92400e', borderRadius: 8, padding: '10px 14px', marginTop: 16 }}>
          <span style={{ color: '#fbbf24' }}>&#9888; Auto-selection unavailable — default counsel loaded</span>
        </div>
      )}

      {/* Insufficient pool banner */}
      {insufficientPool && (
        <div style={{ background: '#0c1a2e', border: '1px solid #1e40af', borderRadius: 8, padding: '10px 14px', marginTop: 16 }}>
          <span style={{ color: '#93c5fd' }}>&#8505; Limited reviewer pool — fewer than 6 qualified reviewers found</span>
        </div>
      )}

      {/* Reviewer cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 20 }}>
        {members.map(member => {
          const isRemoved = member.status === 'manually-removed';
          const cardStyle: React.CSSProperties = {
            background: '#1e293b',
            borderRadius: 8,
            padding: 16,
            border: '1px solid #1e2d3d',
            ...(isRemoved ? { opacity: 0.5, borderColor: '#374151' } : {}),
          };

          return (
            <div key={member.id} style={cardStyle}>
              {/* Name row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', ...(isRemoved ? { textDecoration: 'line-through' } : {}) }}>
                  {member.name}
                </span>
                {member.status === 'auto-selected' && (
                  <span style={{ background: '#1e3a5f', color: '#3b82f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                    Auto-selected
                  </span>
                )}
                {member.status === 'manually-added' && (
                  <span style={{ background: '#14532d', color: '#22c55e', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                    Added
                  </span>
                )}
                {member.status === 'manually-removed' && (
                  <span style={{ background: '#1f2937', color: '#6b7280', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                    Removed
                  </span>
                )}
              </div>

              {/* Expertise tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {member.expertiseTags.map(tag => (
                  <span key={tag} style={{ background: '#0f172a', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Confidence bar (hidden for manually-added) */}
              {member.status !== 'manually-added' && (
                <div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>Confidence</div>
                  <div style={{ background: '#0f172a', height: 4, borderRadius: 2, marginTop: 4 }}>
                    <div
                      style={{
                        background: '#3b82f6',
                        width: `${member.confidenceScore * 100}%`,
                        height: '100%',
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {Math.round(member.confidenceScore * 100)}%
                  </div>
                </div>
              )}

              {/* Selection reason */}
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                {member.selectionReason}
              </div>

              {/* Action button */}
              <div style={{ marginTop: 12 }}>
                {!isRemoved ? (
                  <button
                    style={{
                      background: 'transparent',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: activeMembers.length <= 1 ? 'not-allowed' : 'pointer',
                      ...(activeMembers.length <= 1 ? { opacity: 0.3 } : {}),
                    }}
                    disabled={activeMembers.length <= 1}
                    onClick={() => onRemoveReviewer(member.id)}
                  >
                    &#10005; Remove
                  </button>
                ) : (
                  <button
                    style={{
                      background: '#14532d',
                      color: '#22c55e',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onClick={() => onReAddReviewer(member.id)}
                  >
                    &#8617; Re-add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Reviewer section */}
      <div style={{ marginTop: 20 }}>
        <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: 13, marginBottom: 8, display: 'block' }}>
          Add Reviewer
        </span>
        {atCap ? (
          <span style={{ color: '#64748b', fontSize: 13 }}>Maximum counsel reached ({maxAllowed})</span>
        ) : addableAgents.length === 0 ? (
          <span style={{ color: '#64748b', fontSize: 13 }}>All available reviewers are already in counsel</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {addableAgents.map(agent => (
              <button
                key={agent.id}
                style={{
                  background: '#0c1221',
                  border: `1px solid ${hoveredPill === agent.id ? '#3b82f6' : '#1e2d3d'}`,
                  borderRadius: 20,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredPill(agent.id)}
                onMouseLeave={() => setHoveredPill(null)}
                onClick={() => onAddReviewer(agent.id)}
              >
                <span style={{ color: '#e2e8f0', fontSize: 13 }}>{agent.name}</span>
                <span style={{ color: '#64748b', fontSize: 11 }}> &middot; {agent.expertiseTags[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 7th Slot callout */}
      {seventhSlotStatus.eligible && activeMembers.length === 6 && (
        <div style={{ background: '#451a03', border: '1px solid #92400e', borderRadius: 8, padding: '12px 16px', marginTop: 16 }}>
          <div style={{ color: '#fbbf24', fontWeight: 600 }}>7th Reviewer Slot Available</div>
          <div style={{ color: '#d97706', fontSize: 13, marginTop: 4 }}>{seventhSlotStatus.reason}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #1e2d3d' }}>
        <span style={{ color: '#64748b', fontSize: 13 }}>
          {activeMembers.length} of {maxAllowed} reviewers selected
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            style={{ background: 'transparent', color: '#64748b', border: '1px solid #374151', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 600,
              cursor: activeMembers.length === 0 ? 'not-allowed' : 'pointer',
              ...(activeMembers.length === 0 ? { opacity: 0.4 } : {}),
            }}
            disabled={activeMembers.length === 0}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewerSelectionPanel;
