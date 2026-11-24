import type {
  BotId,
  LeadCandidate,
  LinkedArtifactRef,
  TodayFocus,
  TodayFocusKind,
  WorkspaceState,
} from '../types/workspace';
import type { PlannedConversation } from './conversationPlanner';
import {
  CONTENT_STUDIO_SPOT,
  WHITEBOARD_HUDDLE_SPOTS,
} from '../scene/officeLayout';
import { getDeskNodeId, getDeskVisitorNodeId } from '../scene/navigation';
import { nowStamp } from '../state/workspaceStore';

export const AUSTRALIAN_CLEANING_EXAMPLE_FOCUS = {
  goal: 'Evaluate three Australian residential cleaning businesses with a visible inquiry problem. For each, save the problem and a suggested Rhymvex offer.',
  targetAudience: 'Australian residential cleaning businesses',
  expectedResult:
    '3 leads evaluated with observed inquiry problem and suggested Rhymvex offer',
};

export interface FocusProgressSnapshot {
  completedCount: number;
  targetCount: number;
  isComplete: boolean;
  unitLabel: string;
  progressLabel: string;
  linkedResults: LinkedArtifactRef[];
}

interface FictionalCandidateBlueprint {
  key: string;
  businessName: string;
  shortName: string;
  industry: string;
  location: string;
  targetClient: string;
  serviceOffered: string;
  sampleInquiryFlow: string;
  observedProblem: string;
  suggestedOffer: string;
  outreachAngle: string;
  outreachDraft: string;
  tags: string[];
}

