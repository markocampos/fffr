import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSimulationRunner } from './simulationRunner.ts';
import { createInitialWorkspaceState } from '../state/seedDemo.ts';
import {
  computeProjectProgress,
  deriveProjectStatus,
} from '../state/workspaceStore.ts';

const runner = new LocalSimulationRunner({ delayMs: 0 });

test('Lead Finder generates input-responsive fictional leads and validates required fields', async () => {
  const invalid = await runner.run('lead-finder', {
    industry: '',
    location: 'Seattle, WA',
    targetClient: '',
    service: 'Custom Web App',
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.code, 'VALIDATION_ERROR');
    assert.ok(invalid.fieldErrors?.industry);
    assert.ok(invalid.fieldErrors?.targetClient);
  }

  const runA = await runner.run('lead-finder', {
    industry: 'Architecture',
    location: 'Portland, OR',
    targetClient: 'Boutique studio principals',
    service: 'Client Portal Automation',
  });
  const runB = await runner.run('lead-finder', {
    industry: 'Biotech Labs',
    location: 'Boston, MA',
    targetClient: 'Lab operations directors',
    service: 'LIMS Integration',
  });

  assert.equal(runA.ok, true);
  assert.equal(runB.ok, true);
  if (runA.ok && runB.ok) {
    assert.equal(runA.mode, 'simulation');
    assert.equal(runA.output.leads.length, 3);
    assert.match(runA.output.leads[0].businessName, /Fictional/i);
    assert.match(runA.output.leads[0].businessName, /Architecture/i);
    assert.match(runB.output.leads[0].businessName, /Biotech/i);
    assert.notEqual(
      runA.output.leads[0].observedProblem,
      runB.output.leads[0].observedProblem
    );
  }
});

test('Business Strategist evaluates service ideas using workspace leads and produces testable experiment briefs', async () => {
  const invalid = await runner.run('business-strategist', {
    niche: '',
    serviceIdea: '',
    workspaceContext: '',
  });
  assert.equal(invalid.ok, false);

  const res = await runner.run('business-strategist', {
    niche: 'Boutique Dental Clinics',
    serviceIdea: '2-Week Patient Intake & Reminder Sprint',
    workspaceContext:
      'Saved leads report overnight inquiry backlogs in shared front-desk inboxes.',
    sourceLeadNames: ['Hearthstone Dental Group (Fictional Demo)'],
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    const exp = res.output.experiment;
    assert.match(exp.title, /Boutique Dental Clinics/);
    assert.match(exp.hypothesis, /2-Week Patient Intake/i);
    assert.ok(exp.evidenceFromWorkspace.length >= 1);
    assert.ok(exp.experimentPlan.length >= 3);
    assert.ok(exp.successMetric.length > 10);
  }
});

test('Project Tracker creates plans and generates client updates reflecting live tasks and blockers', async () => {
  const planRes = await runner.run('project-tracker', {
    mode: 'create-plan',
    clientName: 'Northbridge Studio',
    projectTitle: 'Client Portal Automation',
    goal: 'Eliminate manual intake spreadsheets',
    deliverables: ['Intake form', 'n8n routing worker'],
    timeline: '4 weeks',
  });
  assert.equal(planRes.ok, true);

  const state = createInitialWorkspaceState();
  const project = state.projects[0];
  const progress = computeProjectProgress(project);
  assert.equal(progress.doneTasks, 1);
  assert.equal(progress.blockedTasks, 1);
  assert.equal(deriveProjectStatus(project), 'at-risk');

  const updateRes = await runner.run('project-tracker', {
    mode: 'client-update',
    project,
  });
  assert.equal(updateRes.ok, true);
  if (updateRes.ok && updateRes.output.mode === 'client-update') {
    assert.match(updateRes.output.update.body, /Copperleaf/);
    assert.match(updateRes.output.update.body, /Waiting on Copperleaf IT/);
    assert.match(updateRes.output.update.subject, /25% Complete/);
  }
});

test('Content Creator produces 3 distinct editable drafts reflecting platform, topic, offer, tone, and CTA', async () => {
  const res = await runner.run('content-creator', {
    platform: 'LinkedIn',
    topic: 'API webhook reliability',
    offer: 'Automation Hardening Sprint',
    tone: 'Direct & pragmatic',
    cta: 'DM "HARDEN" for a free audit',
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.output.drafts.length, 3);
    for (const draft of res.output.drafts) {
      assert.ok(draft.hook.includes('API webhook reliability'));
      assert.ok(draft.body.includes('Automation Hardening Sprint'));
      assert.equal(draft.callToAction, 'DM "HARDEN" for a free audit');
    }
  }
});
