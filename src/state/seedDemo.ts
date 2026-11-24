import type {
  BotActivityState,
  BotId,
  BotLivePresence,
  BotMeta,
  WorkspaceState,
} from '../types/workspace';
import { BOT_DESK_POSITIONS } from '../scene/officeLayout';
import { createInitialOfficeQueueState } from './officeQueueStore';
import { createInitialBotBreaks } from '../workflows/coffeeBreak';

export const BOTS: BotMeta[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder',
    shortTag: 'Lead',
    role: 'Business Lead Research',
    deskLabel: 'Desk 01',
    summary:
      'Finds target businesses, verifies booking and inquiry sources, and compiles researched shortlists for Team Lead review.',
    deskCoords: BOT_DESK_POSITIONS['lead-finder'],
    accentHex: '#38BDF8',
  },
  {
    id: 'business-strategist',
    name: 'Team Lead',
    shortTag: 'Team Lead',
    role: 'Team Lead · Strategy & Approvals',
    deskLabel: 'Desk 02',
    summary:
      'Reviews employee work against the brief, approves internal steps automatically, assigns follow-ups, and escalates only owner decisions.',
    deskCoords: BOT_DESK_POSITIONS['business-strategist'],
    accentHex: '#EAB365',
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    shortTag: 'Projects',
    role: 'Project Coordinator · Tasks & Board',
    deskLabel: 'Desk 03',
    summary:
      'Checks off completed tasks, keeps the project board up to date, flags blockers, and drafts client updates.',
    deskCoords: BOT_DESK_POSITIONS['project-tracker'],
    accentHex: '#34D399',
  },
  {
    id: 'content-creator',
    name: 'Content Creator',
    shortTag: 'Content',
    role: 'Outreach & Editorial Drafts',
    deskLabel: 'Desk 04',
    summary:
      'Turns approved lead shortlists and agency insights into editable outreach messages and channel drafts for Team Lead review.',
    deskCoords: BOT_DESK_POSITIONS['content-creator'],
    accentHex: '#C084FC',
  },
];

export const BOT_STATUS_LABELS = {
  idle: 'Idle',
  running: 'Running',
  ready: 'Completed',
  failed: 'Failed',
} as const;

export const BOT_ACTIVITY_LABELS: Record<BotActivityState, string> = {
  'at-desk': 'At desk',
  walking: 'Walking',
  discussing: 'Talking',
  working: 'Working',
  'checking-notes': 'Notes',
  lounging: 'Lounge',
  'on-break': 'On break',
  waiting: 'Waiting',
};

export function createInitialBotPresence(): Record<BotId, BotLivePresence> {
  return {
    'lead-finder': {
      botId: 'lead-finder',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:lead-finder',
      posture: 'seated',
      deskWorkMode: 'idle',
      screenTitle: 'LEAD RESEARCH',
      screenLines: [
        { text: '• Copperleaf Logistics', tone: 'ok' },
        { text: '• Northstar Dental', tone: 'ok' },
        { text: 'Ready for next brief', tone: 'normal' },
      ],
    },
    'business-strategist': {
      botId: 'business-strategist',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:business-strategist',
      posture: 'seated',
      deskWorkMode: 'idle',
      screenTitle: 'TEAM LEAD QUEUE',
      screenLines: [
        { text: '✓ Internal reviews clear', tone: 'ok' },
        { text: '• Watching team handoffs', tone: 'accent' },
        { text: '• Owner inbox: 0 open', tone: 'normal' },
      ],
    },
    'project-tracker': {
      botId: 'project-tracker',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:project-tracker',
      posture: 'seated',
      deskWorkMode: 'idle',
      screenTitle: 'PROJECT BOARD',
      screenLines: [
        { text: '[✓] Intake form schema', tone: 'ok' },
        { text: '[ ] Connect dispatch API', tone: 'warn' },
        { text: '[ ] Owner handoff guide', tone: 'normal' },
      ],
    },
    'content-creator': {
      botId: 'content-creator',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:content-creator',
      posture: 'seated',
      deskWorkMode: 'idle',
      screenTitle: 'DRAFT EDITOR',
      screenLines: [
        { text: 'Outreach & post queue', tone: 'accent' },
        { text: '• LinkedIn teardown', tone: 'ok' },
        { text: 'Ready for next draft', tone: 'normal' },
      ],
    },
  };
}

