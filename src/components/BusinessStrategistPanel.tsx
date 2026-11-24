import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowRight,
  Check,
  FlaskConical,
  Play,
  Send,
} from 'lucide-react';
import type {
  BotJobStatus,
  LeadRecord,
  ProposalRecord,
  ReviewItem,
  StrategyExperimentDraft,
  StrategyExperimentRecord,
} from '../types/workspace';
import type { BusinessStrategistInput } from '../workflows/runner';
import { getStrategyDisplayStatus } from '../state/reviewStatus';

interface BusinessStrategistPanelProps {
  leads: LeadRecord[];
  strategyBriefs: StrategyExperimentRecord[];
  reviewQueue: ReviewItem[];
  historicalProposals: ProposalRecord[];
  prefillLead: LeadRecord | null;
  selectedStrategyId: string | null;
  onClearPrefill: () => void;
  jobStatus: BotJobStatus;
  lastError?: string;
  onRunSimulation: (
    input: BusinessStrategistInput
  ) => Promise<StrategyExperimentDraft | null>;
  onSaveStrategy: (
    draft: StrategyExperimentDraft,
    existingId?: string,
    status?: StrategyExperimentRecord['status']
  ) => StrategyExperimentRecord;
  onUpdateStrategyStatus: (
    strategyId: string,
    status: StrategyExperimentRecord['status']
  ) => void;
  onConvertStrategyToProject: (strategy: StrategyExperimentRecord) => Promise<void>;
  onRequestSendOffer?: (strategy: StrategyExperimentRecord) => Promise<void>;
}

const STATUS_LABEL: Record<StrategyExperimentRecord['status'], string> = {
  hypothesis: 'Hypothesis',
  testing: 'Testing',
  validated: 'Validated',
};

const STATUS_COLOR: Record<StrategyExperimentRecord['status'], string> = {
  hypothesis: 'text-[#EAB365]',
  testing: 'text-[#22D3EE]',
  validated: 'text-[#4ADE80]',
};

