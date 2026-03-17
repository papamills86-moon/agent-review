import { useReducer, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type {
  CounselState,
  CounselMember,
  AuditEntry,
  SeventhSlotStatus,
  AutoSelectResponse,
} from '../types/counsel';

const INITIAL_STATE: CounselState = {
  phase: 'idle',
  selectedMembers: [],
  seventhSlotStatus: { eligible: false, reason: '' },
  insufficientPool: false,
  algorithmVersion: '',
  auditLog: [],
  selectionTimestamp: null,
  reviewStartTimestamp: null,
  fallbackMode: false,
};

const FALLBACK_AGENTS = [
  { id: 'security', name: 'Security Architect', tags: ["security","auth","vulnerabilities","encryption","OWASP"], isDefaultOn: true },
  { id: 'compliance', name: 'Compliance Officer', tags: ["compliance","regulatory","GDPR","SOC2","audit"], isDefaultOn: true },
  { id: 'product', name: 'Product Manager', tags: ["product","requirements","user-stories","prioritization"], isDefaultOn: true },
  { id: 'qa', name: 'QA Lead', tags: ["testing","quality","edge-cases","regression","coverage"], isDefaultOn: true },
  { id: 'backend', name: 'Backend Engineer', tags: ["backend","architecture","performance","scalability"], isDefaultOn: true },
];

const DEFAULT_ON_IDS = new Set(['security', 'compliance', 'product', 'qa', 'backend']);

const AGENT_NAME_MAP: Record<string, { name: string; tags: string[] }> = {
  security: { name: 'Security Architect', tags: ["security","auth","vulnerabilities","encryption","OWASP"] },
  compliance: { name: 'Compliance Officer', tags: ["compliance","regulatory","GDPR","SOC2","audit"] },
  product: { name: 'Product Manager', tags: ["product","requirements","user-stories","prioritization"] },
  qa: { name: 'QA Lead', tags: ["testing","quality","edge-cases","regression","coverage"] },
  backend: { name: 'Backend Engineer', tags: ["backend","architecture","performance","scalability"] },
  frontend: { name: 'Frontend Engineer', tags: ["frontend","React","UI/UX","accessibility","TypeScript"] },
  db: { name: 'Database Architect', tags: ["database","schema","queries","optimization","migrations"] },
  devops: { name: 'DevOps Engineer', tags: ["devops","CI/CD","deployment","infrastructure","monitoring"] },
  api: { name: 'API Designer', tags: ["REST","GraphQL","contracts","versioning","integration"] },
  googleplay: { name: 'Google Play Policy', tags: ["google-play","app-store","policy","mobile","compliance"] },
};

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

// --- Reducer types ---

type CounselAction =
  | { type: 'INIT_SELECTION' }
  | {
      type: 'SET_MEMBERS';
      payload: {
        members: CounselMember[];
        seventhSlotStatus: SeventhSlotStatus;
        insufficientPool: boolean;
        algorithmVersion: string;
        selectionTimestamp: string;
        fallbackMode: boolean;
      };
    }
  | { type: 'ADD_MEMBER'; payload: { member: CounselMember } }
  | { type: 'REMOVE_MEMBER'; payload: { agentId: string } }
  | { type: 'READD_MEMBER'; payload: { agentId: string } }
  | { type: 'CONFIRM_SELECTION' }
  | { type: 'COMPLETE_REVIEW' }
  | { type: 'RESET_TO_IDLE' }
  | { type: 'RESTART_REVIEW' }
  | { type: 'HARD_RESET' };

function getActiveCount(members: CounselMember[]): number {
  return members.filter(m => m.status !== 'manually-removed').length;
}

function getMaxAllowed(seventhSlotStatus: SeventhSlotStatus): number {
  return seventhSlotStatus.eligible ? 7 : 6;
}

function counselReducer(state: CounselState, action: CounselAction): CounselState {
  switch (action.type) {
    case 'INIT_SELECTION':
      return {
        ...state,
        phase: 'selecting',
        selectedMembers: [],
        auditLog: [],
        selectionTimestamp: null,
        reviewStartTimestamp: null,
        fallbackMode: false,
      };

    case 'SET_MEMBERS': {
      const { members, seventhSlotStatus, insufficientPool, algorithmVersion, selectionTimestamp, fallbackMode } = action.payload;
      const newAuditEntries: AuditEntry[] = members.map(m => ({
        timestamp: new Date().toISOString(),
        action: 'auto-selected' as const,
        agentId: m.id,
        agentName: m.name,
        performedBy: 'system' as const,
        algorithmVersion,
      }));
      return {
        ...state,
        phase: 'selection_review',
        selectedMembers: members,
        seventhSlotStatus,
        insufficientPool,
        algorithmVersion,
        selectionTimestamp,
        fallbackMode,
        auditLog: [...state.auditLog, ...newAuditEntries],
      };
    }

    case 'ADD_MEMBER': {
      const activeCount = getActiveCount(state.selectedMembers);
      const maxAllowed = getMaxAllowed(state.seventhSlotStatus);
      if (activeCount >= maxAllowed) return state;
      const newEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        action: 'manually-added',
        agentId: action.payload.member.id,
        agentName: action.payload.member.name,
        performedBy: 'user',
      };
      return {
        ...state,
        selectedMembers: [...state.selectedMembers, action.payload.member],
        auditLog: [...state.auditLog, newEntry],
      };
    }

    case 'REMOVE_MEMBER': {
      const activeCount = getActiveCount(state.selectedMembers);
      if (activeCount <= 1) return state;
      const newEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        action: 'manually-removed',
        agentId: action.payload.agentId,
        agentName: state.selectedMembers.find(m => m.id === action.payload.agentId)?.name ?? action.payload.agentId,
        performedBy: 'user',
      };
      return {
        ...state,
        selectedMembers: state.selectedMembers.map(m =>
          m.id === action.payload.agentId ? { ...m, status: 'manually-removed' as const } : m
        ),
        auditLog: [...state.auditLog, newEntry],
      };
    }

    case 'READD_MEMBER': {
      const activeCount = getActiveCount(state.selectedMembers);
      const maxAllowed = getMaxAllowed(state.seventhSlotStatus);
      if (activeCount >= maxAllowed) return state;
      const member = state.selectedMembers.find(m => m.id === action.payload.agentId);
      const newEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        action: 'manually-added',
        agentId: action.payload.agentId,
        agentName: member?.name ?? action.payload.agentId,
        performedBy: 'user',
      };
      return {
        ...state,
        selectedMembers: state.selectedMembers.map(m =>
          m.id === action.payload.agentId ? { ...m, status: 'manually-added' as const } : m
        ),
        auditLog: [...state.auditLog, newEntry],
      };
    }

    case 'CONFIRM_SELECTION': {
      const activeMembers = state.selectedMembers.filter(m => m.status !== 'manually-removed');
      const confirmEntries: AuditEntry[] = activeMembers.map(m => ({
        timestamp: new Date().toISOString(),
        action: 'confirmed' as const,
        agentId: m.id,
        agentName: m.name,
        performedBy: 'user' as const,
      }));
      return {
        ...state,
        phase: 'reviewing',
        reviewStartTimestamp: new Date().toISOString(),
        auditLog: [...state.auditLog, ...confirmEntries],
      };
    }

    case 'COMPLETE_REVIEW':
      return { ...state, phase: 'complete' };

    case 'RESET_TO_IDLE':
      return { ...state, phase: 'idle' };

    case 'RESTART_REVIEW':
      return {
        ...state,
        phase: 'selection_review',
        reviewStartTimestamp: null,
      };

    case 'HARD_RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// --- Hook ---

