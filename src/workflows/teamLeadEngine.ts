import type {
  ActivityEvent,
  ContentQueueRecord,
  LeadRecord,
  LinkedArtifactRef,
  ReviewDecisionOption,
  ReviewItem,
  RunnerMode,
  WorkspaceState,
} from '../types/workspace';

function formatStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function makeTeamLeadActivity(
  action: string,
  detail: string,
  artifactRef?: LinkedArtifactRef
): ActivityEvent {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: formatStamp(),
    botId: 'business-strategist',
    action,
    detail,
    artifactRef,
  };
}

export const TEAM_LEAD_BOT_ID = 'business-strategist' as const;

export const SAMPLE_CLEANING_OUTREACH_PROMPT =
  'Find three cleaning businesses and draft outreach';

export interface ShortlistEvaluationResult {
  decision: 'approve' | 'request-revision';
  missingLeads: LeadRecord[];
  targetBot: 'lead-finder' | 'content-creator';
  instruction?: string;
  summary: string;
}

export interface OutreachDraftEvaluationResult {
  approvedInternal: boolean;
  requiresOwnerDecision: boolean;
  targetBot: 'content-creator' | 'business-strategist';
  instruction?: string;
  summary: string;
  decisionCard?: ReviewItem;
}

/**
 * Recognizes multi-step lead research + outreach drafting assignments that should run
 * through the autonomous Team Lead review & escalation loop.
 */
export function isLeadOutreachPipelinePrompt(rawPrompt: string): boolean {
  const lower = rawPrompt.trim().toLowerCase();
  if (!lower) return false;
  const asksToFindLeads =
    /\b(find|research|source|shortlist|identify)\b/.test(lower) &&
    /\b(business|businesses|lead|leads|cleaning|prospect|prospects|client|clients)\b/.test(
      lower
    );
  const asksToDraftOutreach =
    /\b(draft|write|prepare)\b/.test(lower) &&
    /\b(outreach|message|messages|email|emails|follow-up|followup)\b/.test(lower);
  return asksToFindLeads && asksToDraftOutreach;
}

/**
 * Produces 3 clearly labeled fictional cleaning businesses for the sample assignment.
 * Entry #2 intentionally starts without a verified booking/source URL so Team Lead's
 * automated audit catches a real gap and triggers an automatic Lead Finder revision.
 */
export function buildCleaningOutreachCandidates(
  assignmentId: string,
  savedAt: string
): Array<{
  lead: LeadRecord;
  verifiedSourceUrl: string;
  shortName: string;
}> {
  return [
    {
      shortName: 'Harbourside Home Sparkle',
      verifiedSourceUrl: 'https://harbourside-sparkle.example/book-clean',
      lead: {
        id: `lead-${assignmentId}-1`,
        businessName: 'Harbourside Home Sparkle (Fictional)',
        industry: 'Residential Cleaning',
        location: 'Sydney, NSW (Fictional)',
        targetClient: 'Busy residential households',
        serviceOffered: 'Branded Inquiry Form & Owner Job Tracker',
        observedProblem:
          'Homeowners submit quotes via a generic contact box with no bedroom/bathroom count, causing 4+ back-and-forth texts before booking.',
        suggestedOffer:
          'Branded 60-second Cleaning Inquiry Page + instant SMS/email owner notification & job tracker.',
        outreachAngle:
          'Cut quote back-and-forth by capturing property size and preferred slot on the first inquiry.',
        outreachDraft: '',
        sampleInquiryFlow:
          'Website form -> manual email inbox -> evening callback -> spreadsheet',
        sourceUrl: 'https://harbourside-sparkle.example/book-clean',
        sourceVerified: true,
        tags: ['cleaning-services', 'verified-source', 'outreach-batch'],
        savedAt,
        status: 'saved',
        assignmentId,
        teamLeadReviewStatus: 'pending',
        isDemo: false,
      },
    },
    {
      shortName: 'Bayside Eco Cleans',
      verifiedSourceUrl: 'https://bayside-ecocleans.example/quote-request',
      lead: {
        id: `lead-${assignmentId}-2`,
        businessName: 'Bayside Eco Cleans (Fictional)',
        industry: 'Residential Cleaning',
        location: 'Melbourne, VIC (Fictional)',
        targetClient: 'Recurring eco-friendly home cleaning clients',
        serviceOffered: 'Branded Inquiry Form & Owner Job Tracker',
        observedProblem:
          'Recurring clean inquiries land in Instagram DMs and voicemail with no central tracker, so weekend leads often wait 36 hours.',
        suggestedOffer:
          'Unified Branded Inquiry Link for web & Instagram bio with instant owner alert and recurring schedule tracker.',
        outreachAngle:
          'Capture weekend recurring leads in one place and reply in under 5 minutes without living in DMs.',
        outreachDraft: '',
        sampleInquiryFlow:
          'Instagram DM + voicemail -> manual notes -> delayed quote reply',
        // Intentionally blank on first submission so Team Lead's real audit requests verification
        sourceUrl: '',
        sourceVerified: false,
        tags: ['cleaning-services', 'needs-source-check', 'outreach-batch'],
        savedAt,
        status: 'saved',
        assignmentId,
        teamLeadReviewStatus: 'pending',
        isDemo: false,
      },
    },
    {
      shortName: 'Cedar & Pine Home Care',
      verifiedSourceUrl: 'https://cedarpine-homecare.example/inquiry',
      lead: {
        id: `lead-${assignmentId}-3`,
        businessName: 'Cedar & Pine Home Care (Fictional)',
        industry: 'Residential Cleaning',
        location: 'Brisbane, QLD (Fictional)',
        targetClient: 'End-of-lease and deep-clean homeowners',
        serviceOffered: 'Branded Inquiry Form & Owner Job Tracker',
        observedProblem:
          'End-of-lease inquiries arrive via PDF checklist attachments with missing access details, delaying crew assignment.',
        suggestedOffer:
          'Guided Bond-Clean Intake Form + automatic crew-ready summary and Owner Job Tracker.',
        outreachAngle:
          'Collect room count, inspection date, and access notes upfront so crews never chase missing details.',
        outreachDraft: '',
        sampleInquiryFlow:
          'PDF attachment email -> manual re-typing -> crew SMS handoff',
        sourceUrl: 'https://cedarpine-homecare.example/inquiry',
        sourceVerified: true,
        tags: ['cleaning-services', 'verified-source', 'outreach-batch'],
        savedAt,
        status: 'saved',
        assignmentId,
        teamLeadReviewStatus: 'pending',
        isDemo: false,
      },
    },
  ];
}

