import type {
  AutomationTier,
  BotId,
  HighImpactActionType,
  ReviewItem,
} from '../types/workspace';

export interface ClassifiedAssignment {
  tier: AutomationTier;
  title: string;
  normalizedTopic: string;
  industry: string;
  location: string;
  targetClient: string;
  service: string;
  participants: BotId[];
  requiresMeeting: boolean;
  highImpactActionType?: HighImpactActionType;
  includePromoPost: boolean;
}

/**
 * Pure approval & routing policy engine.
 * Routes all active work across Lead Finder, Business Strategist, Project Tracker, and Content Creator.
 *
 * Rules:
 * - small: single coworker executes and saves automatically (tagging leads, summarizing, updating task).
 * - medium: coworkers meet/check outputs and save intermediate work automatically (qualifying leads, testing angle).
 * - final-deliverable: cross-team workflow saves intermediate work automatically and creates ONE review item in Needs me.
 * - high-impact: pauses BEFORE external send, publishing content, committing price/deadline, or deleting a record.
 */
export function classifyAssignment(
  rawPrompt: string,
  options?: { includePromoPost?: boolean }
): ClassifiedAssignment {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();
  const includePromoPost = Boolean(
    options?.includePromoPost ||
      /promo|post|campaign|linkedin|social|content/.test(lower)
  );

  // 1. High-impact external / destructive / commitment actions ALWAYS pause for approval
  if (
    /\b(send|email|outreach|dispatch)\b.*\b(client|offer|experiment|lead|update|pitch)\b/.test(
      lower
    ) ||
    /^send\b/.test(lower)
  ) {
    return {
      tier: 'high-impact',
      title: prompt || 'Send client outreach',
      normalizedTopic: prompt,
      industry: extractIndustry(prompt),
      location: extractLocation(prompt),
      targetClient: 'Business Owners',
      service: 'Workflow & Inquiry Automation',
      participants: ['business-strategist'],
      requiresMeeting: false,
      highImpactActionType: 'send-external-message',
      includePromoPost: false,
    };
  }

  if (/\b(publish|post live|schedule live)\b/.test(lower)) {
    return {
      tier: 'high-impact',
      title: prompt || 'Publish content draft',
      normalizedTopic: prompt,
      industry: extractIndustry(prompt),
      location: extractLocation(prompt),
      targetClient: 'Agency Prospects',
      service: 'Automation Systems',
      participants: ['content-creator'],
      requiresMeeting: false,
      highImpactActionType: 'publish-content',
      includePromoPost: true,
    };
  }

  if (/\b(commit|lock in|guarantee|sign)\b.*\b(price|budget|deadline|quote)\b/.test(lower)) {
    return {
      tier: 'high-impact',
      title: prompt || 'Commit price and deadline',
      normalizedTopic: prompt,
      industry: extractIndustry(prompt),
      location: extractLocation(prompt),
      targetClient: 'Client Leadership',
      service: 'Custom Automation Build',
      participants: ['business-strategist', 'project-tracker'],
      requiresMeeting: false,
      highImpactActionType: 'commit-price-deadline',
      includePromoPost: false,
    };
  }

  if (/\b(delete|purge|wipe|remove all)\b/.test(lower)) {
    return {
      tier: 'high-impact',
      title: prompt || 'Delete workspace record',
      normalizedTopic: prompt,
      industry: 'Internal Operations',
      location: 'Remote',
      targetClient: 'Internal',
      service: 'Workspace Maintenance',
      participants: ['project-tracker'],
      requiresMeeting: false,
      highImpactActionType: 'delete-record',
      includePromoPost: false,
    };
  }

  // 2. Small routine tasks — execute & save automatically without Needs Me queue
  if (/\b(tag|label|summarize|summary|triage|update task|log note)\b/.test(lower)) {
    const bot: BotId = /\b(task|project|blocker|milestone)\b/.test(lower)
      ? 'project-tracker'
      : /\b(content|draft|post)\b/.test(lower)
        ? 'content-creator'
        : /\b(hypothesis|niche|strategy|experiment)\b/.test(lower)
          ? 'business-strategist'
          : 'lead-finder';
    return {
      tier: 'small',
      title: prompt || 'Routine workspace update',
      normalizedTopic: prompt,
      industry: extractIndustry(prompt),
      location: extractLocation(prompt),
      targetClient: 'Operations Team',
      service: 'Routine Sync',
      participants: [bot],
      requiresMeeting: false,
      includePromoPost: false,
    };
  }

  // 3. Medium collaborative tasks — coworkers collaborate & save intermediate outputs automatically
  if (
    /\b(qualify|shortlist|batch of leads|audit leads|evaluate niche|test hypothesis|brainstorm)\b/.test(
      lower
    ) &&
    !/\b(offer|package|full)\b/.test(lower)
  ) {
    const participants: BotId[] = /\b(experiment|hypothesis|niche)\b/.test(lower)
      ? ['business-strategist', 'project-tracker']
      : ['lead-finder', 'business-strategist'];
    return {
      tier: 'medium',
      title: prompt || 'Collaborative team review',
      normalizedTopic: prompt,
      industry: extractIndustry(prompt),
      location: extractLocation(prompt),
      targetClient: 'Local Business Owners',
      service: deriveServiceForIndustry(extractIndustry(prompt)),
      participants,
      requiresMeeting: true,
      includePromoPost: false,
    };
  }

  // 4. Final Deliverable — multi-person meeting + desk execution + single review item in Needs Me
  const industry = extractIndustry(prompt);
  const participants: BotId[] = includePromoPost
    ? ['lead-finder', 'business-strategist', 'project-tracker', 'content-creator']
    : ['lead-finder', 'business-strategist', 'project-tracker'];

  return {
    tier: 'final-deliverable',
    title: prompt || `Design a ${industry.toLowerCase()} service experiment`,
    normalizedTopic: prompt || `${industry} service offer`,
    industry,
    location: extractLocation(prompt),
    targetClient: `${industry} owners & operations managers`,
    service: deriveServiceForIndustry(industry),
    participants,
    requiresMeeting: true,
    includePromoPost,
  };
}

