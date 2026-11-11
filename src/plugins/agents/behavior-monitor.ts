import type { Tool } from '../../core/interfaces/tool-interface.ts';
import type { EventBus } from '../../core/event-bus.ts';
import { fetchClarityLiveInsights, type ClarityMetricBlock } from '../../data-access/clarity-client.ts';

export type ClarityFrictionType =
  | 'rage_clicks'
  | 'dead_clicks'
  | 'excessive_scroll'
  | 'quick_backs'
  | 'js_exceptions';

export interface ClarityFrustrationSignal {
  frictionType: ClarityFrictionType;
  url: string;
  selector?: string;
  sessionCount: number;
  eventCount: number;
  frustrationScore: number;
  replayUrls: string[];
  deviceBreakdown?: Record<string, number>;
  browserBreakdown?: Record<string, number>;
  errorMessage?: string;
}

export interface ClarityThresholdConfig {
  minRageClicks?: number;
  minDeadClicks?: number;
  minJsExceptions?: number;
  minQuickBacks?: number;
  minExcessiveScroll?: number;
  minFrustrationScore?: number;
  lookbackHours?: number;
}

export interface BehaviorMonitorDeps {
  githubTool: Tool<any, any>;
  repo: string;
  clarityApiToken?: string;
  fetchImpl?: typeof fetch;
  fetchSignals?: (deps: BehaviorMonitorDeps) => Promise<ClarityFrustrationSignal[]>;
  thresholds?: ClarityThresholdConfig;
  eventBus?: EventBus;
}

export interface BehaviorMonitorResult {
  signalsFound: number;
  issuesCreated: number;
  skippedDuplicates: number;
  belowThreshold: number;
}

export interface WorkerLoopOptions {
  intervalMs?: number;
  maxIterations?: number;
  onHeartbeat?: () => void;
}

export function behavioralFingerprint(repo: string, signal: ClarityFrustrationSignal): string {
  const normSelector = (signal.selector || 'page').toLowerCase().replace(/\s+/g, '');
  const normUrl = signal.url.split('?')[0].toLowerCase();
  return `behavior_${repo.replace(/\W+/g, '-')}_${signal.frictionType}_${normUrl.replace(/\W+/g, '-')}_${normSelector.replace(/\W+/g, '-')}`;
}

export function isSignalAboveThreshold(
  signal: ClarityFrustrationSignal,
  thresholds: ClarityThresholdConfig = {}
): boolean {
  const minRage = thresholds.minRageClicks ?? 20;
  const minDead = thresholds.minDeadClicks ?? 30;
  const minJs = thresholds.minJsExceptions ?? 15;
  const minQuickBacks = thresholds.minQuickBacks ?? 30;
  const minScroll = thresholds.minExcessiveScroll ?? 30;
  const minScore = thresholds.minFrustrationScore ?? 0.65;

  // ponytail: fixed session floor so one frustrated visit on a quiet page (score 1.0) can't file an issue; make it an env var if tuning is needed.
  if (signal.frustrationScore >= minScore && signal.sessionCount >= MIN_SESSIONS_FOR_SCORE) return true;

  switch (signal.frictionType) {
    case 'rage_clicks':
      return signal.eventCount >= minRage;
    case 'dead_clicks':
      return signal.eventCount >= minDead;
    case 'js_exceptions':
      return signal.eventCount >= minJs;
    case 'quick_backs':
      return signal.eventCount >= minQuickBacks;
    case 'excessive_scroll':
      return signal.eventCount >= minScroll;
    default:
      return false;
  }
}

const MIN_SESSIONS_FOR_SCORE = 10;

const METRIC_TO_FRICTION: Record<string, ClarityFrictionType> = {
  rageclickcount: 'rage_clicks',
  deadclickcount: 'dead_clicks',
  excessivescroll: 'excessive_scroll',
  quickbackclick: 'quick_backs',
  scripterrorcount: 'js_exceptions',
};

