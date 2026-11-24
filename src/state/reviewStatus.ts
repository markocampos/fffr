import type {
  BotId,
  BotJobStatus,
  ContentQueueRecord,
  LeadRecord,
  LinkedArtifactRef,
  MeetingRecord,
  ReviewItem,
  StrategyExperimentRecord,
} from '../types/workspace';

/**
 * Returns true strictly when the given workspace record has an open ('pending')
 * item in the Needs me review queue.
 */
export function hasOpenReviewForRecord(
  reviewQueue: ReviewItem[],
  kind: LinkedArtifactRef['kind'],
  recordId: string
): boolean {
  return reviewQueue.some(
    (item) =>
      item.status === 'pending' &&
      (item.proposedAction?.recordId === recordId ||
        item.linkedArtifacts.some(
          (ref) => ref.kind === kind && ref.id === recordId
        ))
  );
}

/**
 * Returns true strictly when the given coworker has at least one open ('pending')
 * item in Needs me linked to their records or actions.
 */
export function hasOpenReviewForBot(
  reviewQueue: ReviewItem[],
  botId: BotId
): boolean {
  return reviewQueue.some(
    (item) =>
      item.status === 'pending' &&
      item.linkedArtifacts.some((ref) => ref.botId === botId)
  );
}

/**
 * Desk header job status label:
 * - 'Ready for review' ONLY when an open Needs me item exists for this coworker.
 * - 'Completed' for finished routine internal work.
 */
export function getBotDeskStatusLabel(
  botId: BotId,
  jobStatus: BotJobStatus,
  reviewQueue: ReviewItem[]
): 'Idle' | 'Running' | 'Completed' | 'Ready for review' | 'Failed' {
  if (jobStatus === 'running') return 'Running';
  if (jobStatus === 'failed') return 'Failed';
  if (hasOpenReviewForBot(reviewQueue, botId)) return 'Ready for review';
  if (jobStatus === 'ready') return 'Completed';
  return 'Idle';
}

/**
 * Lead status label:
 * - 'Ready for review' ONLY when an open Needs me item references this lead.
 * - 'Evaluated' for finished lead evaluations.
 * - 'Saved' otherwise.
 */
export function getLeadDisplayStatus(
  lead: Pick<LeadRecord, 'id' | 'status'>,
  reviewQueue: ReviewItem[]
): 'Ready for review' | 'Evaluated' | 'Saved' {
  if (hasOpenReviewForRecord(reviewQueue, 'lead', lead.id)) {
    return 'Ready for review';
  }
  return lead.status === 'evaluated' ? 'Evaluated' : 'Saved';
}

/**
 * Strategy experiment status label:
 * - 'Ready for review' ONLY when an open Needs me item references this brief.
 * - 'Completed' for routine completed internal strategy work.
 */
export function getStrategyDisplayStatus(
  brief: Pick<StrategyExperimentRecord, 'id' | 'status'>,
  reviewQueue: ReviewItem[]
): 'Ready for review' | 'Completed' {
  if (hasOpenReviewForRecord(reviewQueue, 'strategy', brief.id)) {
    return 'Ready for review';
  }
  return 'Completed';
}

/**
 * Content queue status label:
 * - 'Published (Sim)' once approved and simulated-published.
 * - 'Ready for review' ONLY when an open Needs me item exists for this draft.
 * - 'Completed' for finished internal drafts without an open review gate.
 * - 'Draft' for working drafts.
 */
export function getContentDisplayStatus(
  item: Pick<ContentQueueRecord, 'id' | 'queueStatus'>,
  reviewQueue: ReviewItem[]
): 'Published (Sim)' | 'Ready for review' | 'Completed' | 'Draft' {
  if (item.queueStatus === 'published-sim') return 'Published (Sim)';
  if (hasOpenReviewForRecord(reviewQueue, 'content', item.id)) {
    return 'Ready for review';
  }
  if (
    item.queueStatus === 'completed' ||
    item.queueStatus === 'ready-for-review'
  ) {
    return 'Completed';
  }
  return 'Draft';
}

/**
 * Conversation status label:
 * - 'Live' while active.
 * - 'Ready for review' ONLY if a linked artifact has an open item in Needs me.
 * - 'Evaluated' if the conversation produced a lead evaluation.
 * - 'Completed' for all other routine completed conversations.
 */
export function getMeetingDisplayStatus(
  meeting: Pick<MeetingRecord, 'status' | 'linkedArtifacts' | 'outcomeSummary'>,
  reviewQueue: ReviewItem[]
): 'Live' | 'Ready for review' | 'Evaluated' | 'Completed' {
  if (meeting.status === 'active') return 'Live';
  const hasPending = (meeting.linkedArtifacts ?? []).some((ref) =>
    hasOpenReviewForRecord(reviewQueue, ref.kind, ref.id)
  );
  if (hasPending) return 'Ready for review';
  const producedLeadEval =
    (meeting.linkedArtifacts ?? []).some((r) => r.kind === 'lead') &&
    /evaluat/i.test(meeting.outcomeSummary ?? '');
  if (producedLeadEval) return 'Evaluated';
  return 'Completed';
}
