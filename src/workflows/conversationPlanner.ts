import type {
  BotId,
  ConversationFormat,
  ConversationVenue,
  LeadCandidate,
  LinkedArtifactRef,
  MeetingTurn,
  RoomId,
  WorkspaceState,
} from '../types/workspace';
import {
  CONTENT_STUDIO_SPOT,
  LOUNGE_HUDDLE_SPOTS,
  MEETING_SPOTS,
  WHITEBOARD_HUDDLE_SPOTS,
} from '../scene/officeLayout';
import {
  getDeskNodeId,
  getDeskVisitorNodeId,
  getMeetingNodeId,
} from '../scene/navigation';

export interface ParticipantPositionPlan {
  botId: BotId;
  targetNodeId: string;
  room: Exclude<RoomId, 'overview'>;
  posture: 'seated' | 'standing';
  walkSpeech?: string;
}

export type ConversationFollowUp =
  | {
      kind: 'save-lead-evaluation';
      owner: 'lead-finder';
      workNodeId: string;
      workRoom: Exclude<RoomId, 'overview'>;
      focusId?: string;
      candidateKey: string;
      candidate: LeadCandidate;
    }
  | {
      kind: 'save-strategy-experiment';
      owner: 'business-strategist';
      workNodeId: string;
      workRoom: Exclude<RoomId, 'overview'>;
      focusId?: string;
      niche: string;
      serviceIdea: string;
      hypothesis: string;
      evidence: string[];
      constraint: string;
      sourceLeadIds?: string[];
    }
  | {
      kind: 'draft-content-post';
      owner: 'content-creator';
      workNodeId: string;
      workRoom: Exclude<RoomId, 'overview'>;
      focusId?: string;
      topic: string;
      offer: string;
      hook: string;
      body: string;
      cta: string;
    }
  | {
      kind: 'add-project-task';
      owner: 'project-tracker';
      workNodeId: string;
      workRoom: Exclude<RoomId, 'overview'>;
      focusId?: string;
      projectId?: string;
      taskTitle: string;
      taskOwner: string;
    }
  | {
      kind: 'tag-and-note-lead';
      owner: 'lead-finder';
      workNodeId: string;
      workRoom: Exclude<RoomId, 'overview'>;
      focusId?: string;
      leadId?: string;
      tag: string;
      noteSummary: string;
    };

export interface PlannedConversation {
  id: string;
  focusId?: string;
  candidateName?: string;
  format: ConversationFormat;
  venue: ConversationVenue;
  title: string;
  attendees: BotId[];
  positions: ParticipantPositionPlan[];
  turns: Omit<MeetingTurn, 'timestamp'>[];
  whiteboardLines: string[];
  decisions: string[];
  nextSteps: Array<{ botId: BotId; task: string }>;
  contextArtifact?: LinkedArtifactRef;
  followUp: ConversationFollowUp;
}

const FORMAT_CYCLE: ConversationFormat[] = ['pair', 'solo', 'trio', 'all-hands'];

export function chooseNextAutonomousFormat(cycleIndex: number): ConversationFormat {
  return FORMAT_CYCLE[cycleIndex % FORMAT_CYCLE.length];
}

function shortLeadName(name: string): string {
  return name.replace(/\s*\(Fictional[^)]*\)/gi, '').trim();
}

/**
 * Pure, deterministic workspace-grounded conversation generator supporting all 4 formats:
 * - solo (1 person thinking aloud while reviewing workspace records)
 * - pair (2 coworkers having a desk-side or lounge conversation)
 * - trio (3 coworkers brainstorming at the live whiteboard)
 * - all-hands (all 4 coworkers meeting in the Glass Meeting Room)
 *
 * Uses live leads, project blockers, content drafts, and strategy notes as context,
 * falling back cleanly to clearly labeled fictional records when the workspace is empty.
 */
