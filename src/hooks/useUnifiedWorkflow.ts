import { useReducer, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthHeaders } from '../lib/auth';
import { BUILTIN_AGENTS } from '../data/agentRegistry';
import type {
  UnifiedState,
  UnifiedPhase,
  CounselMember,
  AuditEntry,
  TokenUsageEntry,
  AutoSelectResponse,
  EnhancementResult,
  Clarification,
  RecommendedProfession,
  CustomAgent,
} from '../types/counsel';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_ON_IDS = new Set(['security', 'compliance', 'product', 'qa', 'backend']);

const CATEGORY_RULES = [
  { keywords: ['sql','database','schema','migration','query','table','index','postgres','mysql'], category: 'database' },
  { keywords: ['auth','jwt','token','password','encrypt','xss','injection','owasp','vulnerability','secret','permission','role'], category: 'security' },
  { keywords: ['deploy','ci','cd','pipeline','docker','kubernetes','infra','terraform','nginx','env'], category: 'devops' },
  { keywords: ['api','endpoint','rest','graphql','webhook','swagger','openapi','route','request','response'], category: 'api' },
  { keywords: ['react','component','css','ui','ux','frontend','html','style','tailwind','accessibility'], category: 'frontend' },
  { keywords: ['audit','compliance','gdpr','soc2','regulation','policy','legal','risk'], category: 'audit' },
  { keywords: ['feature','user story','requirement','product','roadmap','stakeholder','acceptance'], category: 'product' },
  { keywords: ['server','function','service','backend','performance','cache','async','worker'], category: 'backend' },
];

const FALLBACK_AGENTS: CounselMember[] = [
  'security', 'compliance', 'product', 'qa', 'backend',
].map(id => {
  const def = BUILTIN_AGENTS.find(a => a.id === id)!;
  return {
    id: def.id,
    name: def.name,
    expertiseTags: def.expertiseTags,
    confidenceScore: 1.0,
    selectionReason: 'Default reviewer',
    status: 'auto-selected' as const,
    selectionTimestamp: new Date().toISOString(),
    isDefaultOn: true,
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function classifyInput(inputText: string): string {
  const lower = inputText.toLowerCase();
  const scores = CATEGORY_RULES.map(rule => ({
    category: rule.category,
    count: rule.keywords.filter(kw => lower.includes(kw)).length,
  }));
  const maxCount = Math.max(...scores.map(s => s.count));
  if (maxCount >= 2) return scores.find(s => s.count === maxCount)!.category;
  if (maxCount === 1) return scores.find(s => s.count === 1)!.category;
  return 'all';
}

function auditEntry(
  action: AuditEntry['action'],
  agentId: string,
  agentName: string,
  performedBy: AuditEntry['performedBy'],
  algorithmVersion?: string,
): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    action,
    agentId,
    agentName,
    performedBy,
    algorithmVersion,
  };
}

// ─── Authenticated fetch with 401 retry ─────────────────────────────────────

async function authFetch(url: string, body: Record<string, unknown>): Promise<Response> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    // Token may have expired — try refreshing the session once
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      await supabase.auth.signOut();
      throw new Error('SESSION_EXPIRED');
    }
    const retryHeaders = await getAuthHeaders();
    const retry = await fetch(url, {
      method: 'POST',
      headers: retryHeaders,
      body: JSON.stringify(body),
    });
    if (!retry.ok) throw new Error(`Request failed: ${retry.status}`);
    return retry;
  }

  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res;
}

// ─── Initial state ──────────────────────────────────────────────────────────

const INITIAL_STATE: UnifiedState = {
  phase: 'idle',
  originalInput: '',
  enhancedPrompt: '',
  enhancementResult: null,
  followUpQuestions: [],
  clarifications: [],
  enhancementTokenUsage: [],
  selectedMembers: [],
  insufficientCoverage: false,
  algorithmVersion: '',
  selectionTimestamp: null,
  fallbackMode: false,
  agentResults: {},
  orchestratorResult: null,
  reviewTokenUsage: [],
  recommendedProfessions: [],
  generatingProfession: null,
  generatedAgents: [],
  generationTokenUsage: [],
  auditLog: [],
  errorMessage: '',
};

// ─── Reducer actions ────────────────────────────────────────────────────────

