import type {
  BotId,
  ContentVariantDraft,
  LeadCandidate,
  MeetingTurn,
  ProjectMilestone,
  ProjectTask,
  StrategyExperimentDraft,
} from '../types/workspace';
import type {
  ApprovedActionInput,
  ApprovedActionOutput,
  BusinessStrategistInput,
  ClientUpdateInput,
  ContentCreatorInput,
  LeadFinderInput,
  MeetingBriefInput,
  MeetingBriefOutput,
  ProjectPlanInput,
  WorkflowError,
  WorkflowInputMap,
  WorkflowOutputMap,
  WorkflowResponse,
  WorkflowResult,
  WorkflowRunner,
} from './runner';

function makeRunId(prefix: string): string {
  return `sim-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

function formatDateOffset(daysFromBase: number): string {
  const base = new Date('2026-11-23T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + daysFromBase);
  return base.toISOString().slice(0, 10);
}

function timeStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface SimulationRunnerOptions {
  /** Simulated execution latency in milliseconds (set to 0 in unit tests). */
  delayMs?: number;
}

/**
 * Local simulation implementation of `WorkflowRunner`.
 * Produces deterministic, input-responsive leads, Business Strategist experiments,
 * project plans, content drafts, meeting decisions, and post-approval simulated actions.
 */
export class LocalSimulationRunner implements WorkflowRunner {
  readonly mode = 'simulation' as const;
  readonly label = 'Simulation';
  private readonly delayMs: number;

  constructor(options: SimulationRunnerOptions = {}) {
    this.delayMs = options.delayMs ?? 340;
  }

  async run<TBot extends BotId>(
    botId: TBot,
    input: WorkflowInputMap[TBot]
  ): Promise<WorkflowResponse<WorkflowOutputMap[TBot]>> {
    const runId = makeRunId(botId);
    const start = Date.now();

    if (botId === 'lead-finder') {
      return this.runLeadFinder(
        runId,
        input as LeadFinderInput,
        start
      ) as Promise<WorkflowResponse<WorkflowOutputMap[TBot]>>;
    }

    if (botId === 'business-strategist') {
      return this.runBusinessStrategist(
        runId,
        input as BusinessStrategistInput,
        start
      ) as Promise<WorkflowResponse<WorkflowOutputMap[TBot]>>;
    }

    if (botId === 'project-tracker') {
      return this.runProjectTracker(
        runId,
        input as ProjectPlanInput | ClientUpdateInput,
        start
      ) as Promise<WorkflowResponse<WorkflowOutputMap[TBot]>>;
    }

    return this.runContentCreator(
      runId,
      input as ContentCreatorInput,
      start
    ) as Promise<WorkflowResponse<WorkflowOutputMap[TBot]>>;
  }

  async runMeetingBrief(
    input: MeetingBriefInput
  ): Promise<WorkflowResponse<MeetingBriefOutput>> {
    const runId = makeRunId('meeting');
    const start = Date.now();
    await sleep(Math.min(this.delayMs, 220));

    const industry = cleanText(input.industry) || 'Service Businesses';
    const location = cleanText(input.location) || 'Austin, TX';
    const isCleaning = /clean|janitor|maid/i.test(industry + ' ' + input.title);

    const leadPreview =
      input.leadNames.length > 0
        ? input.leadNames.slice(0, 3).join(', ')
        : `3 fictional ${industry.toLowerCase()} businesses in ${location}`;

    const recommendedDeliverables = isCleaning
      ? [
          'Branded online quote & inquiry form',
          'Owner job tracker & crew status board',
          'Automated booking confirmation & review follow-up',
          'Owner handoff & staff walkthrough milestone',
        ]
      : [
          `Branded ${industry.toLowerCase()} inquiry & intake form`,
          'Owner operations tracker & exception queue',
          'Automated status notifications & audit log',
          'Client handoff & operator runbook milestone',
        ];

    const recommendedBudget = isCleaning ? '$6,500' : '$9,500';
    const recommendedTimeline = isCleaning ? '3 weeks' : '4 weeks';

    const turns: MeetingTurn[] = [
      {
        id: `turn-${runId}-1`,
        speaker: 'lead-finder',
        roleTag: 'fact',
        bubbleText: isCleaning
          ? 'Found 3 fictional cleaning firms losing quotes in voicemails.'
          : `Brought 3 fictional ${industry.toLowerCase()} prospects in ${location}.`,
        fullText: `I researched three fictional ${industry.toLowerCase()} prospects in ${location}: ${leadPreview}. All three lose inbound quotes between phone calls, text messages, and scattered spreadsheets.`,
        timestamp: timeStamp(),
      },
      {
        id: `turn-${runId}-2`,
        speaker: 'business-strategist',
        roleTag: 'idea',
        bubbleText: isCleaning
          ? 'Test a branded inquiry form + owner tracker offer ($6.5k).'
          : `Test ${input.service} as a fixed-scope sprint (${recommendedBudget}).`,
        fullText: isCleaning
          ? `Strategically, a fixed-scope experiment is our cleanest wedge: pair a branded inquiry form for instant quote requests with a lightweight owner job tracker (${recommendedBudget}, ${recommendedTimeline}) and validate demand with a 1-page teardown.`
          : `I recommend positioning ${input.service} as a repeatable ${recommendedTimeline} sprint at ${recommendedBudget}, focused on eliminating manual inquiry follow-up gaps before expanding scope.`,
        timestamp: timeStamp(),
      },
      {
        id: `turn-${runId}-3`,
        speaker: 'project-tracker',
        roleTag: 'concern',
        bubbleText: 'Constraint: build needs an Owner Handoff milestone.',
        fullText: `Flagging a delivery risk before we test this offer: small ${industry.toLowerCase()} teams stall without structured onboarding. We must include an explicit Owner Handoff & Runbook milestone before launch.`,
        timestamp: timeStamp(),
      },
    ];

    if (input.includePromoPost && input.attendees.includes('content-creator')) {
      turns.push({
        id: `turn-${runId}-4`,
        speaker: 'content-creator',
        roleTag: 'handoff',
        bubbleText: 'I will draft a matching promo post in the studio.',
        fullText: `I will carry that exact positioning — branded inquiry form, owner tracker, and guided handoff — into a LinkedIn promotional post draft in the Content Studio for review.`,
        timestamp: timeStamp(),
      });
    }

    turns.push({
      id: `turn-${runId}-decision`,
      speaker: 'business-strategist',
      roleTag: 'decision',
      bubbleText: 'Agreed — logging experiment & milestones at desks now.',
      fullText: `Decision locked: Lead Finder saves the 3 fictional prospects, Business Strategist documents the ${recommendedBudget} / ${recommendedTimeline} service experiment brief, and Project Tracker generates the delivery outline with the Owner Handoff milestone.`,
      timestamp: timeStamp(),
    });

    const decisions = [
      `Target niche: 3 fictional ${industry.toLowerCase()} prospects (${location})`,
      isCleaning
        ? 'Offer experiment: Branded inquiry form + owner tracker ($6,500 · 3 weeks)'
        : `Offer experiment: ${input.service} (${recommendedBudget} · ${recommendedTimeline})`,
      'Delivery guardrail: Mandatory Owner Handoff & Runbook milestone included',
      ...(input.includePromoPost
        ? ['Marketing: Draft matching promotional post in Content Studio']
        : []),
    ];

    const whiteboardLines = [
      `MEETING: ${input.title.toUpperCase().slice(0, 36)}`,
      `1. LEADS: 3 fictional ${industry} (${location})`,
      isCleaning
        ? '2. OFFER: Inquiry Form + Owner Tracker ($6.5k)'
        : `2. OFFER: ${input.service.slice(0, 38)}`,
      '3. CONSTRAINT: Add Owner Handoff milestone',
      input.includePromoPost
        ? '4. OWNERS: Desks + Studio -> 1 Final Review'
        : '4. OWNERS: Desks -> Save Auto -> 1 Review',
    ];

    const nextSteps: Array<{ botId: BotId; task: string }> = [
      {
        botId: 'lead-finder',
        task: `Save 3 fictional ${industry.toLowerCase()} prospects to pipeline`,
      },
      {
        botId: 'business-strategist',
        task: `Record structured service experiment brief (${recommendedBudget}, ${recommendedTimeline})`,
      },
      {
        botId: 'project-tracker',
        task: 'Create project outline with Owner Handoff milestone',
      },
      ...(input.includePromoPost
        ? [
            {
              botId: 'content-creator' as BotId,
              task: 'Draft promotional post using agreed offer positioning',
            },
          ]
        : []),
    ];

    return {
      ok: true,
      runId,
      botId: 'business-strategist',
      mode: this.mode,
      durationMs: Math.max(10, Date.now() - start),
      summary: `Meeting concluded with ${decisions.length} recorded decisions and ${nextSteps.length} desk handoffs.`,
      output: {
        title: input.title,
        turns,
        whiteboardLines,
        decisions,
        nextSteps,
        recommendedDeliverables,
        recommendedBudget,
        recommendedTimeline,
      },
    };
  }

  async executeApprovedAction(
    input: ApprovedActionInput
  ): Promise<WorkflowResponse<ApprovedActionOutput>> {
    const runId = makeRunId('approved');
    const start = Date.now();
    await sleep(Math.min(this.delayMs, 240));

    const summaryByType: Record<ApprovedActionInput['action']['actionType'], string> = {
      'send-external-message': `Simulated send recorded to ${input.action.recipient || input.action.targetLabel} — Subject: "${input.action.subject || input.action.targetLabel}".`,
      'publish-content': `Simulated publish recorded on ${input.action.channel || 'channel'} for "${input.action.targetLabel}".`,
      'commit-price-deadline': `Simulated price/deadline commitment recorded for "${input.action.targetLabel}" (${input.action.priceOrDeadline || 'approved terms'}).`,
      'delete-record': `Simulated deletion recorded for "${input.action.targetLabel}".`,
    };

    const log = {
      id: `exec-${runId}`,
      reviewItemId: input.reviewItemId,
      actionType: input.action.actionType,
      targetLabel: input.action.targetLabel,
      summary: summaryByType[input.action.actionType],
      executedAt: timeStamp(),
      mode: this.mode,
    };

    return {
      ok: true,
      runId,
      botId:
        input.action.actionType === 'publish-content'
          ? 'content-creator'
          : 'business-strategist',
      mode: this.mode,
      durationMs: Math.max(10, Date.now() - start),
      summary: log.summary,
      output: { log },
    };
  }

  private validationError(
    runId: string,
    botId: BotId,
    fieldErrors: Record<string, string>,
    message = 'Please fill in the required fields before running the simulation.'
  ): WorkflowError {
    return {
      ok: false,
      runId,
      botId,
      mode: this.mode,
      code: 'VALIDATION_ERROR',
      message,
      fieldErrors,
      retryable: true,
    };
  }

  private async runLeadFinder(
    runId: string,
    input: LeadFinderInput,
    start: number
  ): Promise<WorkflowResponse<WorkflowOutputMap['lead-finder']>> {
    const industry = cleanText(input.industry);
    const location = cleanText(input.location);
    const targetClient = cleanText(input.targetClient);
    const service = cleanText(input.service);

    const fieldErrors: Record<string, string> = {};
    if (!industry) fieldErrors.industry = 'Industry is required.';
    if (!location) fieldErrors.location = 'Location is required.';
    if (!targetClient)
      fieldErrors.targetClient = 'Target client profile is required.';
    if (!service) fieldErrors.service = 'Rhymvex service to offer is required.';

    if (Object.keys(fieldErrors).length > 0) {
      return this.validationError(runId, 'lead-finder', fieldErrors);
    }

    await sleep(this.delayMs);

    const cityToken = location.split(',')[0].trim() || location;
    const isCleaning = /clean|janitor|maid/i.test(industry);
    const shortIndustry = industry.split(/\s+/).slice(0, 2).join(' ');

    const names = isCleaning
      ? [
          `Sparkleaf Home & Office Cleaning (Fictional)`,
          `Brightlane Eco Cleaning Co. (Fictional)`,
          `Broom & Beacon Janitorial (Fictional)`,
        ]
      : [
          `Northbridge ${shortIndustry} Group (Fictional)`,
          `Alder & Loom ${shortIndustry} Co. (Fictional)`,
          `Cedarline ${shortIndustry} Partners (Fictional)`,
        ];

    const leads: LeadCandidate[] = [
      {
        id: `cand-${runId}-1`,
        businessName: names[0],
        industry,
        location,
        targetClient,
        serviceOffered: service,
        observedProblem: isCleaning
          ? `Owners in ${cityToken} still quote new residential and commercial jobs via scattered phone voicemails and text messages, losing same-day inquiries.`
          : `Operations team at this ${targetClient.toLowerCase()} in ${cityToken} still reconciles intake forms and client handoffs manually across spreadsheets, causing 24-48h response delays.`,
        suggestedOffer: `${service} sprint: unify intake, webhook routing, and live status notifications in 3 weeks.`,
        outreachAngle: `Lead with a 4-minute Loom teardown showing how ${cityToken} ${industry.toLowerCase()} teams cut manual intake time by 60% without replacing their core tools.`,
        outreachDraft: `Hi team at ${names[0].replace(' (Fictional)', '')} — noticed how ${targetClient.toLowerCase()} teams in ${location} often lose hours copying inquiry details between texts, forms, and internal trackers. At Rhymvex, we build practical ${service.toLowerCase()} workflows tailored to ${industry.toLowerCase()} ops. Open to a 10-minute walkthrough next week?`,
      },
      {
        id: `cand-${runId}-2`,
        businessName: names[1],
        industry,
        location,
        targetClient,
        serviceOffered: service,
        observedProblem: `Client onboarding and status updates for their ${location} ${industry.toLowerCase()} accounts require repeated manual follow-ups, creating inconsistent handoffs between sales and delivery.`,
        suggestedOffer: `Fixed-scope ${service} blueprint + automated onboarding portal built specifically for ${targetClient.toLowerCase()}.`,
        outreachAngle: `Share a concrete before/after architecture diagram focused on eliminating status-chasing emails and protecting delivery margin.`,
        outreachDraft: `Hello ${names[1].replace(' (Fictional)', '')} team — we work with ${targetClient.toLowerCase()} in ${industry.toLowerCase()} to turn repetitive onboarding and reporting steps into reliable software. If ${service.toLowerCase()} is on your radar this quarter, happy to send over a 1-page architecture sketch.`,
      },
      {
        id: `cand-${runId}-3`,
        businessName: names[2],
        industry,
        location,
        targetClient,
        serviceOffered: service,
        observedProblem: `Leadership lacks a single view of active ${industry.toLowerCase()} pipeline, billing milestones, and fulfillment bottlenecks across their ${cityToken} operations.`,
        suggestedOffer: `Lightweight custom ${service} workspace with automated alerts, audit logs, and client-ready weekly reporting.`,
        outreachAngle: `Position Rhymvex as a senior engineering & automation partner offering a low-risk 2-week discovery prototype before full rollout.`,
        outreachDraft: `Hi ${names[2].replace(' (Fictional)', '')} — reaching out from Rhymvex. We help ${targetClient.toLowerCase()} in ${location} ship focused ${service.toLowerCase()} systems that give founders clear visibility without bloated enterprise software. Worth a quick chat?`,
      },
    ];

    const result: WorkflowResult<WorkflowOutputMap['lead-finder']> = {
      ok: true,
      runId,
      botId: 'lead-finder',
      mode: this.mode,
      durationMs: Math.max(12, Date.now() - start),
      summary: `Generated 3 fictional ${industry} prospects in ${location} for ${service}.`,
      output: {
        leads,
        querySummary: `${industry} · ${location} · ${targetClient} · ${service}`,
      },
    };
    return result;
  }

  private async runBusinessStrategist(
    runId: string,
    input: BusinessStrategistInput,
    start: number
  ): Promise<WorkflowResponse<WorkflowOutputMap['business-strategist']>> {
    const niche = cleanText(input.niche);
    const serviceIdea = cleanText(input.serviceIdea);
    const workspaceContext = cleanText(input.workspaceContext || '');
    const constraint =
      cleanText(input.targetConstraint || '') ||
      'Keep first implementation under 3 weeks with a mandatory Owner Handoff milestone.';

    const fieldErrors: Record<string, string> = {};
    if (!niche) fieldErrors.niche = 'Target niche is required.';
    if (!serviceIdea) fieldErrors.serviceIdea = 'Service idea is required.';

    if (Object.keys(fieldErrors).length > 0) {
      return this.validationError(runId, 'business-strategist', fieldErrors);
    }

    await sleep(this.delayMs);

    const leadEvidence =
      input.sourceLeadNames && input.sourceLeadNames.length > 0
        ? input.sourceLeadNames.map(
            (name) => `Workspace lead signal: ${name} shows manual inquiry & tracking leakage.`
          )
        : [
            `Observed niche pattern in ${niche}: inbound inquiries sit untracked across email, voicemails, and spreadsheets.`,
          ];

    if (workspaceContext) {
      leadEvidence.push(`Workspace notes: ${workspaceContext}`);
    }

    const revSuffix = input.revisionNote
      ? ` (Revised per feedback: ${cleanText(input.revisionNote)})`
      : '';

    const isCleaning = /clean|janitor|maid/i.test(niche + ' ' + serviceIdea);
    const priceBand = isCleaning ? '$6,500 fixed (3 weeks)' : '$7,500 – $10,500 (3 weeks)';

    const experiment: StrategyExperimentDraft = {
      title: `${niche}: ${serviceIdea.slice(0, 48)}${revSuffix}`,
      niche,
      serviceIdea,
      hypothesis: `If Rhymvex packages "${serviceIdea}" specifically for ${niche} with a transparent 1-page interactive prototype and built-in Owner Handoff milestone, decision-makers will approve a paid pilot without requiring a long custom scoping cycle.${revSuffix}`,
      evidenceFromWorkspace: leadEvidence,
      experimentPlan: [
        `Build a 1-page clickable intake & tracker demo tailored to ${niche} terminology.`,
        `Share targeted before/after workflow teardowns with 3 fictional benchmark accounts before building reusable templates.`,
        `Capture delivery friction up front (credentials, staging tokens, staff walkthrough) in Project Tracker.`,
      ],
      successMetric: `>= 2 qualified walkthrough replies and 1 pilot kickoff agreement within 14 days.`,
      estimatedPriceRange: priceBand,
      deliveryConstraint: constraint,
      nextStepOwner: 'content-creator',
      nextStepAction: `Draft a practical breakdown post about "${serviceIdea}" for ${niche} operators.`,
    };

    return {
      ok: true,
      runId,
      botId: 'business-strategist',
      mode: this.mode,
      durationMs: Math.max(12, Date.now() - start),
      summary: `Evaluated "${serviceIdea}" for ${niche} and drafted a testable experiment brief.`,
      output: { experiment },
    };
  }

  private async runProjectTracker(
    runId: string,
    input: ProjectPlanInput | ClientUpdateInput,
    start: number
  ): Promise<WorkflowResponse<WorkflowOutputMap['project-tracker']>> {
    if (input.mode === 'client-update') {
      const { project } = input;
      if (!project || !project.title.trim()) {
        return this.validationError(runId, 'project-tracker', {
          project: 'Select an active project before generating a client update.',
        });
      }

      await sleep(Math.min(this.delayMs, 300));

      const totalTasks = project.tasks.length;
      const doneTasks = project.tasks.filter((t) => t.status === 'done');
      const inProgressTasks = project.tasks.filter(
        (t) => t.status === 'in-progress'
      );
      const todoTasks = project.tasks.filter((t) => t.status === 'todo');
      const blockedTasks = project.tasks.filter((t) => t.blocked);
      const completedMilestones = project.milestones.filter(
        (m) => m.completed
      ).length;
      const pct =
        totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;

      const lines: string[] = [
        `Hi ${project.clientName} team,`,
        '',
        `Here is your latest progress update for "${project.title}" (${pct}% task completion — ${doneTasks.length}/${totalTasks} tasks done, ${completedMilestones}/${project.milestones.length} milestones complete).`,
        '',
        'Completed:',
        ...(doneTasks.length > 0
          ? doneTasks.map((t) => `- ${t.title} (${t.owner})`)
          : ['- Initial kickoff and technical setup complete.']),
        '',
        'In Progress:',
        ...(inProgressTasks.length > 0
          ? inProgressTasks.map(
              (t) => `- ${t.title} — owner: ${t.owner}, target ${t.dueDate}`
            )
          : ['- Preparing next milestone deliverables.']),
      ];

      if (blockedTasks.length > 0) {
        lines.push(
          '',
          'Flagged Blockers / Action Needed:',
          ...blockedTasks.map(
            (t) =>
              `- ${t.title}: ${t.blockerNote.trim() || 'Waiting on client input or access confirmation.'}`
          )
        );
      } else {
        lines.push(
          '',
          'Blockers:',
          '- None currently flagged; delivery remains on schedule.'
        );
      }

      if (todoTasks.length > 0) {
        lines.push(
          '',
          'Up Next:',
          ...todoTasks
            .slice(0, 3)
            .map((t) => `- ${t.title} (due ${t.dueDate})`)
        );
      }

      lines.push(
        '',
        'Please reply with any adjustments before our next check-in.',
        '— Rhymvex Delivery Team'
      );

      return {
        ok: true,
        runId,
        botId: 'project-tracker',
        mode: this.mode,
        durationMs: Math.max(10, Date.now() - start),
        summary: `Generated draft client update for ${project.clientName} (${pct}% complete, ${blockedTasks.length} blockers).`,
        output: {
          mode: 'client-update',
          update: {
            id: `upd-${runId}`,
            generatedAt: timeStamp(),
            subject: `${project.title} — Weekly Status Update (${pct}% Complete)`,
            body: lines.join('\n'),
            mode: this.mode,
          },
        },
      };
    }

    const clientName = cleanText(input.clientName);
    const projectTitle = cleanText(input.projectTitle);
    const goal = cleanText(input.goal);
    const deliverables = input.deliverables
      .map((d) => cleanText(d))
      .filter(Boolean);

    const fieldErrors: Record<string, string> = {};
    if (!clientName) fieldErrors.clientName = 'Client name is required.';
    if (!projectTitle) fieldErrors.projectTitle = 'Project title is required.';

    if (Object.keys(fieldErrors).length > 0) {
      return this.validationError(runId, 'project-tracker', fieldErrors);
    }

    await sleep(this.delayMs);

    const effectiveDeliverables =
      deliverables.length > 0
        ? deliverables
        : [
            'Technical architecture spec',
            'Core automation build',
            'QA & production handoff',
          ];

    const milestones: ProjectMilestone[] = [
      {
        id: `pms-${runId}-1`,
        title: `Kickoff & Architecture Sign-Off (${clientName})`,
        targetDate: formatDateOffset(5),
        completed: false,
      },
      {
        id: `pms-${runId}-2`,
        title: `Staging Build: ${effectiveDeliverables[0]}`,
        targetDate: formatDateOffset(14),
        completed: false,
      },
      {
        id: `pms-${runId}-3`,
        title: `Owner Handoff, Training & Runbook (${input.timeline || 'Launch'})`,
        targetDate: formatDateOffset(21),
        completed: false,
      },
    ];

    const owners = [
      'Systems Lead',
      'Automation Eng',
      'Full-Stack Eng',
      'Delivery Lead',
    ];
    const tasks: ProjectTask[] = [
      {
        id: `ptask-${runId}-1`,
        title: `Confirm technical requirements & staging credentials for ${clientName}`,
        owner: owners[0],
        dueDate: formatDateOffset(3),
        status: 'in-progress',
        blocked: false,
        blockerNote: '',
      },
      ...effectiveDeliverables.slice(0, 3).map((deliv, idx) => ({
        id: `ptask-${runId}-${idx + 2}`,
        title: `Implement & verify: ${deliv}`,
        owner: owners[(idx + 1) % owners.length],
        dueDate: formatDateOffset(8 + idx * 5),
        status: 'todo' as const,
        blocked: false,
        blockerNote: '',
      })),
      {
        id: `ptask-${runId}-final`,
        title: `Conduct owner handoff session & deliver monitoring runbook`,
        owner: owners[3],
        dueDate: formatDateOffset(20),
        status: 'todo',
        blocked: false,
        blockerNote: '',
      },
    ];

    const revSuffix = input.revisionNote
      ? ` Revised per feedback: ${cleanText(input.revisionNote)}.`
      : '';

    return {
      ok: true,
      runId,
      botId: 'project-tracker',
      mode: this.mode,
      durationMs: Math.max(12, Date.now() - start),
      summary: `Created project plan "${projectTitle}" with ${milestones.length} milestones (including Owner Handoff) and ${tasks.length} tasks.`,
      output: {
        mode: 'create-plan',
        summary:
          (goal ||
            `Structured software & automation delivery workspace for ${clientName}.`) +
          revSuffix,
        milestones,
        tasks,
      },
    };
  }

  private async runContentCreator(
    runId: string,
    input: ContentCreatorInput,
    start: number
  ): Promise<WorkflowResponse<WorkflowOutputMap['content-creator']>> {
    const topic = cleanText(input.topic);
    const offer = cleanText(input.offer);
    const tone = cleanText(input.tone);
    const cta = cleanText(input.cta);
    const platform = input.platform;

    const fieldErrors: Record<string, string> = {};
    if (!topic) fieldErrors.topic = 'Topic is required.';
    if (!offer) fieldErrors.offer = 'Offer is required.';
    if (!tone) fieldErrors.tone = 'Tone is required.';
    if (!cta) fieldErrors.cta = 'Call to action is required.';

    if (Object.keys(fieldErrors).length > 0) {
      return this.validationError(runId, 'content-creator', fieldErrors);
    }

    await sleep(this.delayMs);

    const toneDescriptor = tone.toLowerCase();
    const revLine = input.revisionNote
      ? `\n\nRevision focus: ${cleanText(input.revisionNote)}.`
      : '';

    const drafts: ContentVariantDraft[] = [
      {
        id: `draft-${runId}-1`,
        variantLabel: 'Draft 1 — Operational Teardown',
        hook: `Most teams overcomplicate ${topic} — here is the lean architecture that actually holds up in production.`,
        body: `Written for ${platform} in a ${toneDescriptor} voice:\n\nWhen agencies and ops leaders ask Rhymvex about ${topic}, the real bottleneck is rarely a missing tool — it is fragile manual glue between systems.\n\nOur ${offer} focuses on three fundamentals:\n1. Branded intake contracts before writing automation logic.\n2. Observable failure handling so jobs never fail silently.\n3. Guided owner handoff and human-in-the-loop review before anything reaches a client.${revLine}`,
        callToAction: cta,
      },
      {
        id: `draft-${runId}-2`,
        variantLabel: 'Draft 2 — Behind the Build',
        hook: `What changed when we rebuilt ${topic} around a typed workflow layer instead of ad-hoc scripts.`,
        body: `Drafted for ${platform} (${tone} tone):\n\nAcross recent Rhymvex engagements, teams dealing with ${topic} were burning hours every week on copy-paste updates and brittle spreadsheets.\n\nWith our ${offer}, every run leaves a clean audit trail, structured outputs your team can edit, and portable code you actually own.${revLine}`,
        callToAction: cta,
      },
      {
        id: `draft-${runId}-3`,
        variantLabel: 'Draft 3 — Direct Decision-Maker Angle',
        hook: `If ${topic} still depends on manual check-ins every Friday, your team has an automation leverage gap.`,
        body: `Tailored for ${platform} (${tone} tone):\n\nYou do not need a 6-month platform overhaul to fix ${topic}. Rhymvex ships our ${offer} in tight, inspectable milestones so you see measurable time saved in weeks, not quarters.${revLine}`,
        callToAction: cta,
      },
    ];

    return {
      ok: true,
      runId,
      botId: 'content-creator',
      mode: this.mode,
      durationMs: Math.max(12, Date.now() - start),
      summary: `Generated 3 editable ${platform} drafts on "${topic}".`,
      output: { drafts },
    };
  }
}
