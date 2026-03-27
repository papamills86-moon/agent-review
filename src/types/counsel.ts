// ─── Shared primitives ──────────────────────────────────────────────────────

export type ReviewerStatus = 'auto-selected' | 'manually-added' | 'manually-removed';

export interface CounselMember {
  id: string;
  name: string;
  expertiseTags: string[];
  confidenceScore: number;
  selectionReason: string;
  status: ReviewerStatus;
  selectionTimestamp: string;
  isDefaultOn: boolean;
  isCustom?: boolean;
}

export interface AuditEntry {
  timestamp: string;
  action: 'auto-selected' | 'manually-added' | 'manually-removed' | 'confirmed'
    | 'enhancement-started' | 'enhancement-complete' | 'board-confirmed'
    | 'review-complete' | 'agent-generated' | 'agent-saved';
  agentId: string;
  agentName: string;
  performedBy: 'system' | 'user';
  algorithmVersion?: string;
}

export interface TokenUsageEntry {
  type: 'compress' | 'agent' | 'orch' | 'orchestrator' | 'generation';
  id?: string;
  inputTokens: number;
  outputTokens: number;
}

// ─── Auto-select request/response ───────────────────────────────────────────

export interface AutoSelectRequest {
  case_context: string;
  input_category: string;
  complexity_score: number;
  excluded_agents: string[];
  custom_agents?: Array<{ id: string; name: string; tags: string[] }>;
}

export interface CoverageAssessment {
  high_confidence_count: number;
  threshold_met: boolean;
}

export interface AutoSelectResponse {
  selected_agents: Array<{
    id: string;
    name: string;
    expertise_tags: string[];
    confidence_score: number;
    selection_reason: string;
  }>;
  seventh_slot_eligible: boolean;
  seventh_slot_reason: string;
  insufficient_pool: boolean;
  algorithm_version: string;
  selection_timestamp: string;
  coverage_assessment?: CoverageAssessment;
}

// ─── Enhancement types ──────────────────────────────────────────────────────

export interface EnhancementResult {
  enhancement_status: 'enhanced' | 'partial' | 'blocked';
  refined_prompt: string;
  follow_up_questions: string[];
  changes_made: string[];
  security_flags: string[];
  overall_security_level: 'clean' | 'caution' | 'blocked';
  inferred_intent: string;
}

export interface Clarification {
  question: string;
  answer: string;
}

// ─── Gap detection + pool expansion ─────────────────────────────────────────

export interface RecommendedProfession {
  title: string;
  rationale: string;
  suggestedExpertiseTags: string[];
}

export interface CustomAgent {
  id: string;
  name: string;
  abbr: string;
  group: string;
  accentColor: string;
  bgColor: string;
  expertiseTags: string[];
  systemPrompt: string;
  createdBy: string;
  createdAt: string;
  active: boolean;
}

// ─── Unified workflow state ─────────────────────────────────────────────────

export type UnifiedPhase =
  | 'idle'           // User enters prompt
  | 'enhancing'      // prompt-enhance in flight (initial stage)
  | 'clarifying'     // Follow-up questions shown, user answering
  | 'enhanced'       // Final enhanced prompt ready for review
  | 'selecting'      // counsel-auto-select in flight
  | 'board_preview'  // Read-only board shown, user confirms
  | 'reviewing'      // multi-agent-review in flight
  | 'complete'       // Results shown (may include gap recommendations)
  | 'generating'     // AI generating new agent definitions
  | 'error';

export interface UnifiedState {
  phase: UnifiedPhase;

  // Enhancement (Steps 1-2)
  originalInput: string;
  enhancedPrompt: string;
  enhancementResult: EnhancementResult | null;
  followUpQuestions: string[];
  clarifications: Clarification[];
  enhancementTokenUsage: TokenUsageEntry[];

  // Board selection (Step 3)
  selectedMembers: CounselMember[];
  insufficientCoverage: boolean;
  algorithmVersion: string;
  selectionTimestamp: string | null;
  fallbackMode: boolean;

  // Review (Step 4)
  agentResults: Record<string, Record<string, unknown>>;
  orchestratorResult: Record<string, unknown> | null;
  reviewTokenUsage: TokenUsageEntry[];
  recommendedProfessions: RecommendedProfession[];

  // Agent generation (Step 5)
  generatingProfession: string | null;
  generatedAgents: CustomAgent[];
  generationTokenUsage: TokenUsageEntry[];

  // Cross-cutting
  auditLog: AuditEntry[];
  errorMessage: string;
}

// ─── Legacy types (kept for backward compat during migration) ───────────────

export interface SeventhSlotStatus {
  eligible: boolean;
  reason: string;
}

export interface CounselState {
  phase: 'idle' | 'selecting' | 'selection_review' | 'reviewing' | 'complete';
  selectedMembers: CounselMember[];
  seventhSlotStatus: SeventhSlotStatus;
  insufficientPool: boolean;
  algorithmVersion: string;
  auditLog: AuditEntry[];
  selectionTimestamp: string | null;
  reviewStartTimestamp: string | null;
  fallbackMode: boolean;
}
