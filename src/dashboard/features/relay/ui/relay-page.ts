import type { RelayStatusData } from '../use-cases/get-relay-status.ts';

function step(n: number, label: string, sub: string, done: boolean): string {
  return `<div class="step ${done ? 'done' : 'pending'}"><div class="step-circle">${n}</div><div class="step-label">${label}</div><div class="step-sub">${sub}</div></div>`;
}

function stageCard(icon: string, title: string, badge: string, auto: boolean, subtitle: string): string {
  return `<div class="card ${auto ? 'stage-auto' : 'stage-pending'}">
    <div class="card-header">
      <div class="card-title-group"><span class="card-icon">${icon}</span><span class="card-title">${title}</span></div>
      <span class="badge-pill ${auto ? 'badge-green' : 'badge-orange'}">${badge}</span>
    </div>
    <div class="card-subtitle">${subtitle}</div>
  </div>`;
}

export function renderRelayPage(data: RelayStatusData): string {
  const hasPending = data.shapePending > 0;

  return `
    <div class="stepper">
      ${step(1, '1. Intake', '/intake-routing', true)}
      <div class="step-connector ${data.totalTracks > 0 ? 'done' : ''}"></div>
      ${step(2, '2. Shape', 'Guard 1 · intent', !hasPending)}
      <div class="step-connector ${data.planInProgress + data.shipped > 0 ? 'done' : ''}"></div>
      ${step(3, '3. Plan', 'Guard 2 · plan.md', data.planInProgress + data.shipped > 0)}
      <div class="step-connector ${data.shipped > 0 ? 'done' : ''}"></div>
      ${step(4, '4. Build', 'implementer · slop', data.shipped > 0)}
      <div class="step-connector ${data.shipped > 0 ? 'done' : ''}"></div>
      ${step(5, '5. Verify', 'reviewer · SAST', data.shipped > 0)}
      <div class="step-connector ${data.shipped > 0 ? 'done' : ''}"></div>
      ${step(6, '6. Ship', 'Guard 3 · evidence', data.shipped > 0)}
    </div>

    <div class="relay-grid-3x2">
      ${stageCard('📥', '1. Intake', `${data.totalTracks} total`, true, '/intake-routing · real track count from flight-deck/tracks/')}
      ${stageCard('📐', '2. Shape (Guard 1)', `${data.shapePending} pending — Analyst`, !hasPending, 'Named human Analyst must certify intent.md')}
      ${stageCard('🌳', '3. Plan (Guard 2)', `${data.planInProgress} in flight`, true, 'Engineer self-signed plan.md + worktree allocation')}
      ${stageCard('🔨', '4. Build & Slop', `${data.shipped} passed`, true, 'relay-implementer → relay-stop-slop, PASS required to advance')}
      ${stageCard('🔍', '5. Verify & SAST', `${data.shipped} passed`, true, 'Pre-merge rebase check + relay-reviewer')}
      ${stageCard('🚀', '6. Ship (Guard 3)', `${data.shipped} certified`, true, 'Lead certifies guard-evidence.md + evidence.json — zero bypass')}
    </div>

    <details class="card" style="border-left: 3px solid #58a6ff;">
      <summary style="cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
        <div class="card-title-group"><span class="card-icon">📋</span><span class="card-title">STAGE AUDIT HISTORY</span></div>
      </summary>
      <div class="empty-state" style="margin-top: 10px;">
        No persisted per-stage timestamp log exists yet — the event bus is in-memory only and engine.ts doesn't write a
        stage-audit trail to disk. Guard sign-off status per track is real and browsable on the
        <a href="/memories" class="guard-doc-link">Memories</a> screen's Guard Document Browser instead.
      </div>
    </details>
  `;
}
