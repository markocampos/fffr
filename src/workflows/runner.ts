import type {
  BotId,
  ClientUpdateDraft,
  ContentPlatform,
  ContentVariantDraft,
  ExternalActionPreview,
  LeadCandidate,
  MeetingTurn,
  ProjectMilestone,
  ProjectRecord,
  ProjectTask,
  RunnerMode,
  SimulatedActionLog,
  StrategyExperimentDraft,
} from '../types/workspace';

/* --------------------------- Per-Role I/O Types -------------------------- */

export interface LeadFinderInput {
  industry: string;
  location: string;
  targetClient: string;
  service: string;
}

export interface LeadFinderOutput {
  leads: LeadCandidate[];
  querySummary: string;
}

export interface BusinessStrategistInput {
  niche: string;
  serviceIdea: string;
  workspaceContext?: string;
  targetConstraint?: string;
  sourceLeadNames?: string[];
  revisionNote?: string;
}

export interface BusinessStrategistOutput {
  experiment: StrategyExperimentDraft;
}

export interface ProjectPlanInput {
  mode: 'create-plan';
  strategyId?: string;
  clientName: string;
  projectTitle: string;
  goal: string;
  deliverables: string[];
  timeline: string;
  includeHandoffMilestone?: boolean;
  revisionNote?: string;
}

export interface ClientUpdateInput {
  mode: 'client-update';
  project: ProjectRecord;
}

export type ProjectTrackerInput = ProjectPlanInput | ClientUpdateInput;

export interface ProjectPlanOutput {
  mode: 'create-plan';
  summary: string;
  milestones: ProjectMilestone[];
  tasks: ProjectTask[];
}

export interface ClientUpdateOutput {
  mode: 'client-update';
  update: ClientUpdateDraft;
}

export type ProjectTrackerOutput = ProjectPlanOutput | ClientUpdateOutput;

export interface ContentCreatorInput {
  platform: ContentPlatform;
  topic: string;
  offer: string;
  tone: string;
  cta: string;
  revisionNote?: string;
}

export interface ContentCreatorOutput {
  drafts: ContentVariantDraft[];
}

export interface MeetingBriefInput {
  assignmentId: string;
  title: string;
  industry: string;
  location: string;
  service: string;
  attendees: BotId[];
  leadNames: string[];
  includePromoPost: boolean;
}

export interface MeetingBriefOutput {
  title: string;
  turns: MeetingTurn[];
  whiteboardLines: string[];
  decisions: string[];
  nextSteps: Array<{ botId: BotId; task: string }>;
  recommendedDeliverables: string[];
  recommendedBudget: string;
  recommendedTimeline: string;
}

export interface ApprovedActionInput {
  reviewItemId: string;
  action: ExternalActionPreview;
}

export interface ApprovedActionOutput {
  log: SimulatedActionLog;
}

export interface WorkflowInputMap {
  'lead-finder': LeadFinderInput;
  'business-strategist': BusinessStrategistInput;
  'project-tracker': ProjectTrackerInput;
  'content-creator': ContentCreatorInput;
}

export interface WorkflowOutputMap {
  'lead-finder': LeadFinderOutput;
  'business-strategist': BusinessStrategistOutput;
  'project-tracker': ProjectTrackerOutput;
  'content-creator': ContentCreatorOutput;
}

/* --------------------- Request / Result / Error Shapes ------------------- */

export interface WorkflowRequest<TBot extends BotId = BotId> {
  runId: string;
  botId: TBot;
  input: WorkflowInputMap[TBot];
  requestedAt: string;
}

export interface WorkflowResult<TOutput> {
  ok: true;
  runId: string;
  botId: BotId;
  mode: RunnerMode;
  durationMs: number;
  summary: string;
  output: TOutput;
}

export type WorkflowErrorCode =
  | 'VALIDATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED';

export interface WorkflowError {
  ok: false;
  runId: string;
  botId: BotId;
  mode: RunnerMode;
  code: WorkflowErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
}

export type WorkflowResponse<TOutput> =
  | WorkflowResult<TOutput>
  | WorkflowError;

/**
 * Typed WorkflowRunner boundary.
 * LocalSimulationRunner implements this in the browser today; a server-side n8n runner
 * on OCI can swap into this exact contract without changing UI or 3D scene code.
 */
export interface WorkflowRunner {
  readonly mode: RunnerMode;
  readonly label: string;
  run<TBot extends BotId>(
    botId: TBot,
    input: WorkflowInputMap[TBot]
  ): Promise<WorkflowResponse<WorkflowOutputMap[TBot]>>;

  runMeetingBrief(
    input: MeetingBriefInput
  ): Promise<WorkflowResponse<MeetingBriefOutput>>;

  executeApprovedAction(
    input: ApprovedActionInput
  ): Promise<WorkflowResponse<ApprovedActionOutput>>;
}