export function useCounsel() {
  const [state, dispatch] = useReducer(counselReducer, INITIAL_STATE);

  const callAutoSelect = useCallback(async (inputText: string): Promise<void> => {
    dispatch({ type: 'INIT_SELECTION' });

    const input_category = classifyInput(inputText);
    const complexity_score = Math.min(10, Math.max(1, Math.round(inputText.length / 100)));

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-agent-secret': import.meta.env.VITE_EDGE_FUNCTION_SECRET,
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/counsel-auto-select`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            case_context: inputText,
            input_category,
            complexity_score,
            excluded_agents: [],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Auto-select failed: ${response.status}`);
      }

      const data: AutoSelectResponse = await response.json();

      const members: CounselMember[] = data.selected_agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        expertiseTags: agent.expertise_tags,
        confidenceScore: agent.confidence_score,
        selectionReason: agent.selection_reason,
        status: 'auto-selected' as const,
        selectionTimestamp: data.selection_timestamp,
        isDefaultOn: DEFAULT_ON_IDS.has(agent.id),
      }));

      dispatch({
        type: 'SET_MEMBERS',
        payload: {
          members,
          seventhSlotStatus: {
            eligible: data.seventh_slot_eligible,
            reason: data.seventh_slot_reason,
          },
          insufficientPool: data.insufficient_pool,
          algorithmVersion: data.algorithm_version,
          selectionTimestamp: data.selection_timestamp,
          fallbackMode: false,
        },
      });
    } catch (error) {
      console.error('Auto-select failed, using fallback agents:', error);

      const now = new Date().toISOString();
      const members: CounselMember[] = FALLBACK_AGENTS.map(agent => ({
        id: agent.id,
        name: agent.name,
        expertiseTags: agent.tags,
        confidenceScore: 1.0,
        selectionReason: 'Default reviewer',
        status: 'auto-selected' as const,
        selectionTimestamp: now,
        isDefaultOn: true,
      }));

      dispatch({
        type: 'SET_MEMBERS',
        payload: {
          members,
          seventhSlotStatus: { eligible: false, reason: 'Auto-selection unavailable' },
          insufficientPool: false,
          algorithmVersion: 'fallback-v1',
          selectionTimestamp: now,
          fallbackMode: true,
        },
      });
    }
  }, []);

  const addReviewer = useCallback((agentId: string): void => {
    const agentInfo = AGENT_NAME_MAP[agentId];
    if (!agentInfo) return;

    const member: CounselMember = {
      id: agentId,
      name: agentInfo.name,
      expertiseTags: agentInfo.tags,
      confidenceScore: 1.0,
      selectionReason: 'Manually added by user',
      status: 'manually-added',
      selectionTimestamp: new Date().toISOString(),
      isDefaultOn: DEFAULT_ON_IDS.has(agentId),
    };

    dispatch({ type: 'ADD_MEMBER', payload: { member } });
  }, []);

  const removeReviewer = useCallback((agentId: string): void => {
    dispatch({ type: 'REMOVE_MEMBER', payload: { agentId } });
  }, []);

  const reAddReviewer = useCallback((agentId: string): void => {
    dispatch({ type: 'READD_MEMBER', payload: { agentId } });
  }, []);

  const confirmAndRun = useCallback((): void => {
    dispatch({ type: 'CONFIRM_SELECTION' });
  }, []);

  // Persist audit log to localStorage
  useEffect(() => {
    if (state.auditLog.length === 0) return;
    const trimmed = state.auditLog.slice(-500);
    localStorage.setItem('counsel-audit-log', JSON.stringify(trimmed));
  }, [state.auditLog]);

  return {
    state,
    callAutoSelect,
    addReviewer,
    removeReviewer,
    reAddReviewer,
    confirmAndRun,
    completeReview: () => dispatch({ type: 'COMPLETE_REVIEW' }),
    resetToIdle: () => dispatch({ type: 'RESET_TO_IDLE' }),
    restartReview: () => dispatch({ type: 'RESTART_REVIEW' }),
    hardReset: () => dispatch({ type: 'HARD_RESET' }),
  };
}