export function createInitialWorkspaceState(): WorkspaceState {
  return {
    todayFocus: null,
    leads: [
      {
        id: 'demo-lead-1',
        businessName: 'Copperleaf Logistics (Fictional · Demo)',
        industry: 'Regional Freight & Warehousing',
        location: 'Austin, TX',
        targetClient: 'Mid-market dispatch operators',
        serviceOffered: 'n8n Dispatch & Invoice Automation',
        observedProblem:
          'Dispatchers manually re-key PDF bills of lading into accounting software every evening, creating billing lag and untracked exceptions.',
        suggestedOffer:
          'Automated PDF intake pipeline + exception review dashboard built in 3 weeks.',
        outreachAngle:
          'Send a 3-minute architecture walkthrough showing automated BOL parsing with human review for edge cases.',
        outreachDraft:
          'Hi Copperleaf Logistics team — we help regional freight operators eliminate manual BOL entry with lightweight automation and clear exception queues. Open to a quick demo next week?',
        savedAt: 'Demo seed',
        status: 'evaluated',
        tags: ['intake-bottleneck', 'logistics'],
        isDemo: true,
      },
      {
        id: 'demo-lead-2',
        businessName: 'Hearthstone Dental Group (Fictional · Demo)',
        industry: 'Multi-Location Healthcare',
        location: 'Denver, CO',
        targetClient: '4-clinic practice operations lead',
        serviceOffered: 'Patient Intake & Inquiry Triage',
        observedProblem:
          'New patient inquiries sit in a shared inbox overnight with no automated qualification, owner tracking, or booking follow-up.',
        suggestedOffer:
          '2-week intake routing workflow with instant SMS/email triage and front-desk review queue.',
        outreachAngle:
          'Highlight faster response times for high-value appointments without changing their existing practice software.',
        outreachDraft:
          'Hi Hearthstone team — Rhymvex builds practical intake automation for multi-location clinics so inquiries never sit overnight. Happy to share a 1-page workflow map if useful.',
        savedAt: 'Demo seed',
        status: 'saved',
        tags: ['inquiry-tracking', 'healthcare'],
        isDemo: true,
      },
    ],
    strategyBriefs: [
      {
        id: 'demo-strat-1',
        title: 'Productized Intake & Exception Queue Sprint (Demo)',
        niche: 'Local Multi-Location Service Operators',
        serviceIdea:
          '2-Week Branded Inquiry Form + Shared Exception Queue for teams losing requests in inboxes and spreadsheets.',
        hypothesis:
          'Across both Copperleaf Logistics and Hearthstone Dental Group, owners lose high-intent revenue because intake happens via unstructured PDFs and shared inboxes. A fixed-scope intake + triage sprint will convert faster than custom open-ended builds.',
        evidenceFromWorkspace: [
          'Copperleaf Logistics (Demo): manual evening BOL re-keying causes billing lag.',
          'Hearthstone Dental Group (Demo): overnight shared-inbox inquiries lack triage or owner tracking.',
        ],
        experimentPlan: [
          'Package a 1-page interactive intake + triage blueprint showing before/after response speed.',
          'Test outreach angle with 3 fictional local service operators before committing build capacity.',
          'Include mandatory Owner Handoff & Runbook milestone to prevent post-launch drop-off.',
        ],
        successMetric: '2 qualified discovery replies from 5 tailored walkthrough pitches within 10 days.',
        estimatedPriceRange: '$6,500 – $9,500 (2–3 weeks)',
        deliveryConstraint:
          'Client IT token/credential handoff can stall staging (flagged in Copperleaf BOL project).',
        nextStepOwner: 'content-creator',
        nextStepAction: 'Draft a breakdown post highlighting why shared inboxes drop inbound inquiries.',
        createdAt: 'Demo seed',
        status: 'hypothesis',
        sourceLeadIds: ['demo-lead-1', 'demo-lead-2'],
        isDemo: true,
      },
    ],
    proposals: [
      {
        id: 'demo-prop-1',
        leadId: 'demo-lead-1',
        clientName: 'Copperleaf Logistics (Fictional · Demo)',
        projectGoal:
          'Automate bill-of-lading intake and invoice reconciliation across 3 warehouses.',
        deliverables: [
          'PDF parser & validation worker',
          'Human-in-the-loop exception review UI',
          'Accounting webhook integration & audit log',
        ],
        budget: '$14,000',
        timeline: '4 weeks',
        scope:
          'Rhymvex will engineer a modular intake automation pipeline for Copperleaf Logistics that extracts fields from incoming freight PDFs, routes low-confidence rows to a dispatcher review queue, and syncs approved invoices automatically.',
        milestones: [
          {
            id: 'demo-ms-1',
            phase: 'Milestone 1 — Schema & Prototype',
            deliverable: 'Document extraction schema and staging webhook harness.',
            targetWeek: 'Week 1',
          },
          {
            id: 'demo-ms-2',
            phase: 'Milestone 2 — Core Pipeline & Review Queue',
            deliverable: 'Automated parser, exception dashboard, and accounting sync.',
            targetWeek: 'Week 3',
          },
          {
            id: 'demo-ms-3',
            phase: 'Milestone 3 — Rollout & Operator Runbook',
            deliverable: 'Production cutover, alerting, and staff walkthrough.',
            targetWeek: 'Week 4',
          },
        ],
        exclusions: [
          'Third-party cloud OCR usage fees billed directly to Copperleaf.',
          'ERP custom plugin development outside documented REST webhooks.',
        ],
        pricing: [
          { id: 'demo-pr-1', item: 'Discovery & Architecture', amount: '$3,500' },
          { id: 'demo-pr-2', item: 'Automation Build & Review UI', amount: '$7,700' },
          { id: 'demo-pr-3', item: 'QA & Production Handoff', amount: '$2,800' },
        ],
        nextSteps:
          '1. Approve scope and sample PDF set.\n2. Schedule kickoff call with dispatch lead.\n3. Provision staging credentials.',
        createdAt: 'Historical archive',
        status: 'converted',
        projectId: 'demo-proj-1',
        isDemo: true,
        isHistorical: true,
      },
    ],
    projects: [
      {
        id: 'demo-proj-1',
        proposalId: 'demo-prop-1',
        clientName: 'Copperleaf Logistics (Fictional · Demo)',
        title: 'Copperleaf BOL Automation Portal (Demo)',
        summary:
          'Automated PDF bill-of-lading intake with human exception review and accounting sync.',
        status: 'at-risk',
        createdAt: 'Demo seed',
        milestones: [
          {
            id: 'dp-m1',
            title: 'Schema & Webhook Spec Approved',
            targetDate: '2026-11-26',
            completed: true,
          },
          {
            id: 'dp-m2',
            title: 'Staging Pipeline & Exception UI',
            targetDate: '2026-12-04',
            completed: false,
          },
          {
            id: 'dp-m3',
            title: 'Production Cutover & Runbook',
            targetDate: '2026-12-14',
            completed: false,
          },
        ],
        tasks: [
          {
            id: 'dp-t1',
            title: 'Finalize sample PDF field mapping',
            owner: 'Systems Lead',
            dueDate: '2026-11-24',
            status: 'done',
            blocked: false,
            blockerNote: '',
          },
          {
            id: 'dp-t2',
            title: 'Build webhook retry queue & dead-letter alert',
            owner: 'Automation Eng',
            dueDate: '2026-11-28',
            status: 'in-progress',
            blocked: false,
            blockerNote: '',
          },
          {
            id: 'dp-t3',
            title: 'Connect staging accounting sandbox API',
            owner: 'Full-Stack Eng',
            dueDate: '2026-12-01',
            status: 'in-progress',
            blocked: true,
            blockerNote: 'Waiting on Copperleaf IT to rotate sandbox API token.',
          },
          {
            id: 'dp-t4',
            title: 'Write dispatcher runbook & handoff video',
            owner: 'Delivery Lead',
            dueDate: '2026-12-10',
            status: 'todo',
            blocked: false,
            blockerNote: '',
          },
        ],
        clientUpdates: [],
        isDemo: true,
      },
    ],
    contentQueue: [
      {
        id: 'demo-content-1',
        platform: 'LinkedIn',
        topic: 'Human-in-the-loop agency automation',
        offer: 'Workflow Architecture Audit',
        tone: 'Practical & technical',
        variantLabel: 'Demo Draft — Practical Breakdown',
        hook: 'Why the best internal automations stop short of fully autonomous outreach.',
        body: 'At Rhymvex, we build automation systems that draft, structure, and route work — while keeping final client sends and publishing in human hands.\n\nThat single boundary eliminates brand mistakes and makes teams trust the workflow on day one.',
        callToAction: 'Reply "AUDIT" for our 1-page automation readiness checklist.',
        savedAt: 'Demo seed',
        queueStatus: 'completed',
        isDemo: true,
      },
    ],
    activity: [
      {
        id: 'demo-act-1',
        timestamp: 'Demo seed',
        botId: 'project-tracker',
        action: 'Demo project active',
        detail:
          'Copperleaf BOL Automation Portal seeded with 4 tasks and 1 flagged blocker.',
        artifactRef: {
          kind: 'project',
          id: 'demo-proj-1',
          label: 'Copperleaf BOL Automation Portal (Demo)',
          botId: 'project-tracker',
        },
        isDemo: true,
      },
      {
        id: 'demo-act-2',
        timestamp: 'Demo seed',
        botId: 'business-strategist',
        action: 'Strategy hypothesis seeded',
        detail:
          'Productized Intake & Exception Queue Sprint hypothesis linked to 2 demo leads.',
        artifactRef: {
          kind: 'strategy',
          id: 'demo-strat-1',
          label: 'Productized Intake & Exception Queue Sprint',
          botId: 'business-strategist',
        },
        isDemo: true,
      },
      {
        id: 'demo-act-3',
        timestamp: 'Demo seed',
        botId: 'lead-finder',
        action: 'Demo leads loaded',
        detail:
          '2 clearly marked fictional demo leads available in pipeline.',
        artifactRef: {
          kind: 'lead',
          id: 'demo-lead-2',
          label: 'Hearthstone Dental Group (Demo)',
          botId: 'lead-finder',
        },
        isDemo: true,
      },
    ],
    botJobs: {
      'lead-finder': { status: 'idle', mode: 'simulation' },
      'business-strategist': { status: 'idle', mode: 'simulation' },
      'project-tracker': { status: 'idle', mode: 'simulation' },
      'content-creator': { status: 'idle', mode: 'simulation' },
    },
    assignments: [],
    meetings: [],
    whiteboardHistory: [
      {
        id: 'demo-wb-1',
        sessionTitle: 'Copperleaf BOL Kickoff & Staging Architecture (Demo)',
        capturedAt: 'Demo · Session 02',
        format: 'all-hands',
        venue: 'meeting-room',
        source: 'demo',
        attendees: [
          'lead-finder',
          'business-strategist',
          'project-tracker',
          'content-creator',
        ],
        whiteboardLines: [
          'COPPERLEAF BOL ARCHITECTURE',
          '1. PDF parser + human exception queue',
          '2. Webhook retry queue & dead-letter alert',
          '3. Mandatory Owner Handoff milestone (Wk 4)',
          '4. Decouple staging via mock API fixtures',
        ],
        decisions: [
          'Route low-confidence BOL rows to a dispatcher review queue before accounting sync.',
          'Add dead-letter alerting and automatic retries on the accounting webhook worker.',
          'Lock a dedicated Owner Handoff & Runbook milestone before production cutover.',
        ],
        nextSteps: [
          {
            botId: 'project-tracker',
            task: 'Track sandbox API token rotation blocker and staging milestone.',
          },
          {
            botId: 'business-strategist',
            task: 'Package the intake + exception queue blueprint as a repeatable sprint.',
          },
        ],
        projectId: 'demo-proj-1',
        projectTitle: 'Copperleaf BOL Automation Portal (Demo)',
        linkedArtifacts: [
          {
            kind: 'project',
            id: 'demo-proj-1',
            label: 'Copperleaf BOL Automation Portal (Demo)',
            botId: 'project-tracker',
          },
          {
            kind: 'lead',
            id: 'demo-lead-1',
            label: 'Copperleaf Logistics (Fictional · Demo)',
            botId: 'lead-finder',
          },
        ],
        isDemo: true,
      },
      {
        id: 'demo-wb-2',
        sessionTitle: 'Intake & Exception Queue Sprint Positioning (Demo)',
        capturedAt: 'Demo · Session 01',
        format: 'trio',
        venue: 'whiteboard',
        source: 'demo',
        attendees: [
          'business-strategist',
          'lead-finder',
          'project-tracker',
        ],
        whiteboardLines: [
          'PRODUCTIZED INTAKE SPRINT ($6.5k–$9.5k)',
          'Pattern: Shared inboxes & manual PDF entry',
          'Offer: 2-week branded inquiry + triage UI',
          'Guardrail: Day-0 client credential checklist',
        ],
        decisions: [
          'Lead with a fixed-scope 2-week Intake & Triage Sprint instead of open-ended custom builds.',
          'Require a Day-0 credential checklist during kickoff so IT delays never block Week 1.',
          'Publish a practical teardown on why shared inboxes drop overnight service inquiries.',
        ],
        nextSteps: [
          {
            botId: 'business-strategist',
            task: 'Record hypothesis across Copperleaf Logistics and Hearthstone Dental leads.',
          },
          {
            botId: 'content-creator',
            task: 'Draft LinkedIn breakdown on human-in-the-loop intake automation.',
          },
        ],
        linkedArtifacts: [
          {
            kind: 'strategy',
            id: 'demo-strat-1',
            label: 'Productized Intake & Exception Queue Sprint (Demo)',
            botId: 'business-strategist',
          },
          {
            kind: 'lead',
            id: 'demo-lead-2',
            label: 'Hearthstone Dental Group (Fictional · Demo)',
            botId: 'lead-finder',
          },
        ],
        isDemo: true,
      },
    ],
    activeWhiteboardSnapshotId: 'demo-wb-1',
    reviewQueue: [],
    executedActions: [],
    officeQueue: createInitialOfficeQueueState(),
    botBreaks: createInitialBotBreaks(),
  };
}
