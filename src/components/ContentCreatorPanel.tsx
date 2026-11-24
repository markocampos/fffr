import { useState, type FormEvent } from 'react';
import { Check, Copy, Play, Trash2 } from 'lucide-react';
import type {
  BotJobStatus,
  ContentPlatform,
  ContentQueueRecord,
  ContentVariantDraft,
  ReviewItem,
} from '../types/workspace';
import type { ContentCreatorInput } from '../workflows/runner';
import { getContentDisplayStatus } from '../state/reviewStatus';

interface ContentCreatorPanelProps {
  contentQueue: ContentQueueRecord[];
  reviewQueue: ReviewItem[];
  selectedContentId?: string | null;
  jobStatus: BotJobStatus;
  lastError?: string;
  onRunSimulation: (input: ContentCreatorInput) => Promise<ContentVariantDraft[] | null>;
  onSaveDraftToQueue: (
    draft: ContentVariantDraft,
    meta: ContentCreatorInput,
    queueStatus: 'draft' | 'completed'
  ) => void;
  onToggleQueueStatus: (recordId: string) => void;
  onDeleteQueueRecord: (recordId: string) => void;
  onRequestPublish?: (record: ContentQueueRecord) => Promise<void>;
}

const PLATFORMS: ContentPlatform[] = [
  'LinkedIn',
  'X / Thread',
  'Email Newsletter',
  'Case Study Post',
];

