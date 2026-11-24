export type BotId =
  | 'lead-finder'
  | 'business-strategist'
  | 'project-tracker'
  | 'content-creator';

export type BotJobStatus = 'idle' | 'running' | 'ready' | 'failed';

export type BotActivityState =
  | 'at-desk'
  | 'walking'
  | 'discussing'
  | 'working'
  | 'checking-notes'
  | 'lounging'
  | 'on-break'
  | 'waiting';

export type RoomId =
  | 'overview'
  | 'open-work'
  | 'meeting-room'
  | 'content-studio'
  | 'reception'
  | 'kitchen'
  | 'lounge';

export type RunnerMode = 'simulation' | 'live';

export interface BotMeta {
  id: BotId;
  name: string;
  shortTag: string;
  role: string;
  deskLabel: string;
  summary: string;
  deskCoords: [number, number, number];
  accentHex: string;
}

export interface BotJobState {
  status: BotJobStatus;
  lastRunId?: string;
  lastRunAt?: string;
  lastError?: string;
  mode: RunnerMode;
}

export interface LinkedArtifactRef {
  kind: 'lead' | 'strategy' | 'proposal' | 'project' | 'content';
  id: string;
  label: string;
  botId: BotId;
}

export type DeskWorkMode =
  | 'idle'
  | 'researching'
  | 'drafting'
  | 'rereading'
  | 'coordinating'
  | 'reviewing';

export interface DeskScreenLine {
  text: string;
  tone?: 'normal' | 'ok' | 'warn' | 'accent';
}

export interface BotLivePresence {
  botId: BotId;
  activity: BotActivityState;
  room: Exclude<RoomId, 'overview'>;
  targetNodeId: string;
  posture?: 'seated' | 'standing';
  /** When listening in a conversation or waiting in queue, smoothly face this coworker's live 3D position. */
  lookAtBotId?: BotId;
  speech?: string;
  statusDetail?: string;
  /** Short, real progress label shown directly in the office overview (e.g. "Checking lead 2 of 3"). */
  taskLabel?: string;
  /** Role-specific seated desk-work animation & monitor display mode. */
  deskWorkMode?: DeskWorkMode;
  /** Live document / checklist content rendered on this coworker's 3D desk display. */
  screenTitle?: string;
  screenLines?: DeskScreenLine[];
  /** True when the coworker has an active assignment and should prioritize work over wandering/resting. */
  hasActionableWork?: boolean;
  /** 1-based queue position when waiting for an occupied colleague/spot. */
  queuePosition?: number;
  /** Colleague or spot ID this coworker is currently queued for. */
  waitingForResourceId?: string;
  /** Live or most recent conversation ID tied to this speech bubble / movement. */
  activeMeetingId?: string;
  /** Exact workspace record this coworker is currently reviewing or working on. */
  activeArtifact?: LinkedArtifactRef;
}

/* ------------------------------ Lead Finder ------------------------------ */

export interface LeadCandidate {
  id: string;
  businessName: string;
  industry: string;
  location: string;
  targetClient: string;
  serviceOffered: string;
  observedProblem: string;
  suggestedOffer: string;
  outreachAngle: string;
  outreachDraft: string;
  sampleInquiryFlow?: string;
  sourceUrl?: string;
  sourceVerified?: boolean;
  tags?: string[];
}

export interface LeadRecord extends LeadCandidate {
  savedAt: string;
  status: 'saved' | 'evaluated';
  focusId?: string;
  sourceMeetingId?: string;
  assignmentId?: string;
  teamLeadReviewStatus?: 'pending' | 'revision-requested' | 'approved';
  revisionNote?: string;
  isDemo?: boolean;
}

/* -------------------------- Business Strategist -------------------------- */