const AU_RESIDENTIAL_CLEANING_CANDIDATES: FictionalCandidateBlueprint[] = [
  {
    key: 'harbourside-home-sparkle',
    businessName: 'Harbourside Home Sparkle — Sydney, NSW (Fictional · Simulation)',
    shortName: 'Harbourside Home Sparkle',
    industry: 'Australian Residential Cleaning',
    location: 'Sydney, NSW',
    targetClient: 'Residential cleaning business owner',
    serviceOffered: 'Branded Inquiry Page + Owner Inquiry Tracker',
    sampleInquiryFlow:
      'Static "Contact Us" mailto link + voicemail callback with no home-size fields',
    observedProblem:
      'Homeowners requesting end-of-lease or weekly cleans must email a generic info@ address with no bedroom/bathroom or suburb fields, creating 3–4 back-and-forth emails and lost evening quotes.',
    suggestedOffer:
      'Branded 60-second residential inquiry page capturing suburb, home size, and clean type, linked to a lightweight Owner Tracker with instant SMS/email notification so quotes go out within 15 minutes.',
    outreachAngle:
      'Share a 2-minute interactive mockup of their quote form showing how structured home details cut quote back-and-forth in half.',
    outreachDraft:
      'Hi Harbourside Home Sparkle team — noticed quote requests currently go through a generic email link without bedroom/suburb fields. Rhymvex builds branded inquiry pages with an owner tracker and instant alerts so evening inquiries never slip. Open to a quick mockup?',
    tags: ['au-cleaning', 'inquiry-problem', 'branded-inquiry-page'],
  },
  {
    key: 'bayside-fresh-cleaning',
    businessName: 'Bayside Fresh Cleaning Co. — Melbourne, VIC (Fictional · Simulation)',
    shortName: 'Bayside Fresh Cleaning Co.',
    industry: 'Australian Residential Cleaning',
    location: 'Melbourne, VIC',
    targetClient: 'Owner-operator managing 6 cleaners',
    serviceOffered: 'Unified Inquiry Page + Follow-Up Owner Tracker',
    sampleInquiryFlow:
      'Instagram DMs, SMS texts, and a basic web form tracked manually in phone notes',
    observedProblem:
      'Fortnightly clean inquiries arrive across Instagram DMs and a plain web form with no central status board; the owner misses follow-ups on warm quotes while out on morning jobs.',
    suggestedOffer:
      'Central branded inquiry page feeding one simple Owner Tracker (New / Quoted / Booked) with automatic owner notifications and 48-hour follow-up reminders — no heavy CRM required.',
    outreachAngle:
      'Highlight replacing scattered phone notes with one Owner Tracker view that pings them the moment a fortnightly inquiry arrives.',
    outreachDraft:
      'Hi Bayside Fresh Cleaning Co. — many Melbourne cleaning owners lose repeat fortnightly bookings between DMs and phone notes. We set up a branded inquiry page + owner tracker with instant notifications in 2 weeks. Happy to share a sample layout?',
    tags: ['au-cleaning', 'owner-tracker', 'follow-up-leak'],
  },
  {
    key: 'rivercity-bright-homes',
    businessName: 'Rivercity Bright Homes — Brisbane, QLD (Fictional · Simulation)',
    shortName: 'Rivercity Bright Homes',
    industry: 'Australian Residential Cleaning',
    location: 'Brisbane, QLD',
    targetClient: 'Operations lead & franchise owner',
    serviceOffered: 'Suburb-Routed Inquiry Form + Instant Bond-Clean Alerts',
    sampleInquiryFlow:
      'Long unformatted web form emailing plain text to a shared team inbox',
    observedProblem:
      'High-value bond-clean and spring-clean inquiries sit unclaimed in a shared inbox overnight with no suburb check or urgency flag, causing urgent move-out leads to book faster competitors.',
    suggestedOffer:
      'Branded inquiry page with automatic suburb and bond-clean urgency tagging, an Owner Tracker showing claimed vs. open quotes, and instant high-priority owner notifications.',
    outreachAngle:
      'Focus on capturing urgent Brisbane bond-clean revenue by alerting the owner immediately instead of letting requests sit in a shared inbox.',
    outreachDraft:
      'Hi Rivercity Bright Homes team — urgent bond-clean inquiries often go cold when they land in a shared inbox overnight. Rhymvex builds a branded inquiry page with suburb routing, an owner tracker, and instant notifications for priority jobs. Worth a 5-minute look?',
    tags: ['au-cleaning', 'bond-clean-alerts', 'shared-inbox'],
  },
  {
    key: 'swan-valley-tidy',
    businessName: 'Swan Valley Tidy Homes — Perth, WA (Fictional · Simulation)',
    shortName: 'Swan Valley Tidy Homes',
    industry: 'Australian Residential Cleaning',
    location: 'Perth, WA',
    targetClient: 'Founder & scheduling coordinator',
    serviceOffered: 'Branded Quote Intake + Instant Owner Alert',
    sampleInquiryFlow:
      'Phone-only booking number with after-hours voicemail and no online quote option',
    observedProblem:
      'Busy families browsing after 7pm hit voicemail with no structured way to request a quote online, leading to high abandonment before the next business morning.',
    suggestedOffer:
      'Mobile-first branded inquiry page that captures home details 24/7, logs every request in an Owner Tracker, and sends an instant morning digest plus urgent job notifications.',
    outreachAngle:
      'Show how capturing after-hours quote requests automatically turns missed voicemails into morning bookings.',
    outreachDraft:
      'Hi Swan Valley Tidy Homes — adding a branded 60-second inquiry page with instant owner notifications captures families searching after hours without extra phone tag. Open to seeing a quick example?',
    tags: ['au-cleaning', 'after-hours-intake', 'notifications'],
  },
  {
    key: 'adelaide-coastal-clean',
    businessName: 'Adelaide Coastal Clean — Adelaide, SA (Fictional · Simulation)',
    shortName: 'Adelaide Coastal Clean',
    industry: 'Australian Residential Cleaning',
    location: 'Adelaide, SA',
    targetClient: 'Residential cleaning director',
    serviceOffered: 'Branded Intake Page + Owner Pipeline Tracker',
    sampleInquiryFlow:
      'PDF price sheet download with manual email reply required to book',
    observedProblem:
      'Prospects download a static PDF price guide and drop off before emailing back because there is no guided quote submission or follow-up tracking.',
    suggestedOffer:
      'Replace the static PDF with a branded interactive inquiry page connected to an Owner Tracker and instant owner notification on every submitted estimate request.',
    outreachAngle:
      'Turn static PDF price downloads into trackable quote inquiries with instant owner alerts.',
    outreachDraft:
      'Hi Adelaide Coastal Clean team — static PDF price guides often lose warm homeowners before they reply. We replace them with a branded inquiry page + owner tracker and instant notifications. Want a quick preview?',
    tags: ['au-cleaning', 'pdf-dropoff', 'inquiry-page'],
  },
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

export function parseFocusTargetCount(
  goal: string,
  expectedResult: string
): number {
  const combined = `${goal} ${expectedResult}`.toLowerCase();
  const digitMatch = combined.match(/\b([1-5])\b/);
  if (digitMatch) {
    return Math.max(1, Math.min(5, Number(digitMatch[1])));
  }
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(combined)) {
      return value;
    }
  }
  return 3;
}

