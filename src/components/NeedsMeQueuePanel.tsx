import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  LinkedArtifactRef,
  ReviewDecisionOption,
  ReviewItem,
  SimulatedActionLog,
} from '../types/workspace';

interface NeedsMeQueuePanelProps {
  reviewQueue: ReviewItem[];
  executedActions: SimulatedActionLog[];
  isProcessing: boolean;
  onSelectDecisionOption: (
    item: ReviewItem,
    option: ReviewDecisionOption
  ) => Promise<void>;
  onSendInstruction: (item: ReviewItem, instruction: string) => Promise<void>;
  onApproveReview: (item: ReviewItem) => Promise<void>;
  onRejectReview: (item: ReviewItem) => void;
  onRequestChanges: (item: ReviewItem, feedback: string) => Promise<void>;
  onOpenArtifact: (ref: LinkedArtifactRef) => void;
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  'send-external-message': 'External Outreach Send (Simulated)',
  'publish-content': 'Publish Content (Simulated)',
  'commit-price-deadline': 'Commit Price / Deadline (Simulated)',
  'delete-record': 'Delete Workspace Record',
};

export function NeedsMeQueuePanel({
  reviewQueue,
  executedActions,
  isProcessing,
  onSelectDecisionOption,
  onSendInstruction,
  onApproveReview,
  onRejectReview,
  onRequestChanges,
  onOpenArtifact,
}: NeedsMeQueuePanelProps) {
  const [instructionById, setInstructionById] = useState<Record<string, string>>(
    {}
  );
  const [expandedInstructionId, setExpandedInstructionId] = useState<
    string | null
  >(null);

  const pendingItems = reviewQueue.filter((item) => item.status === 'pending');
  const resolvedItems = reviewQueue.filter((item) => item.status !== 'pending');

  async function handleSubmitInstruction(item: ReviewItem) {
    const note = (instructionById[item.id] || '').trim();
    if (!note) return;
    setExpandedInstructionId(null);
    setInstructionById((prev) => ({ ...prev, [item.id]: '' }));
    if (item.options && item.options.length > 0) {
      await onSendInstruction(item, note);
    } else {
      await onRequestChanges(item, note);
    }
  }

  return (
    <div className="space-y-5" data-testid="needs-me-panel">
      {/* Decision Inbox Header */}
      <div className="rounded-md border border-[#2E3440] bg-[#1E232B] p-3.5 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Owner Decision Inbox ({pendingItems.length})
          </h3>
          <span className="font-mono text-[11px] text-[#EAB365]">
            Team Lead filters routine work
          </span>
        </div>
        <p className="text-xs text-[#A4AAB5]">
          Team Lead reviews employee outputs and approves internal steps automatically. Only decisions requiring your judgment or external authorization appear here.
        </p>
      </div>

      {/* Pending Owner Decisions */}
      {pendingItems.length === 0 ? (
        <div className="rounded-md border border-[#2E3440] bg-[#1A1E25] p-6 text-center space-y-1.5">
          <CheckCircle2
            className="w-6 h-6 text-[#4ADE80] mx-auto"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-[#F4EFE6]">
            No owner decisions waiting
          </p>
          <p className="text-xs text-[#8A92A0]">
            The Team Lead is managing routine reviews and handoffs automatically. Any external sends or owner-level decisions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingItems.map((item) => {
            const isHighImpact = item.kind === 'high-impact-action';
            const options = item.options ?? [];
            const recommendedOption =
              options.find((o) => o.id === item.recommendedOptionId) ??
              options[0];
            const otherOptions = options.filter(
              (o) => o.id !== recommendedOption?.id
            );
            const showInstructionBox = expandedInstructionId === item.id;

            return (
              <article
                key={item.id}
                data-testid={`decision-card-${item.id}`}
                className={`rounded-md border p-4 space-y-3 ${
                  isHighImpact
                    ? 'border-[#EAB365]/70 bg-[#231F19]'
                    : 'border-[#22D3EE]/55 bg-[#1B2229]'
                }`}
              >
                {/* Decision Title & Question */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isHighImpact ? (
                        <ShieldAlert
                          className="w-4 h-4 text-[#EAB365] shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <ClipboardCheck
                          className="w-4 h-4 text-[#22D3EE] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                          isHighImpact ? 'text-[#EAB365]' : 'text-[#22D3EE]'
                        }`}
                      >
                        {item.escalationReason === 'external-authorization'
                          ? 'Needs Owner Authorization'
                          : isHighImpact
                            ? 'High-Impact Decision'
                            : 'Owner Decision'}
                        {item.revisionNumber > 1
                          ? ` · Revision v${item.revisionNumber}`
                          : ''}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-[#F4EFE6]">
                      {item.decisionQuestion || item.title}
                    </h4>
                  </div>
                  <span className="font-mono text-[10px] text-[#8A92A0] shrink-0 tabular-nums">
                    {item.createdAt}
                  </span>
                </div>

                {/* Why Team Lead Escalated This */}
                <div className="rounded border border-[#2E3440] bg-[#16191F] p-2.5 space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
                    Why Team Lead escalated this
                  </p>
                  <p className="text-xs text-[#D5D0C5] leading-relaxed">
                    {item.whyNeeded || item.summary}
                  </p>
                </div>

                {/* Grouped Blocked Tasks */}
                {item.groupedTaskLabels && item.groupedTaskLabels.length > 0 && (
                  <div className="rounded border border-[#2E3440] bg-[#14181E] p-2.5 space-y-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#22D3EE]">
                      Grouped Tasks Waiting on This Decision (
                      {item.groupedTaskLabels.length})
                    </p>
                    <ul className="space-y-1 text-xs text-[#E4DFD5]">
                      {item.groupedTaskLabels.map((taskLabel, idx) => (
                        <li key={idx} className="leading-snug">
                          • {taskLabel}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Team Lead Recommendation Callout */}
                {recommendedOption && (
                  <div className="rounded border border-[#274636] bg-[#13221A] p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles
                        className="w-3.5 h-3.5 text-[#4ADE80] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#4ADE80]">
                        Team Lead Recommends
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#F4EFE6]">
                      {recommendedOption.label}
                    </p>
                    <p className="text-[11px] text-[#A7F3D0]/85 leading-snug">
                      {recommendedOption.description}
                    </p>
                  </div>
                )}

                {/* Team Lead Review Notes */}
                {item.decisionSummary && item.decisionSummary.length > 0 && (
                  <div className="rounded border border-[#2E3440] bg-[#16191F] p-2.5 space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
                      What Team Lead Already Verified
                    </p>
                    <ul className="space-y-1 text-xs text-[#C7C2B8]">
                      {item.decisionSummary.map((line, i) => (
                        <li key={i}>• {line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* External Action / Message Preview */}
                {item.proposedAction && (
                  <details className="rounded border border-[#3E3524] bg-[#181611] p-2.5 text-xs">
                    <summary className="cursor-pointer font-mono text-[11px] text-[#EAB365] select-none">
                      Preview exact messages ({ACTION_TYPE_LABEL[item.proposedAction.actionType] ?? item.proposedAction.actionType})
                    </summary>
                    <div className="mt-2 space-y-1.5 border-t border-[#3E3524] pt-2">
                      {item.proposedAction.recipient && (
                        <p className="text-[#C7C2B8]">
                          <span className="text-[#8A92A0]">Recipients: </span>
                          <span className="font-mono text-[#F4EFE6]">
                            {item.proposedAction.recipient}
                          </span>
                        </p>
                      )}
                      {item.deliverableText ? (
                        <pre className="whitespace-pre-wrap font-sans text-[11px] text-[#D5D0C5] leading-relaxed bg-[#14171C] rounded p-2 border border-[#2A303B] max-h-48 overflow-y-auto">
                          {item.deliverableText}
                        </pre>
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-[11px] text-[#D5D0C5] leading-relaxed bg-[#14171C] rounded p-2 border border-[#2A303B]">
                          {item.proposedAction.bodyPreview}
                        </pre>
                      )}
                    </div>
                  </details>
                )}

                {!item.proposedAction && item.deliverableText && (
                  <pre className="whitespace-pre-wrap font-sans text-xs text-[#D5D0C5] leading-relaxed bg-[#14171C] rounded p-2.5 border border-[#2A303B] max-h-44 overflow-y-auto">
                    {item.deliverableText}
                  </pre>
                )}

                {/* Linked Saved Records */}
                {item.linkedArtifacts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.linkedArtifacts.map((ref) => (
                      <button
                        key={`${ref.kind}-${ref.id}`}
                        type="button"
                        onClick={() => onOpenArtifact(ref)}
                        className="inline-flex items-center gap-1 rounded border border-[#343B48] bg-[#16191F] px-2 py-1 text-[11px] text-[#22D3EE] hover:border-[#22D3EE] cursor-pointer"
                      >
                        {ref.label}
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Decision Action Buttons: Accept Recommendation, Other Options, or Give Instruction */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {recommendedOption ? (
                    <>
                      <button
                        type="button"
                        data-testid={`accept-recommendation-${item.id}`}
                        disabled={isProcessing}
                        onClick={() =>
                          void onSelectDecisionOption(item, recommendedOption)
                        }
                        className="inline-flex items-center gap-1.5 rounded bg-[#4ADE80] px-3 py-1.5 text-xs font-semibold text-[#11151B] hover:bg-[#6EE7A0] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Accept recommendation
                      </button>

                      {otherOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`decision-option-${opt.id}`}
                          disabled={isProcessing}
                          onClick={() => void onSelectDecisionOption(item, opt)}
                          className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors cursor-pointer ${
                            opt.action === 'hold'
                              ? 'border-[#573437] bg-[#241618] text-[#FCA5A5] hover:bg-[#2F1B1E]'
                              : 'border-[#343B48] bg-[#191D24] text-[#F4EFE6] hover:border-[#22D3EE]'
                          }`}
                        >
                          {opt.action === 'hold' && (
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void onApproveReview(item)}
                        className="inline-flex items-center gap-1.5 rounded bg-[#4ADE80] px-3 py-1.5 text-xs font-semibold text-[#11151B] hover:bg-[#6EE7A0] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        {isHighImpact ? 'Approve (Simulated)' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => onRejectReview(item)}
                        className="inline-flex items-center gap-1.5 rounded border border-[#573437] bg-[#241618] px-3 py-1.5 text-xs font-medium text-[#FCA5A5] hover:bg-[#2F1B1E] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Reject
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    data-testid={`toggle-instruction-${item.id}`}
                    disabled={isProcessing}
                    onClick={() =>
                      setExpandedInstructionId(showInstructionBox ? null : item.id)
                    }
                    className="inline-flex items-center gap-1.5 rounded border border-[#2E4852] bg-[#15242B] px-3 py-1.5 text-xs font-medium text-[#22D3EE] hover:bg-[#1B313B] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Give short instruction
                  </button>
                </div>

                {/* Short Custom Instruction Input */}
                {showInstructionBox && (
                  <div className="rounded border border-[#2E4852] bg-[#141C22] p-3 space-y-2">
                    <label
                      htmlFor={`instruction-${item.id}`}
                      className="block text-xs font-medium text-[#E4DFD5]"
                    >
                      Short instruction for Team Lead (automatically routes to the right teammate):
                    </label>
                    <textarea
                      id={`instruction-${item.id}`}
                      rows={2}
                      value={instructionById[item.id] || ''}
                      onChange={(e) =>
                        setInstructionById((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="e.g. Mention our 48-hour setup guarantee and keep the CTA under one sentence."
                      className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedInstructionId(null)}
                        className="rounded border border-[#343B48] px-2.5 py-1 text-xs text-[#A4AAB5] hover:text-[#F4EFE6] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid={`submit-instruction-${item.id}`}
                        disabled={
                          isProcessing || !(instructionById[item.id] || '').trim()
                        }
                        onClick={() => void handleSubmitInstruction(item)}
                        className="rounded bg-[#22D3EE] px-3 py-1 text-xs font-semibold text-[#11151B] hover:bg-[#5CE1F5] disabled:opacity-50 cursor-pointer"
                      >
                        Send instruction to Team Lead
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Simulated Execution Log */}
      {executedActions.length > 0 && (
        <section
          aria-label="Simulated external actions log"
          className="space-y-2 border-t border-[#2A303B] pt-4"
        >
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#A4AAB5]">
            Executed Actions (Simulated · {executedActions.length})
          </h3>
          <div className="space-y-2">
            {executedActions.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="rounded border border-[#274636] bg-[#14231B] p-2.5 text-xs space-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#A7F3D0]">
                    {log.targetLabel}
                  </span>
                  <span className="font-mono text-[10px] text-[#6EE7B7] tabular-nums">
                    {log.executedAt}
                  </span>
                </div>
                <p className="text-[#C7EBD9] text-[11px]">{log.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Resolved Decisions History */}
      {resolvedItems.length > 0 && (
        <section
          aria-label="Resolved review history"
          className="space-y-2 border-t border-[#2A303B] pt-4"
        >
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#A4AAB5]">
            Recent Decisions ({resolvedItems.length})
          </h3>
          <div className="space-y-1.5">
            {resolvedItems.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded border border-[#2A303B] bg-[#181B21] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-[#E4DFD5] truncate">
                    {item.decisionQuestion || item.title}
                  </p>
                  {item.ownerChoiceLabel && (
                    <p className="text-[11px] text-[#8A92A0] truncate">
                      {item.ownerChoiceLabel}
                    </p>
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] uppercase shrink-0 flex items-center gap-1 ${
                    item.status === 'approved'
                      ? 'text-[#4ADE80]'
                      : item.status === 'rejected'
                        ? 'text-[#F87171]'
                        : 'text-[#EAB365]'
                  }`}
                >
                  {item.status === 'rejected' && (
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  )}
                  {item.resolvedBy === 'team-lead'
                    ? 'Team Lead Approved'
                    : item.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
