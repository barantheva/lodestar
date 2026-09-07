import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type TrackStatus = 'guard1_pending' | 'in_progress' | 'shipped' | 'unknown';

export interface TrackRecord {
  trackId: string;
  repo?: string;
  issueNumber?: number;
  issueTitle?: string;
  archetype?: 'A' | 'B' | 'C' | 'H';
  status: TrackStatus;
  guard1SignedBy?: string;
  guard2SignedBy?: string;
  guard3SignedBy?: string;
  stopSlopVerdict?: 'PASS' | 'FAIL';
  shippedAt?: number;
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  return fs.readFile(filePath, 'utf-8').catch(() => undefined);
}

function parseIntent(content: string): Partial<TrackRecord> {
  const repo = content.match(/\*\*Repository\*\*: `([^`]+)`/)?.[1];
  const issueMatch = content.match(/\*\*Issue\*\*: #(\d+) - (.+)/);
  const archetype = content.match(/\*\*Archetype\*\*: \*\*([ABCH])\*\*/)?.[1] as TrackRecord['archetype'];
  const statusMatch = content.match(/\*\*Status\*\*: (CERTIFIED by (.+)|AUTO-CERTIFIED.*|PENDING SIGNATURE)/);

  let guard1SignedBy: string | undefined;
  if (statusMatch) {
    if (statusMatch[2]) guard1SignedBy = statusMatch[2].trim();
    else if (statusMatch[1].startsWith('AUTO-CERTIFIED')) guard1SignedBy = 'auto-bypass';
  }

  return {
    repo,
    issueNumber: issueMatch ? Number(issueMatch[1]) : undefined,
    issueTitle: issueMatch?.[2]?.trim(),
    archetype,
    guard1SignedBy,
  };
}

function parsePlan(content: string): Partial<TrackRecord> {
  const guard2SignedBy = content.match(/\*\*Engineer Self-Signature\*\*: `([^`]+)`/)?.[1];
  return { guard2SignedBy };
}

function parseEvidenceJson(content: string): Partial<TrackRecord> {
  try {
    const json = JSON.parse(content);
    return {
      guard3SignedBy: json.signedBy,
      stopSlopVerdict: json.stopSlopVerdict,
      shippedAt: json.timestamp,
    };
  } catch {
    return {};
  }
}

export async function listTracks(baseDir: string = process.cwd()): Promise<TrackRecord[]> {
  const tracksDir = path.join(baseDir, 'flight-deck', 'tracks');
  const entries = await fs.readdir(tracksDir, { withFileTypes: true }).catch(() => []);
  const trackIds = entries.filter(e => e.isDirectory()).map(e => e.name);

  const tracks: TrackRecord[] = [];
  for (const trackId of trackIds) {
    const trackDir = path.join(tracksDir, trackId);
    const [intent, plan, evidenceJson] = await Promise.all([
      readIfExists(path.join(trackDir, 'intent.md')),
      readIfExists(path.join(trackDir, 'plan.md')),
      readIfExists(path.join(trackDir, 'evidence.json')),
    ]);

    let record: TrackRecord = { trackId, status: 'unknown' };
    if (intent) record = { ...record, ...parseIntent(intent) };
    if (plan) record = { ...record, ...parsePlan(plan) };
    if (evidenceJson) record = { ...record, ...parseEvidenceJson(evidenceJson) };

    if (evidenceJson) record.status = 'shipped';
    else if (plan) record.status = 'in_progress';
    else if (intent) record.status = 'guard1_pending';

    tracks.push(record);
  }

  return tracks;
}