export function detectFocusWorkKind(
  goal: string,
  expectedResult: string
): TodayFocusKind {
  const lower = `${goal} ${expectedResult}`.toLowerCase();
  if (
    /\b(post|posts|draft|drafts|linkedin|newsletter|content|article|thread)\b/.test(
      lower
    ) &&
    !/\b(evaluate|business|businesses|lead|leads|prospect)\b/.test(lower)
  ) {
    return 'content-draft';
  }
  if (
    /\b(experiment|hypothesis|strategy brief|positioning|offer idea)\b/.test(
      lower
    ) &&
    !/\b(evaluate|business|businesses|lead|leads|prospect)\b/.test(lower)
  ) {
    return 'strategy-brief';
  }
  if (
    /\b(task|tasks|milestone|blocker|project checklist)\b/.test(lower) &&
    !/\b(evaluate|business|businesses|lead|leads|prospect)\b/.test(lower)
  ) {
    return 'project-task';
  }
  return 'lead-evaluation';
}

export function createTodayFocus(input: {
  goal: string;
  targetAudience?: string;
  expectedResult?: string;
  targetCount?: number;
  requestConsolidatedReview?: boolean;
}): TodayFocus {
  const goal = input.goal.trim();
  const targetAudience = input.targetAudience?.trim() || undefined;
  const expectedResult =
    input.expectedResult?.trim() ||
    'Saved evaluations with specific observations and suggested Rhymvex offers';
  const targetCount =
    input.targetCount && input.targetCount >= 1 && input.targetCount <= 5
      ? Math.round(input.targetCount)
      : parseFocusTargetCount(goal, expectedResult);
  const workKind = detectFocusWorkKind(goal, expectedResult);
  const inferredReview =
    input.requestConsolidatedReview ??
    /\b(owner review|final review|needs me|consolidat)/i.test(
      `${goal} ${expectedResult}`
    );

  return {
    id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    goal,
    targetAudience,
    expectedResult,
    targetCount,
    workKind,
    requestConsolidatedReview: inferredReview,
    createdAt: nowStamp(),
    status: 'active',
  };
}

/**
 * Derives live Today's focus progress strictly from saved workspace records linked to focus.id.
 * Changing Today's focus starts a fresh focus.id so earlier work stays in history without polluting counts.
 */
export function computeFocusProgress(
  state: WorkspaceState,
  focus: TodayFocus | null
): FocusProgressSnapshot {
  if (!focus) {
    return {
      completedCount: 0,
      targetCount: 0,
      isComplete: false,
      unitLabel: 'items',
      progressLabel: 'No active focus set',
      linkedResults: [],
    };
  }

  if (focus.workKind === 'lead-evaluation') {
    const matching = state.leads.filter((l) => l.focusId === focus.id);
    const linkedResults: LinkedArtifactRef[] = matching.map((l) => ({
      kind: 'lead',
      id: l.id,
      label: l.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim(),
      botId: 'lead-finder',
    }));
    const count = matching.length;
    const unit = focus.targetCount === 1 ? 'lead evaluated' : 'leads evaluated';
    return {
      completedCount: count,
      targetCount: focus.targetCount,
      isComplete: count >= focus.targetCount,
      unitLabel: unit,
      progressLabel: `${Math.min(count, focus.targetCount)} of ${focus.targetCount} ${unit}`,
      linkedResults,
    };
  }

  if (focus.workKind === 'content-draft') {
    const matching = state.contentQueue.filter((c) => c.focusId === focus.id);
    const linkedResults: LinkedArtifactRef[] = matching.map((c) => ({
      kind: 'content',
      id: c.id,
      label: `${c.platform}: ${c.hook.slice(0, 38)}`,
      botId: 'content-creator',
    }));
    const count = matching.length;
    const unit = focus.targetCount === 1 ? 'draft saved' : 'drafts saved';
    return {
      completedCount: count,
      targetCount: focus.targetCount,
      isComplete: count >= focus.targetCount,
      unitLabel: unit,
      progressLabel: `${Math.min(count, focus.targetCount)} of ${focus.targetCount} ${unit}`,
      linkedResults,
    };
  }

  if (focus.workKind === 'strategy-brief') {
    const matching = state.strategyBriefs.filter((s) => s.focusId === focus.id);
    const linkedResults: LinkedArtifactRef[] = matching.map((s) => ({
      kind: 'strategy',
      id: s.id,
      label: s.title.slice(0, 44),
      botId: 'business-strategist',
    }));
    const count = matching.length;
    const unit =
      focus.targetCount === 1 ? 'experiment saved' : 'experiments saved';
    return {
      completedCount: count,
      targetCount: focus.targetCount,
      isComplete: count >= focus.targetCount,
      unitLabel: unit,
      progressLabel: `${Math.min(count, focus.targetCount)} of ${focus.targetCount} ${unit}`,
      linkedResults,
    };
  }

  // project-task
  const matchingTasks: Array<{ projectId: string; title: string }> = [];
  for (const proj of state.projects) {
    for (const t of proj.tasks) {
      if (t.focusId === focus.id) {
        matchingTasks.push({ projectId: proj.id, title: t.title });
      }
    }
  }
  const linkedResults: LinkedArtifactRef[] = matchingTasks.map((t) => ({
    kind: 'project',
    id: t.projectId,
    label: t.title,
    botId: 'project-tracker',
  }));
  const count = matchingTasks.length;
  const unit = focus.targetCount === 1 ? 'task completed' : 'tasks completed';
  return {
    completedCount: count,
    targetCount: focus.targetCount,
    isComplete: count >= focus.targetCount,
    unitLabel: unit,
    progressLabel: `${Math.min(count, focus.targetCount)} of ${focus.targetCount} ${unit}`,
    linkedResults,
  };
}

