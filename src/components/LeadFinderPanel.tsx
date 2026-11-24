import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Play, Trash2 } from 'lucide-react';
import type {
  BotJobStatus,
  LeadCandidate,
  LeadRecord,
  ReviewItem,
} from '../types/workspace';
import type { LeadFinderInput } from '../workflows/runner';
import { getLeadDisplayStatus } from '../state/reviewStatus';

interface LeadFinderPanelProps {
  leads: LeadRecord[];
  reviewQueue: ReviewItem[];
  selectedLeadId?: string | null;
  jobStatus: BotJobStatus;
  lastError?: string;
  onRunSimulation: (input: LeadFinderInput) => Promise<LeadCandidate[] | null>;
  onSaveLead: (candidate: LeadCandidate) => void;
  onSendToStrategist: (lead: LeadRecord) => void;
  onDeleteLead: (leadId: string) => void;
}

export function LeadFinderPanel({
  leads,
  reviewQueue,
  selectedLeadId,
  jobStatus,
  lastError,
  onRunSimulation,
  onSaveLead,
  onSendToStrategist,
  onDeleteLead,
}: LeadFinderPanelProps) {
  const [industry, setIndustry] = useState('Regional Logistics');
  const [location, setLocation] = useState('Austin, TX');
  const [targetClient, setTargetClient] = useState('Operations Directors');
  const [service, setService] = useState('n8n Dispatch & Invoice Automation');

  const [candidates, setCandidates] = useState<LeadCandidate[]>([]);
  const [savedCandidateIds, setSavedCandidateIds] = useState<Record<string, boolean>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const isRunning = jobStatus === 'running';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!industry.trim() || !location.trim() || !targetClient.trim() || !service.trim()) {
      setValidationError('Please complete industry, location, target client, and Rhymvex service.');
      return;
    }

    const result = await onRunSimulation({
      industry: industry.trim(),
      location: location.trim(),
      targetClient: targetClient.trim(),
      service: service.trim(),
    });

    if (result) {
      setCandidates(result);
      setSavedCandidateIds({});
    }
  }

  function updateCandidateField(
    id: string,
    field: 'businessName' | 'observedProblem' | 'suggestedOffer' | 'outreachAngle' | 'outreachDraft',
    value: string
  ) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  }

  function handleSaveCandidate(candidate: LeadCandidate) {
    onSaveLead(candidate);
    setSavedCandidateIds((prev) => ({ ...prev, [candidate.id]: true }));
  }

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-md border border-[#2E3440] bg-[#222730] p-4 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Prospect Research Brief
          </h3>
          <span className="font-mono text-[11px] text-[#EAB365]">
            Simulation · Draft Outreach Only
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="lf-industry"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Industry
            </label>
            <input
              id="lf-industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Cold-Chain Freight"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="lf-location"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Location
            </label>
            <input
              id="lf-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Chicago, IL"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="lf-target"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Target Client
            </label>
            <input
              id="lf-target"
              type="text"
              value={targetClient}
              onChange={(e) => setTargetClient(e.target.value)}
              placeholder="e.g. Operations Directors"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="lf-service"
              className="block text-xs font-medium text-[#A4AAB5] mb-1"
            >
              Rhymvex Service to Offer
            </label>
            <input
              id="lf-service"
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Custom Intake Portal"
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
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
            Generates fictional businesses tailored to your brief.
          </p>
          <button
            type="submit"
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3.5 py-2 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {isRunning ? 'Running Simulation...' : 'Run Simulation'}
          </button>
        </div>
      </form>

      {/* Generated Shortlist */}
      {candidates.length > 0 && (
        <section aria-label="Simulated lead shortlist" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[#F4EFE6]">
              Simulated Shortlist ({candidates.length})
            </h3>
            <span className="font-mono text-[11px] text-[#A4AAB5]">
              Simulation · Edit before saving
            </span>
          </div>

          {candidates.map((candidate, idx) => {
            const isSaved = Boolean(savedCandidateIds[candidate.id]);
            return (
              <div
                key={candidate.id}
                className="rounded-md border border-[#2E3440] bg-[#1E232B] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <label
                      htmlFor={`cand-name-${idx}`}
                      className="sr-only"
                    >
                      Business name for candidate {idx + 1}
                    </label>
                    <input
                      id={`cand-name-${idx}`}
                      type="text"
                      value={candidate.businessName}
                      onChange={(e) =>
                        updateCandidateField(candidate.id, 'businessName', e.target.value)
                      }
                      className="w-full bg-transparent text-sm font-semibold text-[#F4EFE6] border-b border-transparent hover:border-[#343B48] focus:border-[#22D3EE] focus:outline-none pb-0.5"
                    />
                    <p className="text-xs text-[#A4AAB5] mt-0.5">
                      {candidate.industry} · {candidate.location} · {candidate.targetClient}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isSaved}
                    onClick={() => handleSaveCandidate(candidate)}
                    aria-label={`Save ${candidate.businessName} to pipeline`}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      isSaved
                        ? 'bg-[#1F3328] text-[#4ADE80] border border-[#2E543D] cursor-default'
                        : 'bg-[#22D3EE] text-[#14171C] hover:bg-[#5CE1F5]'
                    }`}
                  >
                    {isSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Saved to Pipeline
                      </>
                    ) : (
                      'Save to Pipeline'
                    )}
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label
                      htmlFor={`cand-prob-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Observed Problem
                    </label>
                    <textarea
                      id={`cand-prob-${idx}`}
                      rows={2}
                      value={candidate.observedProblem}
                      onChange={(e) =>
                        updateCandidateField(candidate.id, 'observedProblem', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cand-offer-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Suggested Offer
                    </label>
                    <textarea
                      id={`cand-offer-${idx}`}
                      rows={2}
                      value={candidate.suggestedOffer}
                      onChange={(e) =>
                        updateCandidateField(candidate.id, 'suggestedOffer', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cand-angle-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Outreach Angle
                    </label>
                    <input
                      id={`cand-angle-${idx}`}
                      type="text"
                      value={candidate.outreachAngle}
                      onChange={(e) =>
                        updateCandidateField(candidate.id, 'outreachAngle', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cand-draft-${idx}`}
                      className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                    >
                      Outreach Draft (For Review Only)
                    </label>
                    <textarea
                      id={`cand-draft-${idx}`}
                      rows={2}
                      value={candidate.outreachDraft}
                      onChange={(e) =>
                        updateCandidateField(candidate.id, 'outreachDraft', e.target.value)
                      }
                      className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#E4DFD5] focus:border-[#22D3EE] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Saved Pipeline */}
      <section aria-label="Saved lead pipeline" className="space-y-2.5">
        <div className="flex items-baseline justify-between border-t border-[#2A303B] pt-4">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Saved Pipeline ({leads.length})
          </h3>
          <span className="text-xs text-[#8A92A0]">
            Send any lead to Business Strategist
          </span>
        </div>

        {leads.length === 0 ? (
          <p className="rounded border border-dashed border-[#2E3440] p-4 text-xs text-[#8A92A0]">
            No saved leads yet. Run a simulation above and save promising prospects to your pipeline.
          </p>
        ) : (
          <div className="space-y-2.5">
            {leads.map((lead) => {
              const isHighlighted = selectedLeadId === lead.id;
              const displayStatus = getLeadDisplayStatus(lead, reviewQueue);
              return (
                <div
                  key={lead.id}
                  data-testid={`saved-lead-card-${lead.id}`}
                  data-highlighted={isHighlighted ? 'true' : 'false'}
                  className={`rounded-md border p-3.5 space-y-2 ${
                    isHighlighted
                      ? 'border-[#22D3EE] bg-[#1A252C]'
                      : 'border-[#2E3440] bg-[#1B1F26]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#F4EFE6]">
                        {lead.businessName}
                      </p>
                      <p className="text-xs text-[#A4AAB5] mt-0.5">
                        {lead.industry} · {lead.location} · {lead.serviceOffered}
                        {lead.isDemo ? ' · Demo' : ''}
                      </p>
                    </div>
                    <span
                      data-testid={`lead-status-${lead.id}`}
                      className={`font-mono text-[11px] shrink-0 ${
                        displayStatus === 'Ready for review'
                          ? 'text-[#EAB365]'
                          : displayStatus === 'Evaluated'
                            ? 'text-[#4ADE80]'
                            : 'text-[#8A92A0]'
                      }`}
                    >
                      {displayStatus}
                    </span>
                  </div>

                  {lead.sampleInquiryFlow && (
                    <p className="text-[11px] text-[#A4AAB5]">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#777E8B] mr-1.5">
                        Sample inquiry flow:
                      </span>
                      {lead.sampleInquiryFlow}
                    </p>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs text-[#E4DFD5] leading-relaxed">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#EAB365] mr-1.5">
                        Observed problem:
                      </span>
                      {lead.observedProblem}
                    </p>
                    <p className="text-xs text-[#C7C2B8] leading-relaxed">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#22D3EE] mr-1.5">
                        Suggested Rhymvex offer:
                      </span>
                      {lead.suggestedOffer}
                    </p>
                  </div>

                  {lead.tags && lead.tags.length > 0 && (
                    <p className="font-mono text-[10px] text-[#777E8B]">
                      {lead.tags.map((tag) => `#${tag}`).join(' · ')}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onSendToStrategist(lead)}
                      className="inline-flex items-center gap-1.5 rounded border border-[#22D3EE]/50 bg-[#17262B] px-3 py-1.5 text-xs font-medium text-[#22D3EE] hover:bg-[#1E333A] transition-colors cursor-pointer"
                    >
                      Evaluate with Strategist
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLead(lead.id)}
                      aria-label={`Remove ${lead.businessName} from pipeline`}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[#8A92A0] hover:text-[#F87171] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
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
