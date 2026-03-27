import { useState, useEffect } from 'react';
import { useUnifiedWorkflow } from '../hooks/useUnifiedWorkflow';
import { mergeAgents } from '../data/agentRegistry';
import { fetchCustomAgents, saveCustomAgent } from '../lib/agentDb';
import type { CustomAgent } from '../types/counsel';

import PromptInput from './steps/PromptInput';
import EnhancementReview from './steps/EnhancementReview';
import FinalPromptReview from './steps/FinalPromptReview';
import BoardPreview from './steps/BoardPreview';
import ReviewResults from './steps/ReviewResults';

// ─── Step progress indicator ────────────────────────────────────────────────

const STEPS = [
  { key: 'enhance', label: 'Enhance' },
  { key: 'clarify', label: 'Clarify' },
  { key: 'finalize', label: 'Finalize' },
  { key: 'board', label: 'Board' },
  { key: 'review', label: 'Review' },
] as const;

function phaseToStepIndex(phase: string): number {
  switch (phase) {
    case 'idle': return -1;
    case 'enhancing': return 0;
    case 'clarifying': return 1;
    case 'enhanced': return 2;
    case 'selecting':
    case 'board_preview': return 3;
    case 'reviewing':
    case 'complete':
    case 'generating': return 4;
    case 'error': return -1;
    default: return -1;
  }
}

function StepProgress({ phase }: { phase: string }) {
  const currentIdx = phaseToStepIndex(phase);
  if (currentIdx < 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0', marginBottom: '24px',
      padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px',
      border: '1px solid #1e293b',
    }}>
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        const color = isActive ? '#818cf8' : isDone ? '#4ade80' : '#334155';
        const textColor = isActive ? '#e2e8f0' : isDone ? '#94a3b8' : '#475569';
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: isDone ? '#4ade8020' : isActive ? '#818cf820' : 'transparent',
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: 700, color,
                transition: 'all 0.3s',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '11px', fontWeight: isActive ? 700 : 500,
                color: textColor, letterSpacing: '0.02em',
                transition: 'all 0.3s',
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: '32px', height: '1px', margin: '0 8px',
                background: isDone ? '#4ade8050' : '#1e293b',
                transition: 'all 0.3s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function UnifiedWorkflow() {
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  const workflow = useUnifiedWorkflow(customAgents);
  const { state } = workflow;

  // Load custom agents from Supabase on mount
  useEffect(() => {
    fetchCustomAgents()
      .then(setCustomAgents)
      .catch(() => setCustomAgents([]))
      .finally(() => setLoadingAgents(false));
  }, []);

  // Reload custom agents after a new one is saved
  const handleSaveAgent = async (agent: CustomAgent) => {
    await saveCustomAgent(agent);
    const refreshed = await fetchCustomAgents();
    setCustomAgents(refreshed);
  };

  const allAgents = mergeAgents(customAgents);

  if (loadingAgents) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
        Loading agent pool...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>
      <StepProgress phase={state.phase} />

      {/* Error state */}
      {state.phase === 'error' && (
        <div style={{
          padding: '16px 20px', marginBottom: '20px',
          background: 'rgba(248,113,113,0.08)', border: '1px solid #f8717140',
          borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#f87171', fontSize: '13px' }}>{state.errorMessage || 'Something went wrong.'}</span>
          <button
            onClick={workflow.reset}
            style={{
              padding: '5px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid #f8717150',
              borderRadius: '4px', color: '#f87171', fontSize: '11px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Start Over
          </button>
        </div>
      )}

      {/* Step 1: Prompt Input */}
      {state.phase === 'idle' && (
        <PromptInput
          onEnhance={workflow.enhance}
          onSkipToReview={workflow.skipToReview}
        />
      )}

      {/* Steps 1-2: Enhancement + Clarification */}
      {(state.phase === 'enhancing' || state.phase === 'clarifying') && (
        <EnhancementReview
          enhancementResult={state.enhancementResult!}
          followUpQuestions={state.followUpQuestions}
          isEnhancing={state.phase === 'enhancing'}
          onSubmitClarifications={workflow.submitClarifications}
          onSkipClarifications={() => workflow.submitToBoard(
            state.enhancedPrompt || state.originalInput
          )}
        />
      )}

      {/* Step 2: Final Prompt Review */}
      {state.phase === 'enhanced' && (
        <FinalPromptReview
          enhancedPrompt={state.enhancedPrompt}
          enhancementResult={state.enhancementResult}
          onSubmitToBoard={workflow.submitToBoard}
          onStartOver={workflow.reset}
        />
      )}

      {/* Step 3: Board Preview */}
      {(state.phase === 'selecting' || state.phase === 'board_preview') && (
        <BoardPreview
          members={state.selectedMembers}
          allAgents={allAgents}
          insufficientCoverage={state.insufficientCoverage}
          fallbackMode={state.fallbackMode}
          algorithmVersion={state.algorithmVersion}
          isSelecting={state.phase === 'selecting'}
          onConfirm={workflow.confirmBoard}
          onStartOver={workflow.reset}
        />
      )}

      {/* Steps 4-5: Review Results + Gap Detection + Generation */}
      {(state.phase === 'reviewing' || state.phase === 'complete' || state.phase === 'generating') && (
        <ReviewResults
          members={state.selectedMembers}
          allAgents={allAgents}
          agentResults={state.agentResults}
          orchestratorResult={state.orchestratorResult}
          reviewTokenUsage={state.reviewTokenUsage}
          enhancementTokenUsage={state.enhancementTokenUsage}
          generationTokenUsage={state.generationTokenUsage}
          recommendedProfessions={state.recommendedProfessions}
          insufficientCoverage={state.insufficientCoverage}
          isReviewing={state.phase === 'reviewing'}
          isGenerating={state.phase === 'generating'}
          generatingProfession={state.generatingProfession}
          onGenerateAgent={workflow.generateAgent}
          onSaveAgent={handleSaveAgent}
          generatedAgents={state.generatedAgents}
          onStartOver={workflow.reset}
        />
      )}
    </div>
  );
}