type Action =
  | { type: 'START_ENHANCE'; payload: { input: string } }
  | { type: 'ENHANCE_COMPLETE'; payload: {
      result: EnhancementResult;
      tokenUsage: TokenUsageEntry[];
    }}
  | { type: 'SET_CLARIFICATIONS'; payload: { clarifications: Clarification[] } }
  | { type: 'FURTHER_ENHANCE_COMPLETE'; payload: {
      result: EnhancementResult;
      tokenUsage: TokenUsageEntry[];
    }}
  | { type: 'SKIP_TO_REVIEW'; payload: { input: string } }
  | { type: 'SUBMIT_TO_BOARD'; payload: { finalPrompt: string } }
  | { type: 'START_SELECT' }
  | { type: 'SELECT_COMPLETE'; payload: {
      members: CounselMember[];
      insufficientCoverage: boolean;
      algorithmVersion: string;
      selectionTimestamp: string;
      fallbackMode: boolean;
    }}
  | { type: 'CONFIRM_BOARD' }
  | { type: 'REVIEW_COMPLETE'; payload: {
      agentResults: Record<string, Record<string, unknown>>;
      orchestratorResult: Record<string, unknown>;
      tokenUsage: TokenUsageEntry[];
      recommendedProfessions: RecommendedProfession[];
    }}
  | { type: 'START_GENERATION'; payload: { profession: string } }
  | { type: 'GENERATION_COMPLETE'; payload: {
      agent: CustomAgent;
      tokenUsage: TokenUsageEntry[];
    }}
  | { type: 'SET_ERROR'; payload: { message: string; phase?: UnifiedPhase } }
  | { type: 'HARD_RESET' };