export interface StrategyExperimentDraft {
  title: string;
  niche: string;
  serviceIdea: string;
  hypothesis: string;
  evidenceFromWorkspace: string[];
  experimentPlan: string[];
  successMetric: string;
  estimatedPriceRange: string;
  deliveryConstraint: string;
  nextStepOwner: BotId;
  nextStepAction: string;
}

export interface StrategyExperimentRecord extends StrategyExperimentDraft {
  id: string;
  createdAt: string;
  status: 'hypothesis' | 'testing' | 'validated';
  sourceLeadIds?: string[];
  projectId?: string;
  focusId?: string;
  sourceMeetingId?: string;
  isDemo?: boolean;
}

/* ----------------------- Historical Proposal Records --------------------- */

export interface ProposalMilestone {
  id: string;
  phase: string;
  deliverable: string;
  targetWeek: string;
}

export interface ProposalPricingItem {
  id: string;
  item: string;
  amount: string;
}

export interface ProposalDraft {
  clientName: string;
  leadId?: string;
  projectGoal: string;
  deliverables: string[];
  budget: string;
  timeline: string;
  scope: string;
  milestones: ProposalMilestone[];
  exclusions: string[];
  pricing: ProposalPricingItem[];
  nextSteps: string;
}

export interface ProposalRecord extends ProposalDraft {
  id: string;
  createdAt: string;
  status: 'draft' | 'approved' | 'converted';
  projectId?: string;
  isDemo?: boolean;
  isHistorical?: boolean;
}

/* ---------------------------- Project Tracker ---------------------------- */

export type ProjectTaskStatus = 'todo' | 'in-progress' | 'done';

export interface ProjectMilestone {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
}

export interface ProjectTask {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  status: ProjectTaskStatus;
  blocked: boolean;
  blockerNote: string;
  focusId?: string;
}

export interface ClientUpdateDraft {
  id: string;
  generatedAt: string;
  subject: string;
  body: string;
  mode: RunnerMode;
}

export interface RestoredProjectDecisions {
  sourceSnapshotId: string;
  sessionTitle: string;
  restoredAt: string;
  decisions: string[];
  whiteboardLines: string[];
}

export interface ProjectRecord {
  id: string;
  proposalId?: string;
  strategyId?: string;
  clientName: string;
  title: string;
  summary: string;
  status: 'active' | 'at-risk' | 'completed';
  createdAt: string;
  milestones: ProjectMilestone[];
  tasks: ProjectTask[];
  clientUpdates: ClientUpdateDraft[];
  activeDecisions?: RestoredProjectDecisions;
  isDemo?: boolean;
}

/* ---------------------------- Content Creator ---------------------------- */

export type ContentPlatform =
  | 'LinkedIn'
  | 'X / Thread'
  | 'Email Newsletter'
  | 'Case Study Post';

export interface ContentVariantDraft {
  id: string;
  variantLabel: string;
  hook: string;
  body: string;
  callToAction: string;
}

export interface ContentQueueRecord extends ContentVariantDraft {
  platform: ContentPlatform;
  topic: string;
  offer: string;
  tone: string;
  savedAt: string;
  queueStatus: 'draft' | 'completed' | 'ready-for-review' | 'published-sim';
  focusId?: string;
  sourceMeetingId?: string;
  assignmentId?: string;
  recipientLeadId?: string;
  recipientBusinessName?: string;
  teamLeadReviewStatus?: 'pending' | 'revision-requested' | 'approved';
  deliveryStatus?:
    | 'draft'
    | 'approved-internal'
    | 'awaiting-owner-send'
    | 'sent-sim'
    | 'held';
  isDemo?: boolean;
}

/* ------------------- Collaboration, Conversations & Reviews -------------- */

export type AutomationTier =
  | 'small'
  | 'medium'
  | 'final-deliverable'
  | 'high-impact';

export type HighImpactActionType =
  | 'send-external-message'
  | 'publish-content'
  | 'commit-price-deadline'
  | 'delete-record';

export type ConversationFormat = 'solo' | 'pair' | 'trio' | 'all-hands';

