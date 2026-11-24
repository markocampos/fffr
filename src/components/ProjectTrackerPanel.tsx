import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Plus,
} from 'lucide-react';
import type {
  BotJobStatus,
  ClientUpdateDraft,
  ProjectRecord,
  ProjectTaskStatus,
} from '../types/workspace';
import {
  computeProjectProgress,
  deriveProjectStatus,
} from '../state/workspaceStore';

interface ProjectTrackerPanelProps {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  jobStatus: BotJobStatus;
  lastError?: string;
  onCreateManualProject: (input: {
    clientName: string;
    projectTitle: string;
    goal: string;
    deliverables: string;
    timeline: string;
  }) => Promise<void>;
  onUpdateProject: (
    updated: ProjectRecord,
    activityAction: string,
    activityDetail: string
  ) => void;
  onGenerateClientUpdate: (project: ProjectRecord) => Promise<ClientUpdateDraft | null>;
}

const PROJECT_STATUS_LABEL: Record<ProjectRecord['status'], string> = {
  active: 'Active',
  'at-risk': 'At Risk (Blocker Flagged)',
  completed: 'Completed',
};

export function ProjectTrackerPanel({
  projects,
  selectedProjectId,
  onSelectProject,
  jobStatus,
  lastError,
  onCreateManualProject,
  onUpdateProject,
  onGenerateClientUpdate,
}: ProjectTrackerPanelProps) {
  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const [showNewForm, setShowNewForm] = useState(false);
  const [newClient, setNewClient] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newDeliverables, setNewDeliverables] = useState(
    'Workflow Architecture\nAutomated Sync Pipeline\nHandoff Documentation'
  );
  const [newTimeline, setNewTimeline] = useState('4 weeks');
  const [formError, setFormError] = useState<string | null>(null);

  // Add task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskOwner, setTaskOwner] = useState('Automation Eng');
  const [taskDue, setTaskDue] = useState('2026-12-08');

  // Client update draft editing
  const [copyFeedback, setCopyFeedback] = useState(false);

  const isRunning = jobStatus === 'running';

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!newClient.trim() || !newTitle.trim() || !newGoal.trim()) {
      setFormError('Client name, project title, and project goal are required.');
      return;
    }
    await onCreateManualProject({
      clientName: newClient.trim(),
      projectTitle: newTitle.trim(),
      goal: newGoal.trim(),
      deliverables: newDeliverables.trim(),
      timeline: newTimeline.trim() || '4 weeks',
    });
    setNewClient('');
    setNewTitle('');
    setNewGoal('');
    setShowNewForm(false);
  }

  function handleToggleMilestone(milestoneId: string) {
    if (!activeProject) return;
    const nextMilestones = activeProject.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    const target = nextMilestones.find((m) => m.id === milestoneId);
    const updated: ProjectRecord = {
      ...activeProject,
      milestones: nextMilestones,
    };
    onUpdateProject(
      updated,
      'Milestone updated',
      `${activeProject.title}: "${target?.title}" marked ${
        target?.completed ? 'complete' : 'open'
      }.`
    );
  }

  function handleChangeTaskStatus(taskId: string, nextStatus: ProjectTaskStatus) {
    if (!activeProject) return;
    const nextTasks = activeProject.tasks.map((t) =>
      t.id === taskId ? { ...t, status: nextStatus } : t
    );
    const target = nextTasks.find((t) => t.id === taskId);
    const draftProject: ProjectRecord = { ...activeProject, tasks: nextTasks };
    draftProject.status = deriveProjectStatus(draftProject);
    onUpdateProject(
      draftProject,
      'Task progress updated',
      `${activeProject.title}: "${target?.title}" → ${nextStatus}.`
    );
  }

  function handleToggleBlocker(taskId: string) {
    if (!activeProject) return;
    const nextTasks = activeProject.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const nextBlocked = !t.blocked;
      return {
        ...t,
        blocked: nextBlocked,
        blockerNote:
          nextBlocked && !t.blockerNote
            ? 'Awaiting client credentials or review sign-off.'
            : t.blockerNote,
      };
    });
    const target = nextTasks.find((t) => t.id === taskId);
    const draftProject: ProjectRecord = { ...activeProject, tasks: nextTasks };
    draftProject.status = deriveProjectStatus(draftProject);
    onUpdateProject(
      draftProject,
      target?.blocked ? 'Blocker flagged' : 'Blocker cleared',
      `${activeProject.title}: "${target?.title}".`
    );
  }

  function handleUpdateBlockerNote(taskId: string, note: string) {
    if (!activeProject) return;
    const nextTasks = activeProject.tasks.map((t) =>
      t.id === taskId ? { ...t, blockerNote: note } : t
    );
    const draftProject: ProjectRecord = { ...activeProject, tasks: nextTasks };
    onUpdateProject(
      draftProject,
      'Blocker note updated',
      `${activeProject.title}: updated blocker context.`
    );
  }

  function handleAddTask(e: FormEvent) {
    e.preventDefault();
    if (!activeProject || !taskTitle.trim()) return;
    const newTask = {
      id: `task-${Date.now()}`,
      title: taskTitle.trim(),
      owner: taskOwner.trim() || 'Delivery Lead',
      dueDate: taskDue || '2026-12-12',
      status: 'todo' as ProjectTaskStatus,
      blocked: false,
      blockerNote: '',
    };
    const draftProject: ProjectRecord = {
      ...activeProject,
      tasks: [...activeProject.tasks, newTask],
    };
    draftProject.status = deriveProjectStatus(draftProject);
    onUpdateProject(
      draftProject,
      'Task added',
      `${activeProject.title}: added "${newTask.title}".`
    );
    setTaskTitle('');
  }

  function handleEditClientUpdate(
    updateId: string,
    field: 'subject' | 'body',
    value: string
  ) {
    if (!activeProject) return;
    const nextUpdates = activeProject.clientUpdates.map((u) =>
      u.id === updateId ? { ...u, [field]: value } : u
    );
    onUpdateProject(
      { ...activeProject, clientUpdates: nextUpdates },
      'Client update edited',
      `${activeProject.title}: edited draft client update.`
    );
  }

  async function handleCopyUpdate(update: ClientUpdateDraft) {
    const fullText = `Subject: ${update.subject}\n\n${update.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      // Fallback ignored gracefully
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2200);
  }

  const progress = activeProject ? computeProjectProgress(activeProject) : null;
  const latestUpdate = activeProject?.clientUpdates[0] || null;

  return (
    <div className="space-y-5">
      {/* Project Selector + New Manual Project Button */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-md border border-[#2E3440] bg-[#222730] p-3.5">
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="pt-project-select"
            className="block text-xs font-medium text-[#A4AAB5] mb-1"
          >
            Active Project Workspace
          </label>
          <select
            id="pt-project-select"
            value={activeProject?.id || ''}
            onChange={(e) => onSelectProject(e.target.value)}
            className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-2 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.clientName})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowNewForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded border border-[#3E4656] bg-[#1B1F26] px-3 py-2 text-xs font-medium text-[#F4EFE6] hover:border-[#22D3EE] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          {showNewForm ? 'Cancel' : 'New Manual Project'}
        </button>
      </div>

      {/* Optional Manual Project Form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateProject}
          className="rounded-md border border-[#22D3EE]/40 bg-[#1C212A] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F4EFE6]">
              Create Project Plan
            </h3>
            <span className="font-mono text-[11px] text-[#EAB365]">
              Simulation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="pt-new-client"
                className="block text-xs text-[#A4AAB5] mb-1"
              >
                Client Name
              </label>
              <input
                id="pt-new-client"
                type="text"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                placeholder="e.g. Harbor Dental"
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="pt-new-title"
                className="block text-xs text-[#A4AAB5] mb-1"
              >
                Project Title
              </label>
              <input
                id="pt-new-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Patient Intake Sync"
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="pt-new-goal"
                className="block text-xs text-[#A4AAB5] mb-1"
              >
                Project Goal
              </label>
              <input
                id="pt-new-goal"
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="e.g. Automate intake forms and front-desk CRM updates"
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="pt-new-deliv"
                className="block text-xs text-[#A4AAB5] mb-1"
              >
                Deliverables (one per line)
              </label>
              <textarea
                id="pt-new-deliv"
                rows={2}
                value={newDeliverables}
                onChange={(e) => setNewDeliverables(e.target.value)}
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="pt-new-timeline"
                className="block text-xs text-[#A4AAB5] mb-1"
              >
                Timeline
              </label>
              <input
                id="pt-new-timeline"
                type="text"
                value={newTimeline}
                onChange={(e) => setNewTimeline(e.target.value)}
                className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-sm text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-[#F87171]">
              {formError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isRunning}
              className="rounded bg-[#EAB365] px-3.5 py-1.5 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 cursor-pointer"
            >
              {isRunning ? 'Building Plan...' : 'Create Project (Simulation)'}
            </button>
          </div>
        </form>
      )}

      {lastError && (
        <p role="alert" className="text-xs text-[#F87171]">
          {lastError}
        </p>
      )}

      {activeProject && progress && (
        <>
          {/* Project Overview + Progress Bar */}
          <section className="rounded-md border border-[#2E3440] bg-[#1D2129] p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#F4EFE6]">
                  {activeProject.title}
                </h3>
                <p className="text-xs text-[#A4AAB5] mt-0.5">
                  {activeProject.clientName}
                  {activeProject.isDemo ? ' · Demo' : ''}
                </p>
              </div>
              <span
                className={`font-mono text-xs ${
                  activeProject.status === 'at-risk'
                    ? 'text-[#F87171]'
                    : activeProject.status === 'completed'
                      ? 'text-[#4ADE80]'
                      : 'text-[#EAB365]'
                }`}
              >
                {PROJECT_STATUS_LABEL[activeProject.status]}
              </span>
            </div>

            <p className="text-xs text-[#C7C2B8] leading-relaxed">
              {activeProject.summary}
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#A4AAB5]">
                <span>
                  {progress.doneTasks}/{progress.totalTasks} tasks complete
                  {progress.blockedTasks > 0
                    ? ` · ${progress.blockedTasks} blocked`
                    : ''}
                </span>
                <span className="text-[#F4EFE6]">{progress.percent}%</span>
              </div>
              <div className="h-2 w-full rounded bg-[#14171C] overflow-hidden">
                <div
                  className="h-full bg-[#22D3EE] transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            {activeProject.activeDecisions &&
              activeProject.activeDecisions.decisions.length > 0 && (
                <div
                  data-testid="project-restored-decisions"
                  className="border-t border-[#2A303B] pt-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-[#22D3EE]">
                      Restored Whiteboard Decisions
                    </h4>
                    <span className="font-mono text-[10px] text-[#8A92A0]">
                      {activeProject.activeDecisions.sessionTitle} ·{' '}
                      {activeProject.activeDecisions.restoredAt}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-[#D5D0C6]">
                    {activeProject.activeDecisions.decisions.map((dec, idx) => (
                      <li key={idx} className="leading-relaxed">
                        • {dec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </section>

          {/* Milestones */}
          <section aria-label="Project milestones" className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#8A92A0]">
              Milestones ({activeProject.milestones.length})
            </h4>
            <div className="space-y-1.5">
              {activeProject.milestones.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded border border-[#2A303B] bg-[#1B1F26] px-3 py-2 cursor-pointer hover:border-[#3A4252]"
                >
                  <span className="flex items-center gap-2.5 text-xs text-[#F4EFE6]">
                    <input
                      type="checkbox"
                      checked={m.completed}
                      onChange={() => handleToggleMilestone(m.id)}
                      className="h-3.5 w-3.5 accent-[#22D3EE]"
                    />
                    <span className={m.completed ? 'line-through text-[#8A92A0]' : ''}>
                      {m.title}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#8A92A0] tabular-nums shrink-0">
                    {m.targetDate}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Tasks */}
          <section aria-label="Project tasks" className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#8A92A0]">
              Tasks ({activeProject.tasks.length})
            </h4>

            <div className="space-y-2">
              {activeProject.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-md border p-3 space-y-2 ${
                    task.blocked
                      ? 'border-[#7F1D1D] bg-[#241A1C]'
                      : 'border-[#2E3440] bg-[#1B1F26]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-[#F4EFE6]">
                        {task.title}
                      </p>
                      <p className="font-mono text-[11px] text-[#8A92A0] mt-0.5 tabular-nums">
                        {task.owner} · Due {task.dueDate}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status for ${task.title}`}
                        value={task.status}
                        onChange={(e) =>
                          handleChangeTaskStatus(
                            task.id,
                            e.target.value as ProjectTaskStatus
                          )
                        }
                        className="rounded border border-[#343B48] bg-[#14171C] px-2 py-1 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
                      >
                        <option value="todo">To do</option>
                        <option value="in-progress">In progress</option>
                        <option value="done">Done</option>
                      </select>

                      <button
                        type="button"
                        aria-pressed={task.blocked}
                        aria-label={
                          task.blocked
                            ? `Clear blocker for ${task.title}`
                            : `Flag blocker for ${task.title}`
                        }
                        onClick={() => handleToggleBlocker(task.id)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          task.blocked
                            ? 'bg-[#7F1D1D] text-[#FECACA] hover:bg-[#991B1B]'
                            : 'border border-[#343B48] bg-[#222730] text-[#A4AAB5] hover:text-[#F87171]'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        {task.blocked ? 'Blocked' : 'Flag Blocker'}
                      </button>
                    </div>
                  </div>

                  {task.blocked && (
                    <div>
                      <label
                        htmlFor={`blocker-note-${task.id}`}
                        className="block text-[11px] font-mono text-[#FCA5A5] mb-1"
                      >
                        Blocker Note
                      </label>
                      <input
                        id={`blocker-note-${task.id}`}
                        type="text"
                        value={task.blockerNote}
                        onChange={(e) =>
                          handleUpdateBlockerNote(task.id, e.target.value)
                        }
                        placeholder="Describe what is blocking this task..."
                        className="w-full rounded border border-[#7F1D1D] bg-[#171214] px-2.5 py-1.5 text-xs text-[#FEE2E2] focus:border-[#F87171] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quick Add Task */}
            <form
              onSubmit={handleAddTask}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1"
            >
              <input
                type="text"
                aria-label="New task title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Add a delivery task..."
                className="sm:col-span-6 rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
              />
              <input
                type="text"
                aria-label="New task owner"
                value={taskOwner}
                onChange={(e) => setTaskOwner(e.target.value)}
                placeholder="Owner"
                className="sm:col-span-3 rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
              />
              <button
                type="submit"
                className="sm:col-span-3 rounded border border-[#3E4656] bg-[#222730] px-2.5 py-1.5 text-xs font-medium text-[#F4EFE6] hover:border-[#22D3EE] cursor-pointer"
              >
                + Add Task
              </button>
            </form>
          </section>

          {/* Draft Client Update */}
          <section
            aria-label="Client update generator"
            className="rounded-md border border-[#2E3440] bg-[#1E232B] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-[#F4EFE6]">
                  Client Status Update
                </h4>
                <p className="text-xs text-[#8A92A0]">
                  Drafted from live tasks, milestones, and blockers · Review before sending
                </p>
              </div>
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onGenerateClientUpdate(activeProject)}
                className="inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3 py-1.5 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                {isRunning ? 'Generating...' : 'Generate Client Update (Simulation)'}
              </button>
            </div>

            {latestUpdate && (
              <div className="space-y-2.5 border-t border-[#2E3440] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-[#EAB365]">
                    Simulation Draft · Generated {latestUpdate.generatedAt}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyUpdate(latestUpdate)}
                    className="inline-flex items-center gap-1 rounded border border-[#343B48] bg-[#222730] px-2.5 py-1 text-xs text-[#F4EFE6] hover:border-[#4B5563] cursor-pointer"
                  >
                    {copyFeedback ? (
                      <Check className="w-3.5 h-3.5 text-[#4ADE80]" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {copyFeedback ? 'Copied' : 'Copy Update'}
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="pt-update-subject"
                    className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                  >
                    Email Subject
                  </label>
                  <input
                    id="pt-update-subject"
                    type="text"
                    value={latestUpdate.subject}
                    onChange={(e) =>
                      handleEditClientUpdate(latestUpdate.id, 'subject', e.target.value)
                    }
                    className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pt-update-body"
                    className="block text-[11px] font-mono uppercase tracking-wider text-[#8A92A0] mb-1"
                  >
                    Draft Update Body (For Review Only)
                  </label>
                  <textarea
                    id="pt-update-body"
                    rows={8}
                    value={latestUpdate.body}
                    onChange={(e) =>
                      handleEditClientUpdate(latestUpdate.id, 'body', e.target.value)
                    }
                    className="w-full rounded border border-[#303744] bg-[#16191F] px-2.5 py-2 text-xs text-[#E4DFD5] leading-relaxed font-mono focus:border-[#22D3EE] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
