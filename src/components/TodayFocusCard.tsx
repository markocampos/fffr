import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, Edit3, Target } from 'lucide-react';
import type { LinkedArtifactRef, TodayFocus } from '../types/workspace';
import {
  AUSTRALIAN_CLEANING_EXAMPLE_FOCUS,
  type FocusProgressSnapshot,
} from '../workflows/focusPlanner';

export interface SaveFocusInput {
  goal: string;
  targetAudience?: string;
  expectedResult?: string;
  requestConsolidatedReview?: boolean;
}

interface TodayFocusCardProps {
  focus: TodayFocus | null;
  progress: FocusProgressSnapshot;
  isWorking: boolean;
  onSaveFocus: (input: SaveFocusInput) => void;
  onOpenArtifact: (ref: LinkedArtifactRef) => void;
}

export function TodayFocusCard({
  focus,
  progress,
  isWorking,
  onSaveFocus,
  onOpenArtifact,
}: TodayFocusCardProps) {
  const [isEditing, setIsEditing] = useState(!focus);
  const [goal, setGoal] = useState(focus?.goal ?? '');
  const [targetAudience, setTargetAudience] = useState(
    focus?.targetAudience ?? ''
  );
  const [expectedResult, setExpectedResult] = useState(
    focus?.expectedResult ?? ''
  );
  const [requestConsolidatedReview, setRequestConsolidatedReview] = useState(
    focus?.requestConsolidatedReview ?? false
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) {
      setIsEditing(true);
    }
  }, [focus]);

  function openEditor() {
    setGoal(focus?.goal ?? '');
    setTargetAudience(focus?.targetAudience ?? '');
    setExpectedResult(focus?.expectedResult ?? '');
    setRequestConsolidatedReview(focus?.requestConsolidatedReview ?? false);
    setError(null);
    setIsEditing(true);
  }

  function handleUseExample() {
    setGoal(AUSTRALIAN_CLEANING_EXAMPLE_FOCUS.goal);
    setTargetAudience(AUSTRALIAN_CLEANING_EXAMPLE_FOCUS.targetAudience);
    setExpectedResult(AUSTRALIAN_CLEANING_EXAMPLE_FOCUS.expectedResult);
    setRequestConsolidatedReview(false);
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim()) {
      setError('Enter a short goal for Today’s focus.');
      return;
    }
    onSaveFocus({
      goal: goal.trim(),
      targetAudience: targetAudience.trim() || undefined,
      expectedResult: expectedResult.trim() || undefined,
      requestConsolidatedReview,
    });
    setIsEditing(false);
    setError(null);
  }

  const pct =
    progress.targetCount > 0
      ? Math.min(
          100,
          Math.round((progress.completedCount / progress.targetCount) * 100)
        )
      : 0;

  return (
    <section
      aria-label="Today's focus"
      data-testid="today-focus-card"
      className="rounded-md border border-[#2E3440] bg-[#191D24] p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#F4EFE6] flex items-center gap-1.5">
          <Target className="w-4 h-4 text-[#EAB365]" aria-hidden="true" />
          Today&apos;s focus
        </h3>

        {focus && !isEditing ? (
          <div className="flex items-center gap-2.5">
            <span
              data-testid="focus-status-text"
              className={`font-mono text-[11px] ${
                progress.isComplete || focus.status === 'completed'
                  ? 'text-[#4ADE80]'
                  : isWorking
                    ? 'text-[#22D3EE]'
                    : 'text-[#EAB365]'
              }`}
            >
              {progress.isComplete || focus.status === 'completed'
                ? 'Completed'
                : isWorking
                  ? 'Team working'
                  : 'Active'}
            </span>
            <button
              type="button"
              onClick={openEditor}
              data-testid="edit-focus-btn"
              className="inline-flex items-center gap-1 rounded border border-[#343B48] bg-[#16191F] px-2 py-1 text-[11px] text-[#C7C2B8] hover:border-[#22D3EE] hover:text-[#F4EFE6] cursor-pointer"
            >
              <Edit3 className="w-3 h-3" aria-hidden="true" />
              Edit focus
            </button>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-[#8A92A0]">
            Starts team automatically
          </span>
        )}
      </div>

      {isEditing || !focus ? (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="focus-goal-input"
                className="block text-xs font-medium text-[#A4AAB5]"
              >
                Goal
              </label>
              <button
                type="button"
                onClick={handleUseExample}
                data-testid="fill-cleaning-focus-btn"
                className="text-[11px] text-[#22D3EE] hover:underline cursor-pointer"
              >
                Use Australian cleaning example
              </button>
            </div>
            <textarea
              id="focus-goal-input"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Evaluate three Australian residential cleaning businesses with a visible inquiry problem. For each, save the problem and a suggested Rhymvex offer."
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-xs text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="focus-audience-input"
                className="block text-xs font-medium text-[#A4AAB5] mb-1"
              >
                Target audience{' '}
                <span className="text-[#777E8B] font-normal">(optional)</span>
              </label>
              <input
                id="focus-audience-input"
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Australian residential cleaning businesses"
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="focus-expected-input"
                className="block text-xs font-medium text-[#A4AAB5] mb-1"
              >
                Expected result
              </label>
              <input
                id="focus-expected-input"
                type="text"
                value={expectedResult}
                onChange={(e) => setExpectedResult(e.target.value)}
                placeholder="e.g. 3 leads evaluated with problem & offer"
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-[#A4AAB5] cursor-pointer">
            <input
              type="checkbox"
              checked={requestConsolidatedReview}
              onChange={(e) => setRequestConsolidatedReview(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#22D3EE]"
            />
            Submit one consolidated owner review in Needs me when complete
          </label>

          {error && (
            <p role="alert" className="text-xs text-[#F87171]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="text-[11px] text-[#8A92A0]">
              Saving starts the Strategist &amp; team automatically. Changing focus keeps earlier work in history.
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {focus && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#A4AAB5] hover:text-[#F4EFE6] cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                data-testid="save-focus-btn"
                className="rounded bg-[#EAB365] px-3 py-1.5 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] transition-colors cursor-pointer"
              >
                Save focus
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-[#F4EFE6] leading-relaxed">{focus.goal}</p>

          {(focus.targetAudience || focus.expectedResult) && (
            <div className="text-[11px] text-[#A4AAB5] space-y-0.5">
              {focus.targetAudience && (
                <p>
                  <span className="text-[#777E8B]">Audience:</span>{' '}
                  {focus.targetAudience}
                </p>
              )}
              {focus.expectedResult && (
                <p>
                  <span className="text-[#777E8B]">Expected result:</span>{' '}
                  {focus.expectedResult}
                </p>
              )}
            </div>
          )}

          {/* Live Progress Bar Derived Strictly From Saved Work Linked to This Focus */}
          <div className="space-y-1.5 pt-1 border-t border-[#2A303B]">
            <div className="flex items-center justify-between gap-2">
              <span
                data-testid="focus-progress-label"
                className="font-mono text-xs text-[#F4EFE6] tabular-nums flex items-center gap-1.5"
              >
                {progress.isComplete && (
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-[#4ADE80]"
                    aria-hidden="true"
                  />
                )}
                {progress.progressLabel}
              </span>
              <span className="font-mono text-[10px] text-[#8A92A0] tabular-nums">
                {pct}%
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-[#262C36] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  progress.isComplete ? 'bg-[#4ADE80]' : 'bg-[#22D3EE]'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {progress.isComplete && (
              <p className="text-[11px] text-[#A7F3D0]">
                Focus complete — all results saved below. No additional focus tasks will be created unless you update the goal.
              </p>
            )}

            {progress.linkedResults.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {progress.linkedResults.map((ref) => (
                  <button
                    key={`${ref.kind}-${ref.id}`}
                    type="button"
                    onClick={() => onOpenArtifact(ref)}
                    className="inline-flex items-center gap-1 rounded border border-[#2A3C44] bg-[#142026] px-2 py-1 text-[11px] text-[#22D3EE] hover:border-[#22D3EE] cursor-pointer"
                  >
                    <span>{ref.label}</span>
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