export function ContentCreatorPanel({
  contentQueue,
  reviewQueue,
  selectedContentId,
  jobStatus,
  lastError,
  onRunSimulation,
  onSaveDraftToQueue,
  onToggleQueueStatus,
  onDeleteQueueRecord,
  onRequestPublish,
}: ContentCreatorPanelProps) {
  const [platform, setPlatform] = useState<ContentPlatform>('LinkedIn');
  const [topic, setTopic] = useState('Automating invoice & intake workflows safely');
  const [offer, setOffer] = useState('2-Week Automation Architecture Sprint');
  const [tone, setTone] = useState('Direct & pragmatic');
  const [cta, setCta] = useState('Reply "FLOW" for our 1-page architecture map');

  const [drafts, setDrafts] = useState<ContentVariantDraft[]>([]);
  const [lastBrief, setLastBrief] = useState<ContentCreatorInput | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isRunning = jobStatus === 'running';

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!topic.trim() || !offer.trim() || !tone.trim() || !cta.trim()) {
      setValidationError('Please complete topic, offer, tone, and call to action.');
      return;
    }

    const brief: ContentCreatorInput = {
      platform,
      topic: topic.trim(),
      offer: offer.trim(),
      tone: tone.trim(),
      cta: cta.trim(),
    };
    const result = await onRunSimulation(brief);
    if (result) {
      setDrafts(result);
      setLastBrief(brief);
      setSavedIds({});
    }
  }

  function updateDraftField(
    id: string,
    field: 'hook' | 'body' | 'callToAction',
    value: string
  ) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  }

  function handleSaveVariant(
    draft: ContentVariantDraft,
    status: 'draft' | 'completed'
  ) {
    const meta: ContentCreatorInput = lastBrief || {
      platform,
      topic: topic.trim(),
      offer: offer.trim(),
      tone: tone.trim(),
      cta: cta.trim(),
    };
    onSaveDraftToQueue(draft, meta, status);
    setSavedIds((prev) => ({ ...prev, [draft.id]: true }));
  }

  async function handleCopyRecord(record: ContentQueueRecord) {
    const text = `${record.hook}\n\n${record.body}\n\n${record.callToAction}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore restricted clipboard
    }
    setCopiedId(record.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <form
        onSubmit={handleGenerate}
        className="rounded-md border border-[#2E3440] bg-[#222730] p-4 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Content Brief
          </h3>
          <span className="font-mono text-[11px] text-[#EAB365]">
            Simulation · Drafts Only (No Auto-Publish)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="cc-platform"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Platform
            </label>
            <select
              id="cc-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cc-tone"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Tone
            </label>
            <input
              id="cc-tone"
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. Direct & technical"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="cc-topic"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Topic
            </label>
            <input
              id="cc-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Eliminating manual dispatch spreadsheets"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="cc-offer"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Offer
            </label>
            <input
              id="cc-offer"
              type="text"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. Workflow Audit"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="cc-cta"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Call to Action
            </label>
            <input
              id="cc-cta"
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder='e.g. Comment "FLOW" for our checklist'
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>
        </div>

        {(validationError || lastError) && (
          <p role="alert" className="text-xs text-[#F87171]">
            {validationError || lastError}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[#8A92A0]">
            Produces 3 editable drafts to review and queue.
          </p>
          <button
            type="submit"
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3.5 py-2 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {isRunning ? 'Generating Drafts...' : 'Run Simulation'}
          </button>
        </div>
      </form>

      {/* Generated 3 Draft Variants */}
      {drafts.length > 0 && (
        <section aria-label="Generated content drafts" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[#F4EFE6]">
              Generated Drafts ({drafts.length})
            </h3>
            <span className="font-mono text-[11px] text-[#A4AAB5]">
              Simulation · Edit hook, body & CTA
            </span>
          </div>

          {drafts.map((draft, idx) => {
            const isSaved = Boolean(savedIds[draft.id]);
            return (
              <div
                key={draft.id}
                className="rounded-md border border-[#2E3440] bg-[#1E232B] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-[#F4EFE6]">
                    {draft.variantLabel}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isSaved}
                      onClick={() => handleSaveVariant(draft, 'draft')}
                      aria-label={`Save ${draft.variantLabel} to queue as draft`}
                      className="rounded border border-[#343B48] bg-[#222730] px-2.5 py-1 text-xs text-[#E4DFD5] hover:border-[#4B5563] disabled:opacity-50 cursor-pointer"
                    >
                      {isSaved ? 'Saved' : 'Save Draft'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaved}
                      onClick={() => handleSaveVariant(draft, 'completed')}
                      aria-label={`Save Completed: ${draft.variantLabel}`}
                      className="rounded bg-[#22D3EE] px-2.5 py-1 text-xs font-semibold text-[#14171C] hover:bg-[#5CE1F5] disabled:opacity-50 cursor-pointer"
                    >
                      {isSaved ? 'In Queue' : 'Save Completed'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label
                      htmlFor={`cc-hook-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Hook
                    </label>
                    <input
                      id={`cc-hook-${idx}`}
                      type="text"
                      value={draft.hook}
                      onChange={(e) =>
                        updateDraftField(draft.id, 'hook', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cc-body-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Body
                    </label>
                    <textarea
                      id={`cc-body-${idx}`}
                      rows={4}
                      value={draft.body}
                      onChange={(e) =>
                        updateDraftField(draft.id, 'body', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] leading-relaxed focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cc-cta-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Call to Action
                    </label>
                    <input
                      id={`cc-cta-${idx}`}
                      type="text"
                      value={draft.callToAction}
                      onChange={(e) =>
                        updateDraftField(draft.id, 'callToAction', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#EAB365] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Content Queue */}
      <section aria-label="Content queue" className="space-y-2.5">
        <div className="flex items-baseline justify-between border-t border-[#2A303B] pt-4">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Content Queue ({contentQueue.length})
          </h3>
          <span className="text-xs text-[#8A92A0]">
            Human review required before publishing
          </span>
        </div>

        {contentQueue.length === 0 ? (
          <p className="rounded border border-dashed border-[#2E3440] p-4 text-xs text-[#8A92A0]">
            Queue is empty. Generate drafts above and save your favorites for review.
          </p>
        ) : (
          <div className="space-y-2.5">
            {contentQueue.map((item) => {
              const displayStatus = getContentDisplayStatus(item, reviewQueue);
              const isCompleted =
                item.queueStatus === 'completed' ||
                item.queueStatus === 'ready-for-review';
              const isHighlighted = selectedContentId === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-md border p-3.5 space-y-2 ${
                    isHighlighted
                      ? 'border-[#22D3EE] bg-[#1A252C]'
                      : 'border-[#2E3440] bg-[#1B1F26]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono text-[#A4AAB5]">
                        {item.platform} · {item.topic}
                        {item.isDemo ? ' · Demo' : ''}
                      </p>
                      <p className="text-sm font-semibold text-[#F4EFE6] mt-0.5">
                        {item.hook}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        displayStatus === 'Published (Sim)'
                          ? 'text-[#22D3EE]'
                          : displayStatus === 'Ready for review'
                            ? 'text-[#EAB365]'
                            : displayStatus === 'Completed'
                              ? 'text-[#4ADE80]'
                              : 'text-[#A4AAB5]'
                      }`}
                    >
                      {displayStatus}
                    </span>
                  </div>

                  <p className="text-xs text-[#C7C2B8] whitespace-pre-line line-clamp-3">
                    {item.body}
                  </p>
                  <p className="text-xs text-[#EAB365]">{item.callToAction}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.queueStatus !== 'published-sim' && (
                        <button
                          type="button"
                          onClick={() => onToggleQueueStatus(item.id)}
                          className="rounded border border-[#3E4656] bg-[#222730] px-2.5 py-1 text-xs text-[#F4EFE6] hover:border-[#22D3EE] cursor-pointer"
                        >
                          {isCompleted ? 'Move to Draft' : 'Mark Completed'}
                        </button>
                      )}

                      {onRequestPublish && item.queueStatus !== 'published-sim' && (
                        <button
                          type="button"
                          onClick={() => onRequestPublish(item)}
                          className="rounded border border-[#EAB365]/50 bg-[#272014] px-2.5 py-1 text-xs font-medium text-[#EAB365] hover:bg-[#332A1A] cursor-pointer"
                        >
                          Publish (Approval)
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyRecord(item)}
                        className="inline-flex items-center gap-1 rounded border border-[#343B48] bg-[#16191F] px-2 py-1 text-xs text-[#A4AAB5] hover:text-[#F4EFE6] cursor-pointer"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3 h-3 text-[#4ADE80]" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        )}
                        {copiedId === item.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteQueueRecord(item.id)}
                      aria-label={`Delete queued draft ${item.hook}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#8A92A0] hover:text-[#F87171] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