/**
 * Team Lead inspects the ACTUAL submitted lead shortlist against the brief and evidence:
 * - Every lead must have a specific observedProblem, suggestedOffer, AND verified sourceUrl.
 * - If anything is missing or unverified, Team Lead returns an exact revision instruction
 *   to Lead Finder so they fix and resubmit automatically.
 */
export function evaluateLeadShortlist(
  leads: LeadRecord[]
): ShortlistEvaluationResult {
  if (leads.length === 0) {
    return {
      decision: 'request-revision',
      missingLeads: [],
      targetBot: 'lead-finder',
      instruction: 'Add at least 3 cleaning businesses with verified inquiry sources.',
      summary: 'Team Lead requested 3 researched leads before outreach drafting.',
    };
  }

  const missingLeads = leads.filter(
    (lead) =>
      !lead.sourceVerified ||
      !lead.sourceUrl ||
      !lead.sourceUrl.trim() ||
      !lead.observedProblem.trim() ||
      !lead.suggestedOffer.trim()
  );

  if (missingLeads.length > 0) {
    const names = missingLeads
      .map((l) => l.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim())
      .join(', ');
    return {
      decision: 'request-revision',
      missingLeads,
      targetBot: 'lead-finder',
      instruction: `Verify the booking/source link for ${names} and resubmit.`,
      summary: `Team Lead asked Lead Finder to verify the booking link for ${names}.`,
    };
  }

  return {
    decision: 'approve',
    missingLeads: [],
    targetBot: 'content-creator',
    summary: `Team Lead approved the shortlist (${leads.length} verified leads) and assigned Content Creator to draft the follow-up.`,
  };
}

/**
 * Builds a concrete, editable outreach draft record directly tied to a saved approved LeadRecord.
 */