export function BusinessStrategistPanel({
  leads,
  strategyBriefs,
  reviewQueue,
  historicalProposals,
  prefillLead,
  selectedStrategyId,
  onClearPrefill,
  jobStatus,
  lastError,
  onRunSimulation,
  onSaveStrategy,
  onUpdateStrategyStatus,
  onConvertStrategyToProject,
  onRequestSendOffer,
}: BusinessStrategistPanelProps) {
  const [niche, setNiche] = useState(
    leads[0]?.industry || 'Residential & Commercial Cleaning'
  );
  const [serviceIdea, setServiceIdea] = useState(
    leads[0]?.serviceOffered || '2-Week Branded Inquiry & Triage Sprint'
  );
  const [workspaceContext, setWorkspaceContext] = useState(
    leads[0]?.observedProblem ||
      'Multiple saved demo leads lose high-intent inquiries in shared inboxes and manual PDF re-keying.'
  );
  const [deliveryConstraint, setDeliveryConstraint] = useState(
    'Keep Phase 1 decoupled from client IT token delays using a Day-0 checklist and Owner Handoff.'
  );

  const [draft, setDraft] = useState<StrategyExperimentDraft | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillLead) return;
    setNiche(prefillLead.industry);
    setServiceIdea(prefillLead.serviceOffered);
    setWorkspaceContext(
      `${prefillLead.businessName}: ${prefillLead.observedProblem} Suggested offer: ${prefillLead.suggestedOffer}`
    );
    onClearPrefill();
  }, [prefillLead, onClearPrefill]);

  const isRunning = jobStatus === 'running';

  async function handleEvaluate(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!niche.trim() || !serviceIdea.trim()) {
      setValidationError('Please enter both a target niche and service idea to evaluate.');
      return;
    }

    const result = await onRunSimulation({
      niche: niche.trim(),
      serviceIdea: serviceIdea.trim(),
      workspaceContext: workspaceContext.trim(),
      targetConstraint: deliveryConstraint.trim() || undefined,
      sourceLeadNames: leads.slice(0, 3).map((l) => l.businessName),
    });

    if (result) {
      setDraft(result);
      setSavedNotice(false);
    }
  }

  function handleSaveCurrentDraft() {
    if (!draft) return;
    onSaveStrategy(draft, undefined, 'hypothesis');
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  }

  function handleQuickFillLead(leadId: string) {
    const found = leads.find((l) => l.id === leadId);
    if (!found) return;
    setNiche(found.industry);
    setServiceIdea(found.serviceOffered);
    setWorkspaceContext(`${found.businessName}: ${found.observedProblem}`);
  }

  return (
    <div className="space-y-6">
      {/* Service Idea & Niche Evaluator Form */}
      <form
        onSubmit={handleEvaluate}
        className="rounded-md border border-[#2E3440] bg-[#222730] p-4 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Niche &amp; Service Idea Evaluator
          </h3>
          <span className="font-mono text-[11px] text-[#EAB365]">
            Simulation · Workspace-Grounded
          </span>
        </div>

        {leads.length > 0 && (
          <div>
            <label
              htmlFor="bs-lead-picker"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Pull Context from Saved Lead (Optional)
            </label>
            <select
              id="bs-lead-picker"
              defaultValue=""
              onChange={(e) => handleQuickFillLead(e.target.value)}
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            >
              <option value="">Choose a saved lead to inspect...</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.businessName} — {lead.industry}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="bs-niche"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Target Niche
            </label>
            <input
              id="bs-niche"
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. Boutique Dental Clinics"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="bs-service-idea"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Service Idea
            </label>
            <input
              id="bs-service-idea"
              type="text"
              value={serviceIdea}
              onChange={(e) => setServiceIdea(e.target.value)}
              placeholder="e.g. Branded Inquiry & Triage Sprint"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="bs-context"
            className="block text-xs font-medium text-[#A4AAB5] mb-1"
          >
            Observed Pattern / Workspace Notes
          </label>
          <textarea
            id="bs-context"
            rows={2}
            value={workspaceContext}
            onChange={(e) => setWorkspaceContext(e.target.value)}
            className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="bs-constraint"
            className="block text-xs font-medium text-[#A4AAB5] mb-1"
          >
            Delivery Guardrail / Constraint
          </label>
          <input
            id="bs-constraint"
            type="text"
            value={deliveryConstraint}
            onChange={(e) => setDeliveryConstraint(e.target.value)}
            className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
          />
        </div>

        {(validationError || lastError) && (
          <p role="alert" className="text-xs text-[#F87171]">
            {validationError || lastError}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-[#8A92A0]">
            Turns workspace evidence into a testable service experiment.
          </p>
          <button
            type="submit"
            disabled={isRunning}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3.5 py-2 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {isRunning ? 'Evaluating...' : 'Evaluate Idea'}
          </button>
        </div>
      </form>

      {/* Editable Experiment Draft */}
      {draft && (
        <section
          aria-label="Editable strategy experiment draft"
          className="rounded-md border border-[#22D3EE]/50 bg-[#1B2228] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#F4EFE6] flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-[#22D3EE]" aria-hidden="true" />
              Experiment Brief (Editable)
            </h3>
            <button
              type="button"
              onClick={handleSaveCurrentDraft}
              className="inline-flex items-center gap-1.5 rounded bg-[#22D3EE] px-3 py-1.5 text-xs font-semibold text-[#14171C] hover:bg-[#5CE1F5] cursor-pointer"
            >
              {savedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Saved
                </>
              ) : (
                'Save Experiment'
              )}
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <label
                htmlFor="bs-draft-title"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] mb-1"
              >
                Title
              </label>
              <input
                id="bs-draft-title"
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="bs-draft-hypothesis"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] mb-1"
              >
                Hypothesis
              </label>
              <textarea
                id="bs-draft-hypothesis"
                rows={3}
                value={draft.hypothesis}
                onChange={(e) =>
                  setDraft({ ...draft, hypothesis: e.target.value })
                }
                className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="bs-draft-metric"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] mb-1"
                >
                  Success Metric
                </label>
                <input
                  id="bs-draft-metric"
                  type="text"
                  value={draft.successMetric}
                  onChange={(e) =>
                    setDraft({ ...draft, successMetric: e.target.value })
                  }
                  className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="bs-draft-price"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] mb-1"
                >
                  Estimated Price / Sprint
                </label>
                <input
                  id="bs-draft-price"
                  type="text"
                  value={draft.estimatedPriceRange}
                  onChange={(e) =>
                    setDraft({ ...draft, estimatedPriceRange: e.target.value })
                  }
                  className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#EAB365] focus:border-[#22D3EE] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] mb-1">
                Experiment Steps
              </p>
              <ul className="space-y-1 text-xs text-[#C7C2B8]">
                {draft.experimentPlan.map((step, i) => (
                  <li key={i}>• {step}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Saved Strategy Experiments */}
      <section aria-label="Saved strategy experiments" className="space-y-2.5">
        <div className="flex items-baseline justify-between border-t border-[#2A303B] pt-4">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Strategy Experiments ({strategyBriefs.length})
          </h3>
          <span className="text-xs text-[#8A92A0]">
            Auto-saved from reviews &amp; brainstorms
          </span>
        </div>

        {strategyBriefs.length === 0 ? (
          <p className="rounded border border-dashed border-[#2E3440] p-4 text-xs text-[#8A92A0]">
            No strategy experiments recorded yet. Run an evaluation above or watch the Business Strategist log patterns from workspace leads.
          </p>
        ) : (
          <div className="space-y-2.5">
            {strategyBriefs.map((exp) => {
              const isHighlighted = selectedStrategyId === exp.id;
              const reviewStatus = getStrategyDisplayStatus(exp, reviewQueue);
              return (
                <div
                  key={exp.id}
                  className={`rounded-md border p-3.5 space-y-2.5 ${
                    isHighlighted
                      ? 'border-[#22D3EE] bg-[#1A252C]'
                      : 'border-[#2E3440] bg-[#1B1F26]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#F4EFE6]">
                        {exp.title}
                      </p>
                      <p className="text-xs text-[#A4AAB5] mt-0.5">
                        {exp.niche} · {exp.estimatedPriceRange}
                        {exp.isDemo ? ' · Demo' : ''}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        reviewStatus === 'Ready for review'
                          ? 'text-[#EAB365]'
                          : STATUS_COLOR[exp.status]
                      }`}
                    >
                      {reviewStatus === 'Ready for review'
                        ? 'Ready for review'
                        : `${STATUS_LABEL[exp.status]} · Completed`}
                    </span>
                  </div>

                  <p className="text-xs text-[#C7C2B8] leading-relaxed">
                    {exp.hypothesis}
                  </p>

                  {exp.evidenceFromWorkspace.length > 0 && (
                    <div className="rounded border border-[#2A303B] bg-[#16191F] p-2 space-y-1">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
                        Workspace Evidence
                      </p>
                      {exp.evidenceFromWorkspace.map((ev, idx) => (
                        <p key={idx} className="text-[11px] text-[#C7C2B8]">
                          • {ev}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-[#A4AAB5]">
                    <span className="text-[#EAB365] font-medium">Success metric:</span>{' '}
                    {exp.successMetric}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#262B35]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['hypothesis', 'testing', 'validated'] as const).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => onUpdateStrategyStatus(exp.id, st)}
                            className={`rounded px-2 py-1 text-[11px] font-medium cursor-pointer border ${
                              exp.status === st
                                ? 'border-[#22D3EE] bg-[#172830] text-[#22D3EE]'
                                : 'border-[#303744] bg-[#16191F] text-[#8A92A0] hover:text-[#F4EFE6]'
                            }`}
                          >
                            {STATUS_LABEL[st]}
                          </button>
                        )
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void onConvertStrategyToProject(exp)}
                        className="inline-flex items-center gap-1 rounded border border-[#22D3EE]/50 bg-[#17262B] px-2.5 py-1 text-xs font-medium text-[#22D3EE] hover:bg-[#1E333A] cursor-pointer"
                      >
                        Turn into Project
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>

                      {onRequestSendOffer && (
                        <button
                          type="button"
                          onClick={() => void onRequestSendOffer(exp)}
                          className="inline-flex items-center gap-1 rounded border border-[#EAB365]/50 bg-[#272014] px-2.5 py-1 text-xs font-medium text-[#EAB365] hover:bg-[#332A1A] cursor-pointer"
                        >
                          <Send className="w-3 h-3" aria-hidden="true" />
                          Send Pilot (Approval)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historical Proposal Archive (Read-Only Preserved Data) */}
      {historicalProposals.length > 0 && (
        <section
          aria-label="Historical proposal archive"
          className="space-y-2 border-t border-[#2A303B] pt-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#A4AAB5] flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5 text-[#8A92A0]" aria-hidden="true" />
              Historical Records ({historicalProposals.length})
            </h3>
            <span className="font-mono text-[10px] text-[#777E8B]">
              Read-only archive
            </span>
          </div>

          <div className="space-y-2">
            {historicalProposals.map((prop) => (
              <div
                key={prop.id}
                className="rounded border border-[#2A303B] bg-[#16191F] p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#E4DFD5]">
                    {prop.clientName}
                  </span>
                  <span className="font-mono text-[10px] text-[#8A92A0]">
                    {prop.budget} · {prop.timeline} · {prop.createdAt}
                  </span>
                </div>
                <p className="text-[11px] text-[#A4AAB5]">{prop.projectGoal}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