function buildGenericFictionalCandidates(
  focus: TodayFocus
): FictionalCandidateBlueprint[] {
  const combined = `${focus.goal} ${focus.targetAudience ?? ''}`.toLowerCase();
  const isAustralian = /australia|australian|sydney|melbourne|brisbane|perth|adelaide|\bau\b/.test(
    combined
  );
  const isCleaning = /clean|maid|housekeep|janitor|bond clean/.test(combined);

  if (isCleaning && isAustralian) {
    return AU_RESIDENTIAL_CLEANING_CANDIDATES;
  }

  const industryLabel =
    focus.targetAudience?.trim() ||
    (isCleaning ? 'Residential Cleaning' : 'Local Service Businesses');
  const cities = isAustralian
    ? ['Sydney, NSW', 'Melbourne, VIC', 'Brisbane, QLD', 'Perth, WA', 'Adelaide, SA']
    : ['Austin, TX', 'Denver, CO', 'Portland, OR', 'Nashville, TN', 'Raleigh, NC'];

  const prefixes = ['Northstar', 'Brightline', 'Cedarbrook', 'Clearwater', 'Crestview'];
  const flows = [
    'Generic contact email link with no job-scope fields or auto-acknowledgement',
    'Unstructured web inquiry form emailing plain text into a shared inbox',
    'Social DMs and phone voicemails tracked manually in owner notes',
    'Static PDF rate card requiring manual email back-and-forth to quote',
    'Basic contact box with no status tracking or owner alert notifications',
  ];

  return prefixes.map((prefix, idx) => {
    const city = cities[idx % cities.length];
    const shortName = `${prefix} ${industryLabel.split(' ').slice(0, 2).join(' ')}`;
    return {
      key: `${prefix.toLowerCase()}-${idx + 1}`,
      businessName: `${shortName} — ${city} (Fictional · Simulation)`,
      shortName,
      industry: industryLabel,
      location: city,
      targetClient: `${industryLabel} owner`,
      serviceOffered: 'Branded Inquiry Page + Owner Tracker & Alerts',
      sampleInquiryFlow: flows[idx % flows.length],
      observedProblem: `Inbound requests arrive via ${flows[idx % flows.length].toLowerCase()}, leaving quotes uncategorized and slowing down owner follow-up.`,
      suggestedOffer: `Branded inquiry page capturing structured request details, connected to a clear Owner Tracker and instant owner notifications so every warm inquiry gets a fast response.`,
      outreachAngle: `Offer a 2-minute interactive preview replacing their current inquiry flow with a branded intake page and owner tracker.`,
      outreachDraft: `Hi ${shortName} team — we spotted an easy win to speed up quote responses with a branded inquiry page, simple owner tracker, and instant notifications. Open to a quick preview?`,
      tags: ['focus-evaluated', 'inquiry-problem', 'rhymvex-offer'],
    };
  });
}

/**
 * Plans the next single conversation + concrete follow-up step for Today's focus.
 * Returns null immediately when the focus is already complete so the office stops creating
 * more tasks for a finished focus.
 */
