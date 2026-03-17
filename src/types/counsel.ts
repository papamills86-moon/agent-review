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
}

export interface SeventhSlotStatus {
  eligible: boolean;
  reason: string;
}

export interface AuditEntry {
  timestamp: string;
  action: 'auto-selected' | 'manually-added' | 'manually-removed' | 'confirmed';
  agentId: string;
  agentName: string;
  performedBy: 'system' | 'user';
  algorithmVersion?: string;
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

export interface AutoSelectRequest {
  case_context: string;
  input_category: string;
  complexity_score: number;
  excluded_agents: string[];
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
}
