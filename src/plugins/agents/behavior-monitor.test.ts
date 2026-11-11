import { describe, expect, it } from 'bun:test';
import { EventBus } from '../../core/event-bus.ts';
import {
  behavioralFingerprint,
  fetchClaritySignals,
  isSignalAboveThreshold,
  mapClarityInsightsToSignals,
  pollBehaviorMonitor,
  runBehaviorMonitorLoop,
  type ClarityFrustrationSignal,
  type BehaviorMonitorDeps,
} from './behavior-monitor.ts';

describe('BehaviorMonitor', () => {
  const sampleSignal: ClarityFrustrationSignal = {
    frictionType: 'rage_clicks',
    url: '/checkout',
    selector: 'button#pay-now',
    sessionCount: 45,
    eventCount: 88,
    frustrationScore: 0.85,
    replayUrls: ['https://clarity.microsoft.com/replay/session123'],
    deviceBreakdown: { mobile: 80, desktop: 20 },
  };

  it('generates deterministic fingerprint for identical routes and selectors', () => {
    const fp1 = behavioralFingerprint('owner/repo', sampleSignal);
    const fp2 = behavioralFingerprint('owner/repo', {
      ...sampleSignal,
      selector: 'BUTTON#PAY-NOW ',
      url: '/checkout?ref=campaign',
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toContain('behavior_owner-repo_rage_clicks_-checkout_button-pay-now');
  });

  it('evaluates threshold criteria correctly', () => {
    expect(isSignalAboveThreshold(sampleSignal)).toBe(true);

    const lowSignal: ClarityFrustrationSignal = {
      frictionType: 'rage_clicks',
      url: '/home',
      sessionCount: 2,
      eventCount: 5,
      frustrationScore: 0.1,
      replayUrls: [],
    };
    expect(isSignalAboveThreshold(lowSignal)).toBe(false);

    // Meets custom low threshold
    expect(isSignalAboveThreshold(lowSignal, { minRageClicks: 3 })).toBe(true);

    // A single frustrated session on a quiet page can't pass on score alone
    expect(isSignalAboveThreshold({ ...lowSignal, sessionCount: 1, frustrationScore: 1 })).toBe(false);

    expect(isSignalAboveThreshold({ ...lowSignal, frictionType: 'quick_backs', eventCount: 12 }, { minQuickBacks: 10 })).toBe(true);
    expect(isSignalAboveThreshold({ ...lowSignal, frictionType: 'excessive_scroll', eventCount: 12 }, { minQuickBacks: 10 })).toBe(false);
  });

  it('maps Clarity Data Export metric blocks into friction signals', () => {
    const signals = mapClarityInsightsToSignals([
      { metricName: 'Traffic', information: [{ totalSessionCount: '900', URL: 'https://shop.test/' }] },
      {
        metricName: 'RageClickCount',
        information: [
          { sessionsCount: '400', sessionsWithMetricPercentage: 12.5, subTotal: '73', URL: 'https://shop.test/checkout' },
          { sessionsCount: '10', sessionsWithMetricPercentage: 0, subTotal: '0' },
        ],
      },
      { metricName: 'Script Error Count', information: [{ sessionsCount: '50', sessionsWithMetricPercentage: 40, subTotal: '19', Url: '/cart' }] },
    ]);

    expect(signals).toEqual([
      { frictionType: 'rage_clicks', url: 'https://shop.test/checkout', eventCount: 73, sessionCount: 50, frustrationScore: 0.13, replayUrls: [] },
      { frictionType: 'js_exceptions', url: '/cart', eventCount: 19, sessionCount: 20, frustrationScore: 0.4, replayUrls: [] },
    ]);
  });

  it('fetches signals from the Data Export API using the lookback window', async () => {
    let requested = '';
    const fakeFetch = (async (url: string, init: RequestInit) => {
      requested = url;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify([
        { metricName: 'DeadClickCount', information: [{ sessionsCount: '100', sessionsWithMetricPercentage: 50, subTotal: '31', URL: '/pay' }] },
      ]));
    }) as unknown as typeof fetch;

    const signals = await fetchClaritySignals('tok', 48, fakeFetch);
    expect(requested).toContain('numOfDays=2');
    expect(requested).toContain('dimension1=URL');
    expect(signals[0]).toMatchObject({ frictionType: 'dead_clicks', url: '/pay', eventCount: 31 });

    await fetchClaritySignals('tok', 240, fakeFetch);
    expect(requested).toContain('numOfDays=3');
  });

  it('surfaces Clarity API failures instead of reporting zero friction', async () => {
    const quotaFetch = (async () => new Response('Exceeded daily limit', { status: 429 })) as unknown as typeof fetch;
    const deps: BehaviorMonitorDeps = {
      githubTool: { execute: async () => ({ success: true, data: [] }) } as any,
      repo: 'owner/repo',
      clarityApiToken: 'tok',
      fetchImpl: quotaFetch,
    };
    await expect(pollBehaviorMonitor(deps)).rejects.toThrow('daily export quota exceeded');
    await expect(pollBehaviorMonitor({ ...deps, clarityApiToken: undefined })).rejects.toThrow('CLARITY_API_TOKEN');
  });

  it('treats closed issues as existing and refuses to file when the issue list is unavailable', async () => {
    const calls: any[] = [];
    const fp = behavioralFingerprint('owner/repo', sampleSignal);
    const githubTool = {
      execute: async (args: any) => {
        calls.push(args);
        if (args.action === 'list_issues') return { success: true, data: [{ body: `closed one <!-- fingerprint: ${fp} -->` }] };
        return { success: true, data: { number: 1, htmlUrl: 'x' } };
      },
    };
    const res = await pollBehaviorMonitor({ githubTool: githubTool as any, repo: 'owner/repo', fetchSignals: async () => [sampleSignal] });
    expect(calls[0]).toMatchObject({ action: 'list_issues', state: 'all', labels: ['behavior'] });
    expect(res.skippedDuplicates).toBe(1);
    expect(calls.some(c => c.action === 'create_issue')).toBe(false);

    const failingTool = { execute: async () => ({ success: false, error: 'GitHub API error 502' }) };
    await expect(
      pollBehaviorMonitor({ githubTool: failingTool as any, repo: 'owner/repo', fetchSignals: async () => [sampleSignal] })
    ).rejects.toThrow('skipping batch');
  });

  it('polls signals, creates GitHub issue with replay links, and prevents duplicates', async () => {
    const createdIssues: any[] = [];
    const openIssues: { number: number; title: string; body: string; labels: string[] }[] = [];

    const mockGithubTool = {
      name: 'github',
      description: 'mock',
      parameters: {} as any,
      execute: async (args: any) => {
        if (args.action === 'list_issues') {
          return { success: true, data: [...openIssues] };
        }
        if (args.action === 'create_issue') {
          const newIssue = {
            number: 101 + createdIssues.length,
            title: args.title,
            body: args.body,
            labels: args.labels,
            htmlUrl: `https://github.com/owner/repo/issues/${101 + createdIssues.length}`,
          };
          createdIssues.push(newIssue);
          openIssues.push(newIssue);
          return { success: true, data: newIssue };
        }
        return { success: false, error: 'unknown action' };
      },
    };

    const eventBus = new EventBus();
    const emittedEvents: any[] = [];
    eventBus.on('behavior.anomaly_detected', p => { emittedEvents.push({ type: 'behavior.anomaly_detected', ...p }); });
    eventBus.on('behavior.issue_created', p => { emittedEvents.push({ type: 'behavior.issue_created', ...p }); });

    const deps: BehaviorMonitorDeps = {
      githubTool: mockGithubTool as any,
      repo: 'owner/repo',
      fetchSignals: async () => [sampleSignal],
      eventBus,
    };

    // First poll: creates the issue
    const res1 = await pollBehaviorMonitor(deps);
    expect(res1.signalsFound).toBe(1);
    expect(res1.issuesCreated).toBe(1);
    expect(res1.skippedDuplicates).toBe(0);
    expect(createdIssues).toHaveLength(1);
    expect(createdIssues[0].title).toBe('[UX Friction: Rage Clicks] button#pay-now on /checkout');
    expect(createdIssues[0].body).toContain('https://clarity.microsoft.com/replay/session123');
    expect(createdIssues[0].body).toContain('<!-- fingerprint:');
    expect(emittedEvents).toHaveLength(2);
    expect(emittedEvents[0].type).toBe('behavior.anomaly_detected');
    expect(emittedEvents[1].type).toBe('behavior.issue_created');
    expect(emittedEvents[1].issueNumber).toBe(101);

    // Second poll with same signal: deduplication prevents second issue
    const res2 = await pollBehaviorMonitor(deps);
    expect(res2.signalsFound).toBe(1);
    expect(res2.issuesCreated).toBe(0);
    expect(res2.skippedDuplicates).toBe(1);
    expect(createdIssues).toHaveLength(1); // No new issue created
  });

  it('runs monitor loop honoring maxIterations and heartbeat', async () => {
    let heartbeats = 0;
    const deps: BehaviorMonitorDeps = {
      githubTool: {
        name: 'github',
        description: 'mock',
        parameters: {} as any,
        execute: async () => ({ success: true, data: [] }),
      } as any,
      repo: 'owner/repo',
      fetchSignals: async () => {
        throw new Error('Clarity down');
      },
    };

    // A failing batch must not kill the worker: the loop logs, heartbeats, and keeps going.
    await runBehaviorMonitorLoop(deps, {
      intervalMs: 1,
      maxIterations: 3,
      onHeartbeat: () => {
        heartbeats++;
      },
    });

    expect(heartbeats).toBe(3);
  });
});