export function buildOutreachDraftForLead(
  lead: LeadRecord,
  assignmentId: string,
  index: number,
  savedAt: string,
  revisionInstruction?: string
): ContentQueueRecord {
  const cleanName = lead.businessName
    .replace(/\s*\(Fictional[^)]*\)/gi, '')
    .trim();
  const extraLine = revisionInstruction
    ? `\n\nNote included per your instruction: ${revisionInstruction}`
    : '';

  return {
    id: `cnt-${assignmentId}-${index + 1}`,
    platform: 'Email Newsletter',
    topic: `Outreach to ${cleanName}`,
    offer: lead.suggestedOffer,
    tone: 'Helpful, direct & specific',
    variantLabel: `Outreach ${index + 1} of 3 · ${cleanName}`,
    hook: `Quick idea for ${cleanName}'s inquiry flow`,
    body: `Hi ${cleanName} team,\n\nI checked your booking flow (${lead.sourceUrl || 'site inquiry form'}) and noticed: ${lead.observedProblem}\n\nAt Rhymvex we build a lightweight ${lead.suggestedOffer} so you capture property details upfront and keep every quote in one owner tracker.${extraLine}`,
    callToAction:
      'Reply "DEMO" if you would like a 90-second walkthrough tailored to your cleaning team.',
    savedAt,
    queueStatus: 'completed',
    assignmentId,
    recipientLeadId: lead.id,
    recipientBusinessName: lead.businessName,
    teamLeadReviewStatus: 'pending',
    deliveryStatus: 'draft',
    isDemo: false,
  };
}

const OUTREACH_DECISION_OPTIONS: ReviewDecisionOption[] = [
  {
    id: 'approve-send',
    label: 'Send all 3 outreach messages (Simulated)',
    description:
      'Team Lead dispatches all 3 approved messages in simulation mode and logs delivery on the project board.',
    action: 'approve-send',
  },
  {
    id: 'save-drafts-only',
    label: 'Keep as approved drafts only',
    description:
      'Keep all 3 messages approved in Content Queue without sending externally.',
    action: 'save-drafts-only',
  },
  {
    id: 'hold',
    label: 'Hold for later',
    description: 'Pause outreach delivery for now without deleting the saved drafts.',
    action: 'hold',
  },
];

/**
 * Team Lead inspects the ACTUAL submitted outreach drafts against the approved shortlist.
 * - Approves complete drafts internally.
 * - Escalates ONE grouped owner decision card ("Send these three outreach messages?")
 *   when sending externally is not pre-authorized.
 */
export function evaluateOutreachDrafts(
  drafts: ContentQueueRecord[],
  approvedLeads: LeadRecord[],
  options: {
    assignmentId: string;
    mode: RunnerMode;
    createdAt: string;
    ownerPreAuthorizedSend?: boolean;
    revisionNumber?: number;
  }
): OutreachDraftEvaluationResult {
  const missingLead = approvedLeads.find(
    (lead) =>
      !drafts.some(
        (d) =>
          d.recipientLeadId === lead.id &&
          d.hook.trim().length > 0 &&
          d.body.trim().length > 0
      )
  );

  if (missingLead || drafts.length < approvedLeads.length) {
    const cleanName = missingLead
      ? missingLead.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim()
      : 'the approved shortlist';
    return {
      approvedInternal: false,
      requiresOwnerDecision: false,
      targetBot: 'content-creator',
      instruction: `Complete personalized outreach draft with hook and CTA for ${cleanName}.`,
      summary: `Team Lead asked Content Creator to complete the missing outreach draft for ${cleanName}.`,
    };
  }

  if (options.ownerPreAuthorizedSend) {
    return {
      approvedInternal: true,
      requiresOwnerDecision: false,
      targetBot: 'business-strategist',
      summary: `Team Lead approved all ${drafts.length} outreach drafts and proceeded with pre-authorized simulated delivery.`,
    };
  }

  const cleanNames = approvedLeads.map((l) =>
    l.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim()
  );
  const groupedTaskLabels = drafts.map((d, idx) => {
    const name =
      d.recipientBusinessName?.replace(/\s*\(Fictional[^)]*\)/gi, '').trim() ||
      cleanNames[idx] ||
      `Business ${idx + 1}`;
    return `Send outreach #${idx + 1} to ${name} — "${d.hook}"`;
  });

  const linkedArtifacts: LinkedArtifactRef[] = [
    ...drafts.map((d) => ({
      kind: 'content' as const,
      id: d.id,
      label: d.variantLabel,
      botId: 'content-creator' as const,
    })),
    ...approvedLeads.map((l) => ({
      kind: 'lead' as const,
      id: l.id,
      label: l.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim(),
      botId: 'lead-finder' as const,
    })),
  ];

  const decisionQuestion =
    drafts.length === 3
      ? 'Send these three outreach messages?'
      : `Send these ${drafts.length} outreach messages?`;

  const decisionCard: ReviewItem = {
    id: `rev-outreach-${options.assignmentId}`,
    dedupeKey: `owner-decision:send-outreach:${options.assignmentId}`,
    kind: 'high-impact-action',
    assignmentId: options.assignmentId,
    title: decisionQuestion,
    decisionQuestion,
    summary: `Team Lead verified ${approvedLeads.length} cleaning leads and approved all ${drafts.length} personalized outreach drafts internally. Sending messages externally requires your approval.`,
    whyNeeded:
      'Team Lead can approve internal research and drafts automatically, but sending outreach messages to external businesses requires your authorization.',
    recommendedOptionId: 'approve-send',
    recommendedLabel: 'Send all 3 outreach messages (Simulated)',
    options: OUTREACH_DECISION_OPTIONS,
    groupedTaskLabels,
    groupedContentIds: drafts.map((d) => d.id),
    escalationReason: 'external-authorization',
    decisionSummary: [
      `Lead Finder verified booking/source links for all ${approvedLeads.length} cleaning businesses (after fixing Bayside Eco Cleans).`,
      `Content Creator drafted ${drafts.length} tailored outreach messages using those saved leads.`,
      'Team Lead approved all drafts internally; only external sending is waiting on you.',
    ],
    deliverableText: drafts
      .map(
        (d, idx) =>
          `${idx + 1}. ${d.recipientBusinessName ?? d.topic}\nSubject: ${d.hook}\n${d.body}\nCTA: ${d.callToAction}`
      )
      .join('\n\n---\n\n'),
    linkedArtifacts,
    proposedAction: {
      actionType: 'send-external-message',
      targetLabel: cleanNames.join(', '),
      recipient: cleanNames
        .map(
          (n) =>
            `hello@${n.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example`
        )
        .join(', '),
      subject: `Tailored cleaning inquiry workflow ideas (${drafts.length} messages)`,
      channel: 'Outreach Email (Simulated)',
      bodyPreview: drafts
        .map((d, idx) => `[${idx + 1}] ${d.hook}: ${d.body.slice(0, 115)}...`)
        .join('\n'),
      recordId: drafts[0]?.id,
    },
    status: 'pending',
    createdAt: options.createdAt,
    revisionNumber: options.revisionNumber ?? 1,
    mode: options.mode,
  };

  return {
    approvedInternal: true,
    requiresOwnerDecision: true,
    targetBot: 'business-strategist',
    summary: `Team Lead approved ${drafts.length} outreach drafts internally — escalated one decision to Needs me ("${decisionQuestion}").`,
    decisionCard,
  };
}