export function planWorkspaceConversation(
  state: WorkspaceState,
  format: ConversationFormat,
  seedIndex = 0
): PlannedConversation {
  const leadA = state.leads[0];
  const leadB = state.leads[1];
  const project = state.projects[0];
  const blockedTask = project?.tasks.find((t) => t.blocked);
  const topContent = state.contentQueue[0];

  const leadAName = leadA
    ? shortLeadName(leadA.businessName)
    : 'Suncrest Service Co. (Fictional)';
  const leadBName = leadB
    ? shortLeadName(leadB.businessName)
    : 'Oakridge Clinics (Fictional)';
  const problemA =
    leadA?.observedProblem ||
    'Manual re-keying of incoming quote requests slows down daily dispatch.';
  const problemB =
    leadB?.observedProblem ||
    'Inbound client inquiries sit overnight in a shared inbox without tracking.';
  const blockerText =
    blockedTask?.blockerNote ||
    'Client sandbox credentials and owner walkthrough often delay staging sign-off.';
  const projectTitle = project?.title || 'Intake & Triage Pilot (Fictional)';

  const idSuffix = `${format}-${seedIndex}`;

  /* ----------------------- 1. SOLO THINK-ALOUD (1 PERSON) ------------------ */
  if (format === 'solo') {
    const useWhiteboard = seedIndex % 2 === 1;
    const contextArtifact: LinkedArtifactRef | undefined = leadA
      ? {
          kind: 'lead',
          id: leadA.id,
          label: leadA.businessName,
          botId: 'lead-finder',
        }
      : undefined;

    return {
      id: `conv-${idSuffix}`,
      format: 'solo',
      venue: useWhiteboard ? 'whiteboard' : 'desk-side',
      title: `Pattern Review: ${leadAName} & ${leadBName}`,
      attendees: ['business-strategist'],
      positions: [
        {
          botId: 'business-strategist',
          targetNodeId: useWhiteboard
            ? WHITEBOARD_HUDDLE_SPOTS[1].nodeId
            : getDeskNodeId('business-strategist'),
          room: useWhiteboard ? 'meeting-room' : 'open-work',
          posture: useWhiteboard ? 'standing' : 'seated',
          walkSpeech: useWhiteboard
            ? 'Checking lead patterns at the board...'
            : undefined,
        },
      ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'business-strategist',
          roleTag: 'thought',
          bubbleText: `Both ${leadAName} & ${leadBName} lose leads in manual intake.`,
          fullText: `Reviewing saved lead notes across ${leadAName} and ${leadBName}: one struggles with "${problemA}" and the other with "${problemB}". Both point to the same repeatable service gap.`,
        },
        {
          id: `t-${idSuffix}-2`,
          speaker: 'business-strategist',
          roleTag: 'hypothesis',
          bubbleText: 'Logging a 2-week Intake Triage Sprint hypothesis.',
          fullText: `Hypothesis recorded: packaging a fixed-scope 2-week Branded Intake & Triage Sprint with clear exception queues will close faster than custom open-ended discovery builds. Saving this experiment now.`,
        },
      ],
      whiteboardLines: [
        'SOLO REVIEW · BUSINESS STRATEGIST',
        `PATTERN: ${leadAName} + ${leadBName}`,
        'GAP: Manual inbox & PDF intake delays',
        'HYPOTHESIS: 2-Week Intake Triage Sprint',
      ],
      decisions: [
        `Pattern spotted across ${leadAName} and ${leadBName}: manual inquiry tracking causes response lag.`,
        'Recorded new Strategy Experiment: 2-Week Branded Intake & Triage Sprint.',
      ],
      nextSteps: [
        {
          botId: 'business-strategist',
          task: 'Save intake triage hypothesis & experiment plan in Strategy workspace',
        },
      ],
      contextArtifact,
      followUp: {
        kind: 'save-strategy-experiment',
        owner: 'business-strategist',
        workNodeId: getDeskNodeId('business-strategist'),
        workRoom: 'open-work',
        niche: leadB?.industry || 'Local Service Operators',
        serviceIdea: '2-Week Branded Intake & Triage Sprint',
        hypothesis: `Comparing ${leadAName} and ${leadBName} shows teams lose leads to unmonitored inboxes and manual data re-entry. A focused 2-week intake & exception queue sprint solves both cleanly.`,
        evidence: [
          `${leadAName}: ${problemA}`,
          `${leadBName}: ${problemB}`,
        ],
        constraint: blockerText,
        sourceLeadIds: [leadA?.id, leadB?.id].filter(Boolean) as string[],
      },
    };
  }

  /* ----------------------- 2. TWO-PERSON DESK-SIDE / LOUNGE ---------------- */
  if (format === 'pair') {
    const inLounge = seedIndex % 2 === 1;
    const contextArtifact: LinkedArtifactRef | undefined = leadB
      ? {
          kind: 'lead',
          id: leadB.id,
          label: leadB.businessName,
          botId: 'lead-finder',
        }
      : leadA
        ? {
            kind: 'lead',
            id: leadA.id,
            label: leadA.businessName,
            botId: 'lead-finder',
          }
        : undefined;

    return {
      id: `conv-${idSuffix}`,
      format: 'pair',
      venue: inLounge ? 'lounge' : 'desk-side',
      title: `Inquiry Tracking Angle (${leadBName})`,
      attendees: ['lead-finder', 'content-creator'],
      positions: inLounge
        ? [
            {
              botId: 'content-creator',
              targetNodeId: LOUNGE_HUDDLE_SPOTS[0].nodeId,
              room: 'lounge',
              posture: 'seated',
              walkSpeech: 'Grabbing a quick chat in the lounge...',
            },
            {
              botId: 'lead-finder',
              targetNodeId: LOUNGE_HUDDLE_SPOTS[1].nodeId,
              room: 'lounge',
              posture: 'standing',
              walkSpeech: 'Walking over to share a lead insight...',
            },
          ]
        : [
            {
              botId: 'content-creator',
              targetNodeId: getDeskNodeId('content-creator'),
              room: 'open-work',
              posture: 'seated',
            },
            {
              botId: 'lead-finder',
              targetNodeId: getDeskVisitorNodeId('content-creator'),
              room: 'open-work',
              posture: 'standing',
              walkSpeech: 'Heading to Content desk with a lead pattern...',
            },
          ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'lead-finder',
          roleTag: 'fact',
          bubbleText: `Leads like ${leadBName} lose inquiries in shared inboxes.`,
          fullText: `Quick note from the pipeline: demo leads like ${leadBName} and ${leadAName} both struggle to track incoming inquiries overnight — quotes get buried in inboxes and manual spreadsheets.`,
        },
        {
          id: `t-${idSuffix}-2`,
          speaker: 'content-creator',
          roleTag: 'idea',
          bubbleText: 'Great angle — I can draft a short post on fixing inquiry leaks.',
          fullText: `That is a super concrete pain point for a LinkedIn breakdown. Instead of talking abstractly about automation, I will show how a lightweight inquiry form + triage queue stops leads from going cold overnight.`,
        },
        {
          id: `t-${idSuffix}-3`,
          speaker: 'lead-finder',
          roleTag: 'decision',
          bubbleText: 'Perfect — tie it to our 2-week intake audit offer.',
          fullText: `Agreed. Keep the CTA practical — invite ops leads to ask for our 1-page inquiry tracking checklist. I will keep qualifying similar prospects while you draft it in the studio.`,
        },
      ],
      whiteboardLines: [],
      decisions: [
        `Shared pain point confirmed across ${leadBName} & ${leadAName}: untracked inbound inquiries.`,
        'Content Creator will draft a LinkedIn post addressing inquiry-tracking bottlenecks (saved as draft for review).',
      ],
      nextSteps: [
        {
          botId: 'content-creator',
          task: 'Walk to Content Studio and draft LinkedIn post on inquiry tracking',
        },
      ],
      contextArtifact,
      followUp: {
        kind: 'draft-content-post',
        owner: 'content-creator',
        workNodeId: CONTENT_STUDIO_SPOT.nodeId,
        workRoom: 'content-studio',
        topic: `Why ${leadB?.industry || 'service'} teams lose warm inquiries overnight`,
        offer: '2-Week Branded Inquiry Form & Triage Queue',
        hook: `Most service teams don't have a lead volume problem — they have an overnight inquiry-tracking leak.`,
        body: `Reviewing recent Rhymvex pipeline research (${leadBName} & ${leadAName}), the same bottleneck keeps surfacing: high-intent inquiries sit in shared inboxes and voicemails with no clear owner.\n\nOur fix stays practical:\n1. A branded 60-second inquiry form that captures structured job context.\n2. Instant triage routing so every request gets a clear owner.\n3. Human review before any client outreach goes out.`,
        cta: 'Reply "TRIAGE" for our 1-page inquiry workflow sketch.',
      },
    };
  }

  /* ----------------------- 3. THREE-PERSON WHITEBOARD BRAINSTORM ----------- */
  if (format === 'trio') {
    const contextArtifact: LinkedArtifactRef | undefined = project
      ? {
          kind: 'project',
          id: project.id,
          label: project.title,
          botId: 'project-tracker',
        }
      : undefined;

    return {
      id: `conv-${idSuffix}`,
      format: 'trio',
      venue: 'whiteboard',
      title: `Whiteboard Brainstorm: Faster Staging Handoff`,
      attendees: ['business-strategist', 'project-tracker', 'lead-finder'],
      positions: [
        {
          botId: 'lead-finder',
          targetNodeId: WHITEBOARD_HUDDLE_SPOTS[0].nodeId,
          room: 'meeting-room',
          posture: 'standing',
          walkSpeech: 'Heading to the whiteboard brainstorm...',
        },
        {
          botId: 'business-strategist',
          targetNodeId: WHITEBOARD_HUDDLE_SPOTS[1].nodeId,
          room: 'meeting-room',
          posture: 'standing',
          walkSpeech: 'Mapping an offer experiment at the whiteboard...',
        },
        {
          botId: 'project-tracker',
          targetNodeId: WHITEBOARD_HUDDLE_SPOTS[2].nodeId,
          room: 'meeting-room',
          posture: 'standing',
          walkSpeech: 'Bringing delivery constraints to the board...',
        },
      ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'business-strategist',
          roleTag: 'idea',
          bubbleText: 'Offer angle: guarantee a clickable prototype in Week 1.',
          fullText: `At the board: if we promise a working intake prototype by Day 5 for ${leadA?.industry || 'local service'} prospects, buyers see real value before touching legacy systems.`,
        },
        {
          id: `t-${idSuffix}-2`,
          speaker: 'project-tracker',
          roleTag: 'concern',
          bubbleText: `Constraint: "${projectTitle}" stalled waiting on client API tokens.`,
          fullText: `Delivery constraint from ${projectTitle}: "${blockerText}". A Week 1 prototype only works if we decouple it from client IT credential rotation using mock webhook fixtures first.`,
        },
        {
          id: `t-${idSuffix}-3`,
          speaker: 'lead-finder',
          roleTag: 'experiment',
          bubbleText: 'Small experiment: pre-send a Day-0 credential checklist.',
          fullText: `Let's run a small low-risk experiment: attach a 3-item Day-0 sandbox checklist during kickoff and add a mock-fixture task to ${projectTitle} so staging work never blocks.`,
        },
      ],
      whiteboardLines: [
        'WHITEBOARD · 3-PERSON BRAINSTORM',
        'ANGLE: Working Intake Prototype in Week 1',
        `CONSTRAINT: ${blockerText.slice(0, 34)}`,
        'EXPERIMENT: Day-0 Credentials + Mock Fixtures',
        'OWNER: Project Tracker -> Add Staging Task',
      ],
      decisions: [
        'Offer angle: deliver a clickable Week-1 prototype decoupled from client IT wait times.',
        `Delivery constraint addressed: "${blockerText}"`,
        `Action: Project Tracker adds a Day-0 Mock Webhook Fixture task to ${projectTitle}.`,
      ],
      nextSteps: [
        {
          botId: 'project-tracker',
          task: `Add Day-0 credential checklist & mock webhook fixture task to ${projectTitle}`,
        },
      ],
      contextArtifact,
      followUp: {
        kind: 'add-project-task',
        owner: 'project-tracker',
        workNodeId: getDeskNodeId('project-tracker'),
        workRoom: 'open-work',
        projectId: project?.id,
        taskTitle: 'Create Day-0 credential checklist & mock webhook fixture',
        taskOwner: 'Automation Eng',
      },
    };
  }

  /* ----------------------- 4. ALL-HANDS 4-PERSON MEETING ------------------- */
  const contextArtifact: LinkedArtifactRef | undefined = topContent
    ? {
        kind: 'content',
        id: topContent.id,
        label: `${topContent.platform}: ${topContent.hook.slice(0, 36)}`,
        botId: 'content-creator',
      }
    : undefined;

  return {
    id: `conv-${idSuffix}`,
    format: 'all-hands',
    venue: 'meeting-room',
    title: `All-Hands Sync: Sales, Delivery & Content Alignment`,
    attendees: [
      'lead-finder',
      'business-strategist',
      'project-tracker',
      'content-creator',
    ],
    positions: [
      {
        botId: 'lead-finder',
        targetNodeId: getMeetingNodeId('lead-finder'),
        room: 'meeting-room',
        posture: 'seated',
        walkSpeech: 'Walking to the all-hands sync...',
      },
      {
        botId: 'business-strategist',
        targetNodeId: getMeetingNodeId('business-strategist'),
        room: 'meeting-room',
        posture: 'seated',
        walkSpeech: 'Heading to Meeting Room for team sync...',
      },
      {
        botId: 'project-tracker',
        targetNodeId: getMeetingNodeId('project-tracker'),
        room: 'meeting-room',
        posture: 'seated',
        walkSpeech: 'Joining the all-hands meeting...',
      },
      {
        botId: 'content-creator',
        targetNodeId: getMeetingNodeId('content-creator'),
        room: 'meeting-room',
        posture: 'seated',
        walkSpeech: 'Heading into the Glass Meeting Room...',
      },
    ],
    turns: [
      {
        id: `t-${idSuffix}-1`,
        speaker: 'lead-finder',
        roleTag: 'fact',
        bubbleText: `Pipeline leads (${leadAName}, ${leadBName}) want faster intake.`,
        fullText: `Sales update: prospects like ${leadAName} and ${leadBName} respond best when we speak directly to overnight inquiry delays and manual spreadsheet re-entry.`,
      },
      {
        id: `t-${idSuffix}-2`,
        speaker: 'business-strategist',
        roleTag: 'idea',
        bubbleText: 'Let us unify around one flagship: Intake & Triage Audit.',
        fullText: `Strategy alignment: let's anchor sales, delivery, and content around one repeatable flagship experiment — the Branded Inquiry & Triage Sprint — so every touchpoint reinforces the same offer.`,
      },
      {
        id: `t-${idSuffix}-3`,
        speaker: 'project-tracker',
        roleTag: 'concern',
        bubbleText: 'Delivery can hold a 2-week SLA if handoff is templated.',
        fullText: `Delivery perspective: we can hit a 2-week turnaround cleanly as long as we keep our Owner Handoff runbook and Day-0 credential checklist standardized across every sprint.`,
      },
      {
        id: `t-${idSuffix}-4`,
        speaker: 'content-creator',
        roleTag: 'handoff',
        bubbleText: 'Marketing aligned — I will tie drafts to that exact sprint.',
        fullText: `Marketing aligned: I will frame upcoming LinkedIn and case-study drafts around that exact Intake & Triage Sprint and human-in-the-loop review boundary.`,
      },
      {
        id: `t-${idSuffix}-5`,
        speaker: 'business-strategist',
        roleTag: 'decision',
        bubbleText: 'Locked! Lead tags pipeline, Strategist logs experiment.',
        fullText: `Decision locked across all four roles: Lead Finder tags top intake-fit prospects for follow-up, Strategist logs the cross-functional alignment experiment, Project Tracker enforces the templated handoff, and Content Creator aligns queue copy.`,
      },
    ],
    whiteboardLines: [
      'ALL-HANDS · SALES + DELIVERY + MARKETING',
      '1. SALES: Focus on intake & inquiry lag leads',
      '2. STRATEGY: Flagship Intake & Triage Sprint',
      '3. DELIVERY: 2-wk SLA + templated handoff',
      '4. OWNER: Lead Finder tags priority prospects',
    ],
    decisions: [
      'Unified agency focus: Branded Intake & Triage Sprint across sales, delivery, and marketing.',
      'Delivery guardrail: 2-week SLA backed by Day-0 checklist and templated Owner Handoff.',
      'Clear owners assigned: Lead Finder tags matching leads; Content Creator aligns campaign drafts.',
    ],
    nextSteps: [
      {
        botId: 'lead-finder',
        task: `Tag ${leadBName} as flagship intake-sprint fit in pipeline`,
      },
      {
        botId: 'business-strategist',
        task: 'Track sprint positioning in Strategy Briefs',
      },
      {
        botId: 'project-tracker',
        task: 'Maintain templated Owner Handoff milestone checklist',
      },
      {
        botId: 'content-creator',
        task: 'Keep queue drafts aligned to Intake & Triage positioning',
      },
    ],
    contextArtifact,
    followUp: {
      kind: 'tag-and-note-lead',
      owner: 'lead-finder',
      workNodeId: getDeskNodeId('lead-finder'),
      workRoom: 'open-work',
      leadId: leadB?.id || leadA?.id,
      tag: 'flagship-intake-fit',
      noteSummary: `Tagged ${leadBName} as flagship-intake-fit after All-Hands alignment.`,
    },
  };
}

