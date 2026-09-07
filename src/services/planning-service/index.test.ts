import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlanningService, type TaskContext } from './index';
import { LoadstoneNexusBackend } from '../memory-service/loadstonenexus-backend';

describe('PlanningService', () => {
  const testBaseDir = path.join(process.cwd(), '.test-planning-deck-' + Date.now());
  const testDataDir = path.join(process.cwd(), '.test-planning-data-' + Date.now());
  let memoryBackend: LoadstoneNexusBackend;
  let service: PlanningService;

  beforeEach(async () => {
    await fs.mkdir(testBaseDir, { recursive: true });
    await fs.mkdir(testDataDir, { recursive: true });
    memoryBackend = new LoadstoneNexusBackend({
      mode: 'local',
      dataDir: testDataDir,
    });
    service = new PlanningService(memoryBackend);
  });

  afterEach(async () => {
    memoryBackend.close();
    await fs.rm(testBaseDir, { recursive: true, force: true });
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('classifies task archetypes accurately based on context and labels', () => {
    expect(service.classifyArchetype({ issueTitle: 'Fix crash in auth', issueBody: '', labels: ['hotfix'] })).toBe('H');
    expect(service.classifyArchetype({ issueTitle: 'Critical Security Outage', issueBody: '', labels: [] })).toBe('H');
    expect(service.classifyArchetype({ issueTitle: 'Redesign DB', issueBody: '', labels: ['architecture'] })).toBe('A');
    expect(service.classifyArchetype({ issueTitle: 'Fix typo in docs', issueBody: '', labels: ['docs'] })).toBe('C');
    expect(service.classifyArchetype({ issueTitle: 'Add webhook notification', issueBody: 'Standard feature', labels: ['enhancement'] })).toBe('B');
  });

  it('generates all Hanoi Rainbow SDD documents and mirrors to memory backend', async () => {
    const ctx: TaskContext = {
      trackId: 'track-404',
      repo: 'apache/casbin-gateway',
      issueNumber: 404,
      issueTitle: 'Add OAuth Provider',
      issueBody: 'Implement GitHub OAuth2 provider',
      baseDir: testBaseDir,
    };

    const intent = await service.generateIntent(ctx, 'B', 'analyst-dave');
    expect(intent).toContain('# Intent Document (Guard 1)');
    expect(intent).toContain('CERTIFIED by analyst-dave');

    const spec = await service.generateSpec(ctx, 'B');
    expect(spec).toContain('# Technical Specification');

    const design = await service.generateDesign(ctx);
    expect(design).toContain('# Architectural Design');

    const plan = await service.generatePlan(ctx, 'engineer-alice');
    expect(plan).toContain('# Implementation Plan (Guard 2)');
    expect(plan).toContain('engineer-alice');

    const evidence = await service.generateEvidence(ctx, '10 tests passed (100%)', 'lead-bob');
    expect(evidence.markdown).toContain('# Guard 3 Evidence Package');
    expect(evidence.json.sha256).toBeDefined();

    // Verify disk files
    const trackDir = path.join(testBaseDir, 'flight-deck', 'tracks', 'track-404');
    const files = await fs.readdir(trackDir);
    expect(files).toContain('intent.md');
    expect(files).toContain('spec.md');
    expect(files).toContain('design.md');
    expect(files).toContain('plan.md');
    expect(files).toContain('guard-evidence.md');
    expect(files).toContain('evidence.json');

    // Verify memory backend mirroring
    const mirroredDocs = await memoryBackend.retrieve_guard_document('track-404');
    expect(mirroredDocs).toHaveLength(5);
  });

  it('includes the relay-stop-slop verdict in the Guard 3 evidence package when provided', async () => {
    const ctx: TaskContext = {
      trackId: 'track-405',
      repo: 'apache/casbin-gateway',
      issueNumber: 405,
      issueTitle: 'Add OAuth Provider',
      issueBody: 'Implement GitHub OAuth2 provider',
      baseDir: testBaseDir,
    };

    const evidence = await service.generateEvidence(ctx, '10 tests passed (100%)', 'lead-bob', {
      verdict: 'PASS',
      reasons: 'No slop found.',
    });

    expect(evidence.markdown).toContain('relay-stop-slop');
    expect(evidence.markdown).toContain('PASS');
    expect(evidence.markdown).toContain('No slop found.');
    expect(evidence.json.stopSlopVerdict).toBe('PASS');
  });

  it('auto-certifies Guard 1 for archetype C and H', async () => {
    const ctx: TaskContext = {
      trackId: 'track-c',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Doc typo',
      issueBody: 'Fix spelling',
      baseDir: testBaseDir,
    };

    const intent = await service.generateIntent(ctx, 'C');
    expect(intent).toContain('AUTO-CERTIFIED (Bypass)');
  });
});