export type ConversationVenue =
  | 'desk-side'
  | 'lounge'
  | 'whiteboard'
  | 'meeting-room';

export interface MeetingTurn {
  id: string;
  speaker: BotId;
  roleTag:
    | 'thought'
    | 'hypothesis'
    | 'idea'
    | 'fact'
    | 'concern'
    | 'experiment'
    | 'decision'
    | 'handoff';
  bubbleText: string;
  fullText: string;
  timestamp: string;
}

export interface MeetingRecord {
  id: string;
  assignmentId?: string;
  title: string;
  startedAt: string;
  status: 'active' | 'concluded';
  format: ConversationFormat;
  venue: ConversationVenue;
  source: 'autonomous' | 'assigned';
  attendees: BotId[];
  turns: MeetingTurn[];
  whiteboardLines: string[];
  decisions: string[];
  nextSteps: Array<{ botId: BotId; task: string }>;
  followUpOwner?: BotId;
  followUpTask?: string;
  candidateName?: string;
  focusId?: string;
  outcomeSummary?: string;
  linkedArtifacts?: LinkedArtifactRef[];
}

export interface WhiteboardSnapshot {
  id: string;
  meetingId?: string;
  sessionTitle: string;
  capturedAt: string;
  format: ConversationFormat;
  venue: ConversationVenue;
  source: 'autonomous' | 'assigned' | 'demo';
  attendees: BotId[];
  whiteboardLines: string[];
  decisions: string[];
  nextSteps: Array<{ botId: BotId; task: string }>;
  projectId?: string;
  projectTitle?: string;
  linkedArtifacts?: LinkedArtifactRef[];
  isDemo?: boolean;
}

export interface AssignmentStep {
  id: string;
  botId: BotId;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'waiting-approval' | 'revised';
  outputSummary?: string;
}

export interface AssignmentRecord {
  id: string;
  prompt: string;
  title: string;
  tier: AutomationTier;
  includePromoPost?: boolean;
  createdAt: string;
  status:
    | 'running'
    | 'completed'
    | 'awaiting-review'
    | 'awaiting-approval'
    | 'revising'
    | 'rejected';
  participants: BotId[];
  steps: AssignmentStep[];
  meetingId?: string;
  linkedArtifacts: LinkedArtifactRef[];
  revisionCount: number;
}

export interface ExternalActionPreview {
  actionType: HighImpactActionType;
  targetLabel: string;
  recipient?: string;
  subject?: string;
  channel?: string;
  priceOrDeadline?: string;
  bodyPreview: string;
  recordId?: string;
}

export interface ReviewDecisionOption {
  id: string;
  label: string;
  description: string;
  action: 'approve-send' | 'save-drafts-only' | 'hold';
}

export interface ReviewItem {
  id: string;
  /** Deterministic key preventing duplicate review items across reloads/re-runs. */
  dedupeKey: string;
  kind: 'final-deliverable' | 'high-impact-action';
  assignmentId?: string;
  title: string;
  summary: string;
  /** Clear question surfaced by Team Lead in the Needs me decision inbox. */
  decisionQuestion?: string;
  /** Explanation of why Team Lead escalated this instead of auto-approving. */
  whyNeeded?: string;
  /** Team Lead's recommended option ID and short display label. */
  recommendedOptionId?: string;
  recommendedLabel?: string;
  /** Structured owner choices (Accept recommendation, alternative option, or hold). */
  options?: ReviewDecisionOption[];
  /** Blocked tasks or drafts grouped together under this single owner decision. */
  groupedTaskLabels?: string[];
  /** Exact content draft IDs governed by a grouped outreach send decision. */
  groupedContentIds?: string[];
  escalationReason?: 'external-authorization' | 'owner-judgment';
  ownerChoiceLabel?: string;
  resolvedBy?: 'owner' | 'team-lead';
  deliverableText?: string;
  decisionSummary?: string[];
  linkedArtifacts: LinkedArtifactRef[];
  proposedAction?: ExternalActionPreview;
  status: 'pending' | 'approved' | 'changes-requested' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  feedbackNote?: string;
  revisionNumber: number;
  mode: RunnerMode;
}