/**
 * Automatically routes existing routine pending internal reviews already waiting
 * in the queue to the Team Lead while preserving:
 * - all decisions the owner has already made (approved / rejected)
 * - genuine owner-level escalations (high-impact external actions or explicit owner-judgment items).
 */
export function migrateRoutinePendingReviewsToTeamLead(
  state: WorkspaceState
): { state: WorkspaceState; migratedCount: number } {
  const routinePending = state.reviewQueue.filter(
    (item) =>
      item.status === 'pending' &&
      item.kind === 'final-deliverable' &&
      !item.escalationReason
  );

  if (routinePending.length === 0) {
    return { state, migratedCount: 0 };
  }

  const migratedIds = new Set(routinePending.map((r) => r.id));
  const migratedAssignmentIds = new Set(
    routinePending
      .map((r) => r.assignmentId)
      .filter((id): id is string => Boolean(id))
  );
  const stamp = formatStamp();

  const nextReviewQueue: ReviewItem[] = state.reviewQueue.map((item) =>
    migratedIds.has(item.id)
      ? {
          ...item,
          status: 'approved',
          resolvedAt: stamp,
          resolvedBy: 'team-lead',
          ownerChoiceLabel: 'Auto-approved by Team Lead',
        }
      : item
  );

  const nextAssignments = state.assignments.map((a) =>
    migratedAssignmentIds.has(a.id) && a.status === 'awaiting-review'
      ? { ...a, status: 'completed' as const }
      : a
  );

  const summaryTitles = routinePending.map((r) => r.title).join('; ');
  const migrationActivity = makeTeamLeadActivity(
    'Team Lead cleared routine reviews',
    `Team Lead automatically reviewed and approved ${routinePending.length} routine pending internal item${routinePending.length === 1 ? '' : 's'}: ${summaryTitles}.`,
    routinePending[0]?.linkedArtifacts[0]
  );

  return {
    migratedCount: routinePending.length,
    state: {
      ...state,
      reviewQueue: nextReviewQueue,
      assignments: nextAssignments,
      activity: [migrationActivity, ...state.activity],
    },
  };
}