export interface IdleRoutineMove {
  botId: BotId;
  targetNodeId: string;
  room: Exclude<RoomId, 'overview'>;
  posture: 'seated' | 'standing';
  activityAfterArrive: 'at-desk' | 'working' | 'checking-notes' | 'lounging';
  statusDetail: string;
}

/**
 * Picks a natural independent studio routine movement for a free coworker between conversations:
 * walking to the lounge, checking the whiteboard/project board, visiting another desk, or returning to type.
 */
export function pickIdleRoutineMove(
  botId: BotId,
  stepIndex: number,
  currentRoom: Exclude<RoomId, 'overview'>
): IdleRoutineMove {
  // If currently away from desk, return to desk to work cleanly
  if (currentRoom !== 'open-work') {
    return {
      botId,
      targetNodeId: getDeskNodeId(botId),
      room: 'open-work',
      posture: 'seated',
      activityAfterArrive: 'working',
      statusDetail: 'Returning to desk to review workspace updates',
    };
  }

  const pick = stepIndex % 4;
  if (pick === 0) {
    return {
      botId,
      targetNodeId: LOUNGE_HUDDLE_SPOTS[stepIndex % LOUNGE_HUDDLE_SPOTS.length].nodeId,
      room: 'lounge',
      posture: stepIndex % 3 === 0 ? 'seated' : 'standing',
      activityAfterArrive: 'lounging',
      statusDetail: 'Stretching out briefly in the Studio Lounge',
    };
  }
  if (pick === 1) {
    return {
      botId,
      targetNodeId: WHITEBOARD_HUDDLE_SPOTS[stepIndex % WHITEBOARD_HUDDLE_SPOTS.length].nodeId,
      room: 'meeting-room',
      posture: 'standing',
      activityAfterArrive: 'checking-notes',
      statusDetail: 'Checking decisions on the Meeting Room whiteboard',
    };
  }
  if (pick === 2 && botId === 'content-creator') {
    return {
      botId,
      targetNodeId: CONTENT_STUDIO_SPOT.nodeId,
      room: 'content-studio',
      posture: 'seated',
      activityAfterArrive: 'working',
      statusDetail: 'Polishing copy in the Content Studio',
    };
  }

  // Visit a coworker's desk briefly or stay checking notes
  const peerOrder: BotId[] = [
    'lead-finder',
    'business-strategist',
    'project-tracker',
    'content-creator',
  ];
  const peer =
    peerOrder[(peerOrder.indexOf(botId) + 1) % peerOrder.length];
  return {
    botId,
    targetNodeId: getDeskVisitorNodeId(peer),
    room: 'open-work',
    posture: 'standing',
    activityAfterArrive: 'checking-notes',
    statusDetail: `Checking notes near ${peer.replace('-', ' ')}'s desk`,
  };
}