function extractIndustry(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/clean|janitor|maid|housekeep/.test(lower)) return 'Cleaning Services';
  if (/dental|clinic|orthodont|health/.test(lower)) return 'Dental & Clinics';
  if (/freight|logistic|truck|warehouse|cold-chain/.test(lower)) return 'Regional Logistics';
  if (/roof|hvac|plumb|contractor|trade/.test(lower)) return 'Home Services & Trades';
  if (/law|legal|attorney/.test(lower)) return 'Boutique Legal Practices';
  if (/real estate|property|broker/.test(lower)) return 'Property Management';
  if (/accounting|bookkeep|cpa/.test(lower)) return 'Accounting & Advisory';
  return 'Service Businesses';
}

function extractLocation(prompt: string): string {
  const match = prompt.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:,\s*[A-Z]{2})?)/);
  if (match && match[1]) return match[1].trim();
  return 'Austin, TX';
}

function deriveServiceForIndustry(industry: string): string {
  if (industry === 'Cleaning Services') {
    return 'Branded Inquiry Form & Owner Job Tracker';
  }
  if (industry === 'Dental & Clinics') {
    return 'Automated Patient Intake & Front-Desk Triage';
  }
  if (industry === 'Regional Logistics') {
    return 'Automated Dispatch & Invoice Reconciliation';
  }
  return 'Branded Client Intake Portal & Automated Tracker';
}

export function hasExistingReviewForKey(
  queue: ReviewItem[],
  dedupeKey: string
): boolean {
  return queue.some((item) => item.dedupeKey === dedupeKey);
}

export function enqueueReviewItemIdempotent(
  queue: ReviewItem[],
  item: ReviewItem
): ReviewItem[] {
  const existingIdx = queue.findIndex((r) => r.dedupeKey === item.dedupeKey);
  if (existingIdx !== -1) {
    if (item.revisionNumber > queue[existingIdx].revisionNumber) {
      return queue.map((r, idx) => (idx === existingIdx ? item : r));
    }
    return queue;
  }
  return [item, ...queue];
}

export function resolveAffectedBotForRevision(feedback: string): BotId {
  const lower = feedback.toLowerCase();
  if (/milestone|timeline|task|handoff|schedule|deadline|blocker/.test(lower)) {
    return 'project-tracker';
  }
  if (/post|promo|copy|hook|linkedin|social|content|tone/.test(lower)) {
    return 'content-creator';
  }
  if (/lead|prospect|business|location|industry|research/.test(lower)) {
    return 'lead-finder';
  }
  return 'business-strategist';
}