function reducer(state: UnifiedState, action: Action): UnifiedState {
  switch (action.type) {
    case 'START_ENHANCE':
      return {
        ...state,
        phase: 'enhancing',
        originalInput: action.payload.input,
        enhancedPrompt: '',
        enhancementResult: null,
        followUpQuestions: [],
        clarifications: [],
        enhancementTokenUsage: [],
        errorMessage: '',
        auditLog: [
          ...state.auditLog,
          auditEntry('enhancement-started', '', '', 'system'),
        ],
      };

    case 'ENHANCE_COMPLETE': {
      const { result, tokenUsage } = action.payload;
      const hasQuestions = result.follow_up_questions.length > 0;
      return {
        ...state,
        phase: result.enhancement_status === 'blocked' ? 'error' : (hasQuestions ? 'clarifying' : 'enhanced'),
        enhancementResult: result,
        enhancedPrompt: result.refined_prompt,
        followUpQuestions: result.follow_up_questions,
        enhancementTokenUsage: tokenUsage,
        errorMessage: result.enhancement_status === 'blocked'
          ? `Enhancement blocked: ${result.security_flags.join(', ')}`
          : '',
        auditLog: [
          ...state.auditLog,
          auditEntry('enhancement-complete', '', result.enhancement_status, 'system'),
        ],
      };
    }

    case 'SET_CLARIFICATIONS':
      return {
        ...state,
        phase: 'enhancing',
        clarifications: action.payload.clarifications,
      };

    case 'FURTHER_ENHANCE_COMPLETE': {
      const { result, tokenUsage } = action.payload;
      return {
        ...state,
        phase: 'enhanced',
        enhancementResult: result,
        enhancedPrompt: result.refined_prompt,
        followUpQuestions: [],
        enhancementTokenUsage: [...state.enhancementTokenUsage, ...tokenUsage],
        auditLog: [
          ...state.auditLog,
          auditEntry('enhancement-complete', '', 'further', 'system'),
        ],
      };
    }

    case 'SKIP_TO_REVIEW':
      return {
        ...state,
        phase: 'selecting',
        originalInput: action.payload.input,
        enhancedPrompt: action.payload.input,
      };

    case 'SUBMIT_TO_BOARD':
      return {
        ...state,
        phase: 'selecting',
        enhancedPrompt: action.payload.finalPrompt,
      };

    case 'START_SELECT':
      return {
        ...state,
        phase: 'selecting',
        selectedMembers: [],
        insufficientCoverage: false,
      };

    case 'SELECT_COMPLETE': {
      const { members, insufficientCoverage, algorithmVersion, selectionTimestamp, fallbackMode } = action.payload;
      const selectAudit: AuditEntry[] = members.map(m =>
        auditEntry('auto-selected', m.id, m.name, 'system', algorithmVersion)
      );
      return {
        ...state,
        phase: 'board_preview',
        selectedMembers: members,
        insufficientCoverage,
        algorithmVersion,
        selectionTimestamp,
        fallbackMode,
        auditLog: [...state.auditLog, ...selectAudit],
      };
    }

    case 'CONFIRM_BOARD': {
      const confirmAudit: AuditEntry[] = state.selectedMembers.map(m =>
        auditEntry('board-confirmed', m.id, m.name, 'user')
      );
      return {
        ...state,
        phase: 'reviewing',
        auditLog: [...state.auditLog, ...confirmAudit],
      };
    }

    case 'REVIEW_COMPLETE': {
      const { agentResults, orchestratorResult, tokenUsage, recommendedProfessions } = action.payload;
      return {
        ...state,
        phase: 'complete',
        agentResults,
        orchestratorResult,
        reviewTokenUsage: tokenUsage,
        recommendedProfessions,
        auditLog: [
          ...state.auditLog,
          auditEntry('review-complete', '', orchestratorResult.verdict as string ?? '', 'system'),
        ],
      };
    }

    case 'START_GENERATION':
      return {
        ...state,
        phase: 'generating',
        generatingProfession: action.payload.profession,
      };

    case 'GENERATION_COMPLETE': {
      const { agent, tokenUsage } = action.payload;
      return {
        ...state,
        phase: 'complete',
        generatingProfession: null,
        generatedAgents: [...state.generatedAgents, agent],
        generationTokenUsage: [...state.generationTokenUsage, ...tokenUsage],
        auditLog: [
          ...state.auditLog,
          auditEntry('agent-generated', agent.id, agent.name, 'system'),
        ],
      };
    }

    case 'SET_ERROR':
      return {
        ...state,
        phase: action.payload.phase ?? 'error',
        errorMessage: action.payload.message,
      };

    case 'HARD_RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useUnifiedWorkflow(customAgents: CustomAgent[] = []) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Persist audit log to localStorage (last 500 entries)
  useEffect(() => {
    if (state.auditLog.length === 0) return;
    const trimmed = state.auditLog.slice(-500);
    localStorage.setItem('counsel-audit-log', JSON.stringify(trimmed));
  }, [state.auditLog]);

  // ── Enhancement ─────────────────────────────────────────────────────────

  const enhance = useCallback(async (input: string): Promise<void> => {
    dispatch({ type: 'START_ENHANCE', payload: { input } });
    try {
      const res = await authFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-enhance`,
        { input, stage: 'initial', source_app: 'unified-workflow' },
      );
      const data = await res.json();
      dispatch({
        type: 'ENHANCE_COMPLETE',
        payload: {
          result: data.enhancementResult as EnhancementResult,
          tokenUsage: data.tokenUsage as TokenUsageEntry[],
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: { message: err instanceof Error ? err.message : 'Enhancement failed' },
      });
    }
  }, []);

  const submitClarifications = useCallback(async (clarifications: Clarification[]): Promise<void> => {
    dispatch({ type: 'SET_CLARIFICATIONS', payload: { clarifications } });
    try {
      const res = await authFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-enhance`,
        { input: state.originalInput, stage: 'further', clarifications, source_app: 'unified-workflow' },
      );
      const data = await res.json();
      dispatch({
        type: 'FURTHER_ENHANCE_COMPLETE',
        payload: {
          result: data.enhancementResult as EnhancementResult,
          tokenUsage: data.tokenUsage as TokenUsageEntry[],
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: { message: err instanceof Error ? err.message : 'Further enhancement failed' },
      });
    }
  }, [state.originalInput]);

  // ── Board selection ─────────────────────────────────────────────────────

  const selectBoard = useCallback(async (promptText: string): Promise<void> => {
    const inputCategory = classifyInput(promptText);
    const complexityScore = Math.min(10, Math.max(1, Math.round(promptText.length / 100)));

    // Build custom_agents payload for the Edge Function
    const customPayload = customAgents
      .filter(a => a.active)
      .map(a => ({ id: a.id, name: a.name, tags: a.expertiseTags }));

    try {
      const res = await authFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/counsel-auto-select`,
        {
          case_context: promptText,
          input_category: inputCategory,
          complexity_score: complexityScore,
          excluded_agents: [],
          custom_agents: customPayload.length > 0 ? customPayload : undefined,
          source_app: 'unified-workflow',
        },
      );

      const data: AutoSelectResponse = await res.json();

      const members: CounselMember[] = data.selected_agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        expertiseTags: agent.expertise_tags,
        confidenceScore: agent.confidence_score,
        selectionReason: agent.selection_reason,
        status: 'auto-selected' as const,
        selectionTimestamp: data.selection_timestamp,
        isDefaultOn: DEFAULT_ON_IDS.has(agent.id),
        isCustom: !BUILTIN_AGENTS.some(b => b.id === agent.id),
      }));

      const insufficientCoverage = data.coverage_assessment
        ? !data.coverage_assessment.threshold_met
        : data.insufficient_pool;

      dispatch({
        type: 'SELECT_COMPLETE',
        payload: {
          members,
          insufficientCoverage,
          algorithmVersion: data.algorithm_version,
          selectionTimestamp: data.selection_timestamp,
          fallbackMode: false,
        },
      });
    } catch (err) {
      console.error('Auto-select failed, using fallback agents:', err);
      dispatch({
        type: 'SELECT_COMPLETE',
        payload: {
          members: FALLBACK_AGENTS.map(m => ({
            ...m,
            selectionTimestamp: new Date().toISOString(),
          })),
          insufficientCoverage: false,
          algorithmVersion: 'fallback-v1',
          selectionTimestamp: new Date().toISOString(),
          fallbackMode: true,
        },
      });
    }
  }, [customAgents]);

  // Auto-trigger board selection when entering 'selecting' phase
  useEffect(() => {
    if (state.phase === 'selecting' && state.enhancedPrompt) {
      selectBoard(state.enhancedPrompt);
    }
  }, [state.phase, state.enhancedPrompt, selectBoard]);

  // ── Review ──────────────────────────────────────────────────────────────

  const confirmBoard = useCallback((): void => {
    dispatch({ type: 'CONFIRM_BOARD' });
  }, []);

  const runReview = useCallback(async (): Promise<void> => {
    const agentIds = state.selectedMembers.map(m => m.id);
    const promptText = state.enhancedPrompt;

    // Build custom_agents payload for agents not in built-in registry
    const customPayload = customAgents
      .filter(a => agentIds.includes(a.id))
      .map(a => ({ id: a.id, name: a.name, system_prompt: a.systemPrompt }));

    try {
      const res = await authFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/multi-agent-review`,
        {
          input: promptText,
          agents: agentIds,
          custom_agents: customPayload.length > 0 ? customPayload : undefined,
          coverage_insufficient: state.insufficientCoverage,
          source_app: 'unified-workflow',
        },
      );

      const data = await res.json();
      const orchResult = data.orchestratorResult as Record<string, unknown>;
      const recommendedProfessions: RecommendedProfession[] =
        (orchResult.recommended_professions as RecommendedProfession[]) ?? [];

      dispatch({
        type: 'REVIEW_COMPLETE',
        payload: {
          agentResults: data.agentResults,
          orchestratorResult: orchResult,
          tokenUsage: data.tokenUsage as TokenUsageEntry[],
          recommendedProfessions,
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: { message: err instanceof Error ? err.message : 'Review failed' },
      });
    }
  }, [state.selectedMembers, state.enhancedPrompt, state.insufficientCoverage, customAgents]);

  // Auto-trigger review when entering 'reviewing' phase
  useEffect(() => {
    if (state.phase === 'reviewing' && Object.keys(state.agentResults).length === 0) {
      runReview();
    }
  }, [state.phase, state.agentResults, runReview]);

  // ── Agent generation ────────────────────────────────────────────────────

  const generateAgent = useCallback(async (profession: RecommendedProfession): Promise<void> => {
    dispatch({ type: 'START_GENERATION', payload: { profession: profession.title } });
    try {
      const existingIds = [
        ...BUILTIN_AGENTS.map(a => a.id),
        ...customAgents.map(a => a.id),
      ];
      const res = await authFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-agent`,
        {
          profession_title: profession.title,
          rationale: profession.rationale,
          suggested_tags: profession.suggestedExpertiseTags,
          existing_agent_ids: existingIds,
          source_app: 'unified-workflow',
        },
      );

      const data = await res.json();
      const agentDef = data.agent_def as CustomAgent;

      dispatch({
        type: 'GENERATION_COMPLETE',
        payload: {
          agent: agentDef,
          tokenUsage: data.tokenUsage as TokenUsageEntry[],
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: {
          message: err instanceof Error ? err.message : 'Agent generation failed',
          phase: 'complete', // Return to results screen on generation error
        },
      });
    }
  }, [customAgents]);

  // ── Simple dispatchers ──────────────────────────────────────────────────

  const skipToReview = useCallback((input: string): void => {
    dispatch({ type: 'SKIP_TO_REVIEW', payload: { input } });
  }, []);

  const submitToBoard = useCallback((finalPrompt: string): void => {
    dispatch({ type: 'SUBMIT_TO_BOARD', payload: { finalPrompt } });
  }, []);

  const reset = useCallback((): void => {
    dispatch({ type: 'HARD_RESET' });
  }, []);

  const setError = useCallback((message: string): void => {
    dispatch({ type: 'SET_ERROR', payload: { message } });
  }, []);

  return {
    state,
    enhance,
    submitClarifications,
    skipToReview,
    submitToBoard,
    confirmBoard,
    generateAgent,
    reset,
    setError,
  };
}