export function planNextFocusConversation(
  state: WorkspaceState,
  focus: TodayFocus
): PlannedConversation | null {
  if (focus.status === 'completed') return null;
  const progress = computeFocusProgress(state, focus);
  if (progress.isComplete) return null;

  const stepIndex = progress.completedCount; // 0-based index for next item
  const stepNumber = stepIndex + 1;

  if (focus.workKind === 'lead-evaluation') {
    const pool = buildGenericFictionalCandidates(focus);
    const alreadySavedKeys = new Set(
      state.leads
        .filter((l) => l.focusId === focus.id)
        .map((l) => l.businessName.toLowerCase())
    );
    const candidate =
      pool.find((c) => !alreadySavedKeys.has(c.businessName.toLowerCase())) ??
      pool[stepIndex % pool.length];

    const leadCandidate: LeadCandidate = {
      id: `cand-${focus.id}-${candidate.key}`,
      businessName: candidate.businessName,
      industry: candidate.industry,
      location: candidate.location,
      targetClient: candidate.targetClient,
      serviceOffered: candidate.serviceOffered,
      sampleInquiryFlow: candidate.sampleInquiryFlow,
      observedProblem: candidate.observedProblem,
      suggestedOffer: candidate.suggestedOffer,
      outreachAngle: candidate.outreachAngle,
      outreachDraft: candidate.outreachDraft,
      tags: candidate.tags,
    };

    const idSuffix = `focus-${focus.id.slice(-5)}-${stepNumber}`;

    // Step 1: Strategist walks directly to Lead Finder's desk to discuss Candidate 1
    // Step 2: Strategist + Lead Finder + Project Tracker check fit at whiteboard (delivery feasibility)
    // Step 3+: Strategist walks to Lead Finder's desk + Content Creator checks messaging pattern
    if (stepIndex === 0) {
      return {
        id: `conv-${idSuffix}`,
        focusId: focus.id,
        candidateName: candidate.shortName,
        format: 'pair',
        venue: 'desk-side',
        title: `Focus Evaluation ${stepNumber}/${focus.targetCount}: ${candidate.shortName}`,
        attendees: ['business-strategist', 'lead-finder'],
        positions: [
          {
            botId: 'lead-finder',
            targetNodeId: getDeskNodeId('lead-finder'),
            room: 'open-work',
            posture: 'seated',
          },
          {
            botId: 'business-strategist',
            targetNodeId: getDeskVisitorNodeId('lead-finder'),
            room: 'open-work',
            posture: 'standing',
            walkSpeech: `Walking to Lead Finder about ${candidate.shortName}...`,
          },
        ],
        turns: [
          {
            id: `t-${idSuffix}-1`,
            speaker: 'business-strategist',
            roleTag: 'idea',
            bubbleText: `Let's evaluate ${candidate.shortName} first for Today's focus.`,
            fullText: `Starting Today's focus (${stepNumber} of ${focus.targetCount}): let's inspect ${candidate.businessName}. Their sample inquiry flow is "${candidate.sampleInquiryFlow}". Can you verify the exact inquiry leak and check offer fit?`,
          },
          {
            id: `t-${idSuffix}-2`,
            speaker: 'lead-finder',
            roleTag: 'fact',
            bubbleText: `${candidate.shortName} loses quotes in "${candidate.sampleInquiryFlow.slice(0, 34)}..."`,
            fullText: `Confirmed on ${candidate.shortName} (${candidate.location}): ${candidate.observedProblem}`,
          },
          {
            id: `t-${idSuffix}-3`,
            speaker: 'business-strategist',
            roleTag: 'decision',
            bubbleText: `Strong fit — save the branded inquiry page + owner tracker offer.`,
            fullText: `Clear Rhymvex fit for ${candidate.shortName}: recommend a ${candidate.suggestedOffer} Save this evaluated lead record now so we can track progress on Today's focus.`,
          },
        ],
        whiteboardLines: [],
        decisions: [
          `Evaluated ${candidate.shortName} (${candidate.location}): ${candidate.observedProblem}`,
          `Suggested Rhymvex offer: ${candidate.suggestedOffer}`,
        ],
        nextSteps: [
          {
            botId: 'lead-finder',
            task: `Save evaluated lead record for ${candidate.shortName} with problem and Rhymvex offer`,
          },
        ],
        followUp: {
          kind: 'save-lead-evaluation',
          owner: 'lead-finder',
          workNodeId: getDeskNodeId('lead-finder'),
          workRoom: 'open-work',
          focusId: focus.id,
          candidateKey: candidate.key,
          candidate: leadCandidate,
        },
      };
    }

    if (stepIndex === 1) {
      return {
        id: `conv-${idSuffix}`,
        focusId: focus.id,
        candidateName: candidate.shortName,
        format: 'trio',
        venue: 'whiteboard',
        title: `Focus Fit Check ${stepNumber}/${focus.targetCount}: ${candidate.shortName}`,
        attendees: ['business-strategist', 'lead-finder', 'project-tracker'],
        positions: [
          {
            botId: 'lead-finder',
            targetNodeId: WHITEBOARD_HUDDLE_SPOTS[0].nodeId,
            room: 'meeting-room',
            posture: 'standing',
            walkSpeech: `Bringing ${candidate.shortName} inquiry notes to the board...`,
          },
          {
            botId: 'business-strategist',
            targetNodeId: WHITEBOARD_HUDDLE_SPOTS[1].nodeId,
            room: 'meeting-room',
            posture: 'standing',
            walkSpeech: `Reviewing ${candidate.shortName} offer fit at the board...`,
          },
          {
            botId: 'project-tracker',
            targetNodeId: WHITEBOARD_HUDDLE_SPOTS[2].nodeId,
            room: 'meeting-room',
            posture: 'standing',
            walkSpeech: `Checking delivery scope for ${candidate.shortName}...`,
          },
        ],
        turns: [
          {
            id: `t-${idSuffix}-1`,
            speaker: 'business-strategist',
            roleTag: 'idea',
            bubbleText: `Next candidate (${stepNumber}/${focus.targetCount}): ${candidate.shortName}.`,
            fullText: `Moving to candidate ${stepNumber} of ${focus.targetCount} for Today's focus: ${candidate.businessName}. Sample flow: "${candidate.sampleInquiryFlow}".`,
          },
          {
            id: `t-${idSuffix}-2`,
            speaker: 'lead-finder',
            roleTag: 'fact',
            bubbleText: `${candidate.shortName} drops warm repeat leads between channels.`,
            fullText: `Observed problem at ${candidate.shortName}: ${candidate.observedProblem}`,
          },
          {
            id: `t-${idSuffix}-3`,
            speaker: 'project-tracker',
            roleTag: 'concern',
            bubbleText: `Keep it lightweight: branded form + Owner Tracker + alerts fits 2 weeks.`,
            fullText: `Delivery check: a branded inquiry page with a simple Owner Tracker and instant notification alerts avoids complex CRM setup and ships cleanly in a 2-week sprint. Lead Finder, go ahead and save the evaluation.`,
          },
        ],
        whiteboardLines: [
          `FOCUS ${stepNumber}/${focus.targetCount} · ${candidate.shortName.toUpperCase()}`,
          `FLOW: ${candidate.sampleInquiryFlow.slice(0, 40)}`,
          `FIX: Branded Inquiry Page + Owner Tracker`,
          `ALERTS: Instant notification + 48h reminder`,
        ],
        decisions: [
          `Evaluated ${candidate.shortName} (${candidate.location}): ${candidate.observedProblem}`,
          `Delivery-verified Rhymvex offer: ${candidate.suggestedOffer}`,
        ],
        nextSteps: [
          {
            botId: 'lead-finder',
            task: `Save evaluated lead record for ${candidate.shortName} in Lead Finder`,
          },
        ],
        followUp: {
          kind: 'save-lead-evaluation',
          owner: 'lead-finder',
          workNodeId: getDeskNodeId('lead-finder'),
          workRoom: 'open-work',
          focusId: focus.id,
          candidateKey: candidate.key,
          candidate: leadCandidate,
        },
      };
    }

    // Step 3+ (e.g. 3 of 3): Strategist walks to Lead Finder with Content Creator joining to note messaging fit
    return {
      id: `conv-${idSuffix}`,
      focusId: focus.id,
      candidateName: candidate.shortName,
      format: 'trio',
      venue: 'desk-side',
      title: `Focus Evaluation ${stepNumber}/${focus.targetCount}: ${candidate.shortName}`,
      attendees: ['business-strategist', 'lead-finder', 'content-creator'],
      positions: [
        {
          botId: 'lead-finder',
          targetNodeId: getDeskNodeId('lead-finder'),
          room: 'open-work',
          posture: 'seated',
        },
        {
          botId: 'business-strategist',
          targetNodeId: getDeskVisitorNodeId('lead-finder'),
          room: 'open-work',
          posture: 'standing',
          walkSpeech: `Checking ${candidate.shortName} with Lead Finder...`,
        },
        {
          botId: 'content-creator',
          targetNodeId: getDeskVisitorNodeId('business-strategist'),
          room: 'open-work',
          posture: 'standing',
          walkSpeech: `Listening in on ${candidate.shortName} positioning...`,
        },
      ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'business-strategist',
          roleTag: 'idea',
          bubbleText: `Wrapping candidate ${stepNumber}/${focus.targetCount}: ${candidate.shortName}.`,
          fullText: `Final evaluation (${stepNumber} of ${focus.targetCount}) for Today's focus: ${candidate.businessName}. Sample flow: "${candidate.sampleInquiryFlow}".`,
        },
        {
          id: `t-${idSuffix}-2`,
          speaker: 'lead-finder',
          roleTag: 'fact',
          bubbleText: `${candidate.shortName} leaves urgent quotes in a shared inbox.`,
          fullText: `Observed inquiry problem at ${candidate.shortName}: ${candidate.observedProblem}`,
        },
        {
          id: `t-${idSuffix}-3`,
          speaker: 'content-creator',
          roleTag: 'decision',
          bubbleText: `Consistent pattern — branded inquiry page + instant notifications wins.`,
          fullText: `This confirms the exact messaging pattern across the batch: a branded inquiry page, clear owner tracker, and instant notifications solve the leak directly. Lead Finder, save ${candidate.shortName} to complete the focus.`,
        },
      ],
      whiteboardLines: [],
      decisions: [
        `Evaluated ${candidate.shortName} (${candidate.location}): ${candidate.observedProblem}`,
        `Suggested Rhymvex offer: ${candidate.suggestedOffer}`,
      ],
      nextSteps: [
        {
          botId: 'lead-finder',
          task: `Save evaluated lead record for ${candidate.shortName} and update Today's focus progress`,
        },
      ],
      followUp: {
        kind: 'save-lead-evaluation',
        owner: 'lead-finder',
        workNodeId: getDeskNodeId('lead-finder'),
        workRoom: 'open-work',
        focusId: focus.id,
        candidateKey: candidate.key,
        candidate: leadCandidate,
      },
    };
  }

  /* --------- Non-lead focuses (content-draft, strategy-brief, project-task) -------- */
  const idSuffix = `focus-${focus.id.slice(-5)}-${stepNumber}`;

  if (focus.workKind === 'content-draft') {
    const audience = focus.targetAudience || 'local service business owners';
    const angles = [
      'Why generic contact links lose warm evening quotes',
      'Replacing scattered DMs and notes with a simple Owner Tracker',
      'How instant owner notifications save urgent service inquiries',
    ];
    const angle = angles[stepIndex % angles.length];
    return {
      id: `conv-${idSuffix}`,
      focusId: focus.id,
      format: 'pair',
      venue: 'desk-side',
      title: `Focus Draft ${stepNumber}/${focus.targetCount}: ${angle.slice(0, 42)}`,
      attendees: ['business-strategist', 'content-creator'],
      positions: [
        {
          botId: 'content-creator',
          targetNodeId: getDeskNodeId('content-creator'),
          room: 'open-work',
          posture: 'seated',
        },
        {
          botId: 'business-strategist',
          targetNodeId: getDeskVisitorNodeId('content-creator'),
          room: 'open-work',
          posture: 'standing',
          walkSpeech: `Briefing Content Creator on draft ${stepNumber}/${focus.targetCount}...`,
        },
      ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'business-strategist',
          roleTag: 'idea',
          bubbleText: `Draft ${stepNumber}/${focus.targetCount} for Today's focus: ${angle.slice(0, 38)}...`,
          fullText: `For Today's focus ("${focus.goal}"), let's write draft ${stepNumber} targeting ${audience} around: "${angle}".`,
        },
        {
          id: `t-${idSuffix}-2`,
          speaker: 'content-creator',
          roleTag: 'decision',
          bubbleText: 'On it — heading to Content Studio to draft and save it.',
          fullText: `Got it. I will walk to Content Studio, write the post with a clear hook and practical CTA, and save it cleanly as a completed internal draft.`,
        },
      ],
      whiteboardLines: [],
      decisions: [
        `Draft ${stepNumber}/${focus.targetCount} angle locked: ${angle}.`,
      ],
      nextSteps: [
        {
          botId: 'content-creator',
          task: `Draft and save "${angle}" in Content Queue`,
        },
      ],
      followUp: {
        kind: 'draft-content-post',
        owner: 'content-creator',
        workNodeId: CONTENT_STUDIO_SPOT.nodeId,
        workRoom: 'content-studio',
        focusId: focus.id,
        topic: `${audience}: ${angle}`,
        offer: 'Branded Inquiry Page + Owner Tracker',
        hook: `${angle} (Focus #${stepNumber}).`,
        body: `For ${audience}, the fastest revenue win is rarely more ads — it is fixing the inquiry leak already sitting on the website.\n\nA branded inquiry page, simple Owner Tracker, and instant owner notification eliminate lost evening quotes without complex software.`,
        cta: 'Reply "TRACKER" for a 2-minute inquiry workflow sketch.',
      },
    };
  }

  if (focus.workKind === 'strategy-brief') {
    const niche = focus.targetAudience || 'Local Service Operators';
    return {
      id: `conv-${idSuffix}`,
      focusId: focus.id,
      format: 'solo',
      venue: 'whiteboard',
      title: `Focus Strategy ${stepNumber}/${focus.targetCount}: ${niche}`,
      attendees: ['business-strategist'],
      positions: [
        {
          botId: 'business-strategist',
          targetNodeId: WHITEBOARD_HUDDLE_SPOTS[1].nodeId,
          room: 'meeting-room',
          posture: 'standing',
          walkSpeech: `Mapping strategy brief ${stepNumber}/${focus.targetCount}...`,
        },
      ],
      turns: [
        {
          id: `t-${idSuffix}-1`,
          speaker: 'business-strategist',
          roleTag: 'hypothesis',
          bubbleText: `Evaluating angle ${stepNumber}/${focus.targetCount} for ${niche}.`,
          fullText: `Working on Today's focus ("${focus.goal}"): synthesizing workspace patterns into experiment brief ${stepNumber} for ${niche}.`,
        },
      ],
      whiteboardLines: [
        `FOCUS STRATEGY ${stepNumber}/${focus.targetCount}`,
        `NICHE: ${niche}`,
        `GOAL: ${focus.goal.slice(0, 42)}`,
      ],
      decisions: [
        `Saved focus experiment brief ${stepNumber}/${focus.targetCount} for ${niche}.`,
      ],
      nextSteps: [
        {
          botId: 'business-strategist',
          task: `Save experiment brief ${stepNumber} for ${niche}`,
        },
      ],
      followUp: {
        kind: 'save-strategy-experiment',
        owner: 'business-strategist',
        workNodeId: getDeskNodeId('business-strategist'),
        workRoom: 'open-work',
        focusId: focus.id,
        niche,
        serviceIdea: `Inquiry & Owner Tracker Sprint #${stepNumber}`,
        hypothesis: `Focused experiment #${stepNumber} aligned to "${focus.goal}" for ${niche}.`,
        evidence: [`Today's focus goal: ${focus.goal}`],
        constraint: 'Keep delivery within 2 weeks with Owner Handoff runbook.',
      },
    };
  }

  // project-task
  const targetProject = state.projects[0];
  return {
    id: `conv-${idSuffix}`,
    focusId: focus.id,
    format: 'pair',
    venue: 'desk-side',
    title: `Focus Task ${stepNumber}/${focus.targetCount}: Delivery Follow-Up`,
    attendees: ['business-strategist', 'project-tracker'],
    positions: [
      {
        botId: 'project-tracker',
        targetNodeId: getDeskNodeId('project-tracker'),
        room: 'open-work',
        posture: 'seated',
      },
      {
        botId: 'business-strategist',
        targetNodeId: getDeskVisitorNodeId('project-tracker'),
        room: 'open-work',
        posture: 'standing',
        walkSpeech: `Checking focus task ${stepNumber}/${focus.targetCount} with Projects...`,
      },
    ],
    turns: [
      {
        id: `t-${idSuffix}-1`,
        speaker: 'business-strategist',
        roleTag: 'idea',
        bubbleText: `Adding focus task ${stepNumber}/${focus.targetCount} to active delivery.`,
        fullText: `Aligning Today's focus ("${focus.goal}") with delivery: let's add concrete task #${stepNumber} to ${targetProject?.title || 'the active project'}.`,
      },
      {
        id: `t-${idSuffix}-2`,
        speaker: 'project-tracker',
        roleTag: 'decision',
        bubbleText: 'Adding it to the project task list now.',
        fullText: `Logged. Saving the focus follow-up task cleanly inside Project Tracker.`,
      },
    ],
    whiteboardLines: [],
    decisions: [
      `Added focus delivery task ${stepNumber}/${focus.targetCount} to ${targetProject?.title || 'active project'}.`,
    ],
    nextSteps: [
      {
        botId: 'project-tracker',
        task: `Save focus delivery task #${stepNumber}`,
      },
    ],
    followUp: {
      kind: 'add-project-task',
      owner: 'project-tracker',
      workNodeId: getDeskNodeId('project-tracker'),
      workRoom: 'open-work',
      focusId: focus.id,
      projectId: targetProject?.id,
      taskTitle: `Focus #${stepNumber}: ${focus.goal.slice(0, 56)}`,
      taskOwner: 'Delivery Lead',
    },
  };
}