// Field names (subTotal, sessionsCount, sessionsWithMetricPercentage, URL) follow observed Data Export
// responses — Microsoft's docs only sample the Traffic metric. Rows missing a URL are skipped.
export function mapClarityInsightsToSignals(blocks: ClarityMetricBlock[]): ClarityFrustrationSignal[] {
  const signals: ClarityFrustrationSignal[] = [];
  for (const block of blocks) {
    const frictionType = METRIC_TO_FRICTION[String(block.metricName).toLowerCase().replace(/[^a-z]/g, '')];
    if (!frictionType || !Array.isArray(block.information)) continue;
    for (const row of block.information) {
      const url = row.URL ?? row.Url ?? row.url;
      if (typeof url !== 'string' || !url) continue;
      const pct = Number(row.sessionsWithMetricPercentage) || 0;
      const totalSessions = Number(row.sessionsCount) || 0;
      signals.push({
        frictionType,
        url,
        eventCount: Number(row.subTotal) || 0,
        sessionCount: Math.round((totalSessions * pct) / 100),
        frustrationScore: Math.round(pct) / 100,
        replayUrls: [],
      });
    }
  }
  return signals;
}

export async function fetchClaritySignals(
  token: string,
  lookbackHours = 24,
  fetchImpl: typeof fetch = fetch
): Promise<ClarityFrustrationSignal[]> {
  const numOfDays = Math.min(3, Math.max(1, Math.ceil(lookbackHours / 24))) as 1 | 2 | 3;
  return mapClarityInsightsToSignals(await fetchClarityLiveInsights(token, numOfDays, fetchImpl));
}

export function formatBehavioralIssue(
  repo: string,
  signal: ClarityFrustrationSignal,
  fingerprint: string
): { title: string; body: string; labels: string[] } {
  const typeLabels: Record<ClarityFrictionType, string> = {
    rage_clicks: 'Rage Clicks',
    dead_clicks: 'Dead Clicks',
    excessive_scroll: 'Excessive Scrolling',
    quick_backs: 'Quick Backs',
    js_exceptions: 'JavaScript Exceptions',
  };

  const readableType = typeLabels[signal.frictionType] || signal.frictionType;
  const targetDesc = signal.selector ? `${signal.selector} on ${signal.url}` : signal.url;
  const title = `[UX Friction: ${readableType}] ${targetDesc}`;

  const suggestedArchetype = signal.frictionType === 'js_exceptions' ? 'C' : 'B';
  const archetypeDesc = suggestedArchetype === 'C'
    ? 'Archetype C (bounded bugfix with clear stack trace / exception signature)'
    : 'Archetype B (brownfield UX improvement with partial ACs for user flow)';

  const replaySection = signal.replayUrls.length > 0
    ? signal.replayUrls.map((u, i) => `- [Session Replay #${i + 1}](${u})`).join('\n')
    : '- *No direct session replay links provided by export.*';

  const deviceText = signal.deviceBreakdown
    ? Object.entries(signal.deviceBreakdown).map(([k, v]) => `${k}: ${v}%`).join(', ')
    : 'N/A';

  const errorDetail = signal.errorMessage
    ? `\n#### 💥 Client Exception\n\`\`\`text\n${signal.errorMessage}\n\`\`\`\n`
    : '';

  const body = `### 🚨 User Behavior Anomaly Detected (Microsoft Clarity)

- **Repository**: \`${repo}\`
- **Friction Type**: \`${signal.frictionType}\` (${readableType})
- **Impacted Route**: \`${signal.url}\`
- **Target DOM Selector**: \`${signal.selector || 'N/A (page level)'}\`
- **Impact Severity**: ${signal.eventCount} occurrences across ${signal.sessionCount} user sessions (Frustration Index: ${signal.frustrationScore})
- **Device Breakdown**: ${deviceText}

#### 📹 Session Replay Evidence
${replaySection}
${errorDetail}
#### 🔍 Diagnostics & Impact
High user friction detected via Microsoft Clarity behavioural telemetry. Users experienced unexpected friction preventing smooth completion of workflows.

#### 🎯 Recommended Action
- **Suggested SDD Archetype**: **${suggestedArchetype}** — ${archetypeDesc}
- **Next Steps**: Lodestar's \`issue-monitor\` can triage this issue into \`flight-deck/tracks/\` for autonomous shaping and Guard 1/2/3 remediation.

<!-- fingerprint: ${fingerprint} -->`;

  return {
    title,
    body,
    labels: ['behavior', 'clarity', 'ux-friction', 'triage'],
  };
}