export interface SimulatedActionLog {
  id: string;
  reviewItemId: string;
  actionType: HighImpactActionType;
  targetLabel: string;
  summary: string;
  executedAt: string;
  mode: RunnerMode;
}

/* ----------------------------- Activity Feed ----------------------------- */

export interface ActivityEvent {
  id: string;
  timestamp: string;
  botId: BotId;
  action: string;
  detail: string;
  artifactRef?: LinkedArtifactRef;
  meetingId?: string;
  focusId?: string;
  isDemo?: boolean;
}

/* ----------------------------- Today's Focus ----------------------------- */

export type TodayFocusKind =
  | 'lead-evaluation'
  | 'content-draft'
  | 'strategy-brief'
  | 'project-task';

export interface TodayFocus {
  id: string;
  goal: string;
  targetAudience?: string;
  expectedResult: string;
  targetCount: number;
  workKind: TodayFocusKind;
  requestConsolidatedReview?: boolean;
  createdAt: string;
  status: 'active' | 'completed';
  completedAt?: string;
}

/* --------------------- Authoritative Office Queue Store ------------------ */

export interface SpotReservation {
  id: string;
  resourceId: string;
  botId: BotId;
  assignmentId: string;
  status: 'granted' | 'queued';
  assignedNodeId: string;
  queuePosition: number;
  purpose: string;
  requestedAtMs: number;
  grantedAtMs?: number;
}

export interface ResourceQueue {
  resourceId: string;
  capacity: number;
  active: SpotReservation[];
  waiting: SpotReservation[];
}

export interface PersistedSyncTask {
  id: string;
  botId: BotId;
  targetColleagueId: BotId;
  topic: string;
  artifactSummary: string;
  status: 'queued' | 'in-turn' | 'completed';
  reservationId?: string;
}

export interface PersistedSyncBatch {
  id: string;
  assignmentId: string;
  createdAt: string;
  status: 'active' | 'completed';
  tasks: PersistedSyncTask[];
  independentBotId: BotId;
  independentTaskDone: boolean;
}

export interface OfficeQueueState {
  version: number;
  queues: Record<string, ResourceQueue>;
  /** Idempotent ledger preventing duplicate arrival submissions, approvals, or restarts. */
  completedEventKeys: string[];
  /** Active simultaneous/queued sync batch persisted for clean refresh recovery. */
  activeSyncBatch: PersistedSyncBatch | null;
}

/* ---------------------------- Coffee Breaks ------------------------------ */

export interface BotBreakRecord {
  consecutiveDeskTasks: number;
  onBreak: boolean;
  breakStartedAtMs?: number;
  breakEndsAtMs?: number;
  kitchenSpotId?: string;
  totalBreaksTaken: number;
}

/* ---------------------------- Workspace State ---------------------------- */

export interface WorkspaceState {
  todayFocus: TodayFocus | null;
  leads: LeadRecord[];
  strategyBriefs: StrategyExperimentRecord[];
  /** Preserved historical proposal records (read-only archive). */
  proposals: ProposalRecord[];
  projects: ProjectRecord[];
  contentQueue: ContentQueueRecord[];
  activity: ActivityEvent[];
  botJobs: Record<BotId, BotJobState>;
  assignments: AssignmentRecord[];
  meetings: MeetingRecord[];
  whiteboardHistory: WhiteboardSnapshot[];
  activeWhiteboardSnapshotId?: string | null;
  reviewQueue: ReviewItem[];
  executedActions: SimulatedActionLog[];
  officeQueue?: OfficeQueueState;
  botBreaks?: Record<BotId, BotBreakRecord>;
}