export async function pollBehaviorMonitor(deps: BehaviorMonitorDeps): Promise<BehaviorMonitorResult> {
  const result: BehaviorMonitorResult = {
    signalsFound: 0,
    issuesCreated: 0,
    skippedDuplicates: 0,
    belowThreshold: 0,
  };

  let rawSignals: ClarityFrustrationSignal[];
  if (deps.fetchSignals) {
    rawSignals = await deps.fetchSignals(deps);
  } else if (deps.clarityApiToken) {
    rawSignals = await fetchClaritySignals(deps.clarityApiToken, deps.thresholds?.lookbackHours, deps.fetchImpl);
  } else {
    throw new Error('behavior-monitor needs CLARITY_API_TOKEN (or an injected fetchSignals)');
  }

  result.signalsFound = rawSignals.length;

  const candidateSignals: { signal: ClarityFrustrationSignal; fingerprint: string }[] = [];
  for (const signal of rawSignals) {
    if (!isSignalAboveThreshold(signal, deps.thresholds)) {
      result.belowThreshold++;
      continue;
    }
    const fingerprint = behavioralFingerprint(deps.repo, signal);
    candidateSignals.push({ signal, fingerprint });
  }

  if (candidateSignals.length === 0) {
    return result;
  }

  // Closed issues count too: a human closing one (fixed or won't-fix) must not trigger a re-file every batch.
  const existingIssuesRes = await deps.githubTool.execute({
    action: 'list_issues',
    repo: deps.repo,
    labels: ['behavior'],
    state: 'all',
  });
  if (!existingIssuesRes.success) {
    throw new Error(`Cannot check existing behavior issues, skipping batch to avoid duplicates: ${existingIssuesRes.error}`);
  }

  const existingFingerprints = new Set<string>();
  for (const issue of (existingIssuesRes.data ?? []) as { body: string }[]) {
    const match = issue.body?.match(/<!--\s*fingerprint:\s*([^\s]+)\s*-->/);
    if (match) {
      existingFingerprints.add(match[1]);
    }
  }

  for (const { signal, fingerprint } of candidateSignals) {
    if (existingFingerprints.has(fingerprint)) {
      result.skippedDuplicates++;
      continue;
    }

    const { title, body, labels } = formatBehavioralIssue(deps.repo, signal, fingerprint);
    const createRes = await deps.githubTool.execute({
      action: 'create_issue',
      repo: deps.repo,
      title,
      body,
      labels,
    });

    if (createRes.success && createRes.data) {
      existingFingerprints.add(fingerprint);
      result.issuesCreated++;

      const issueData = createRes.data as { number: number; htmlUrl: string };
      await deps.eventBus?.emit('behavior.anomaly_detected', {
        repo: deps.repo,
        frictionType: signal.frictionType,
        url: signal.url,
        selector: signal.selector,
        metrics: {
          eventCount: signal.eventCount,
          sessionCount: signal.sessionCount,
          frustrationScore: signal.frustrationScore,
        },
      });

      await deps.eventBus?.emit('behavior.issue_created', {
        repo: deps.repo,
        issueNumber: issueData.number,
        issueUrl: issueData.htmlUrl,
        frictionType: signal.frictionType,
      });
    }
  }

  return result;
}

export async function runBehaviorMonitorLoop(
  deps: BehaviorMonitorDeps,
  opts: WorkerLoopOptions = {}
): Promise<void> {
  // Batch interval defaults to 4 hours to respect Clarity Data Export quotas (~10 calls/day max).
  const intervalMs = opts.intervalMs ?? 4 * 3600_000;
  const maxIterations = opts.maxIterations ?? Infinity;

  for (let i = 0; i < maxIterations; i++) {
    try {
      const r = await pollBehaviorMonitor(deps);
      console.log(`[behavior-monitor] ${deps.repo}: ${r.signalsFound} signals, ${r.issuesCreated} issues filed, ${r.skippedDuplicates} duplicates, ${r.belowThreshold} below threshold`);
    } catch (err: any) {
      console.error(`[behavior-monitor] ${deps.repo}: batch failed — ${err.message}`);
    }
    opts.onHeartbeat?.();
    if (i < maxIterations - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
}
