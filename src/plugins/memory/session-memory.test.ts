import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SessionMemory } from './session-memory';
import { LoadstoneNexusBackend } from '../../services/memory-service/loadstonenexus-backend';
import { ObsidianBackend } from '../../services/memory-service/obsidian-backend';
import type { KnowledgeBackend } from '../../core/interfaces/memory-interface';

interface BackendUnderTest {
  name: string;
  create(dataDir: string): KnowledgeBackend & { close?: () => void };
}

// Run every SessionMemory behavior against both KnowledgeBackend implementations —
// SessionMemory is written against the interface, so a bug specific to one backend
// (e.g. how it maps an id to a filesystem path) must not go unexercised.
const backendsUnderTest: BackendUnderTest[] = [
  { name: 'LoadstoneNexusBackend', create: (dataDir) => new LoadstoneNexusBackend({ mode: 'local', dataDir }) },
  { name: 'ObsidianBackend', create: (dataDir) => new ObsidianBackend({ vaultPath: dataDir }) },
];

for (const { name, create } of backendsUnderTest) {
  describe(`SessionMemory (${name})`, () => {
    const dataDir = path.join(process.cwd(), `.test-session-mem-${name}-${Date.now()}`);
    let backend: KnowledgeBackend & { close?: () => void };
    let sessionMemory: SessionMemory;

    beforeEach(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      backend = create(dataDir);
      sessionMemory = new SessionMemory(backend);
    });

    afterEach(async () => {
      backend.close?.();
      await fs.rm(dataDir, { recursive: true, force: true });
    });

    it('records decisions and mirrors to decision journal', async () => {
      await sessionMemory.recordDecision('track-99', 'Switch from Redis to Bun in-process queue', ['arch', 'queue']);

      const file = await fs.readFile(path.join(dataDir, 'decisions', 'decisions.md'), 'utf-8');
      expect(file).toContain('[Track: `track-99`]');
      expect(file).toContain('Switch from Redis to Bun in-process queue');
    });

    it('updates and retrieves LodestarMemory Bank sections', async () => {
      const empty = await sessionMemory.getMemoryBank('my-repo');
      expect(empty).toEqual({});

      await sessionMemory.updateMemoryBank('my-repo', 'activeContext', 'Refactoring auth service');
      await sessionMemory.updateMemoryBank('my-repo', 'progress', 'Phase 2 tests passing');

      const bank = await sessionMemory.getMemoryBank('my-repo');
      expect(bank.activeContext).toBe('Refactoring auth service');
      expect(bank.progress).toBe('Phase 2 tests passing');
      expect(bank.decisionLog).toBeUndefined();
    });

    it('keeps memory banks isolated per repo, including owner/repo-style ids', async () => {
      await sessionMemory.updateMemoryBank('apache/casbin-gateway', 'activeContext', 'Fixing auth bug');
      await sessionMemory.updateMemoryBank('org/other-repo', 'activeContext', 'Unrelated work');

      const a = await sessionMemory.getMemoryBank('apache/casbin-gateway');
      const b = await sessionMemory.getMemoryBank('org/other-repo');
      expect(a.activeContext).toBe('Fixing auth bug');
      expect(b.activeContext).toBe('Unrelated work');
    });

    it('round-trips an explicitly cleared (empty string) section as empty, not undefined', async () => {
      await sessionMemory.updateMemoryBank('my-repo', 'activeContext', 'in progress');
      await sessionMemory.updateMemoryBank('my-repo', 'activeContext', '');

      const bank = await sessionMemory.getMemoryBank('my-repo');
      expect(bank.activeContext).toBe('');
    });

    it('does not lose a section update from a concurrent updateMemoryBank call', async () => {
      await Promise.all([
        sessionMemory.updateMemoryBank('my-repo', 'activeContext', 'A'),
        sessionMemory.updateMemoryBank('my-repo', 'progress', 'B'),
      ]);

      const bank = await sessionMemory.getMemoryBank('my-repo');
      expect(bank.activeContext).toBe('A');
      expect(bank.progress).toBe('B');
    });

    it('persists and retrieves dev journal entries for agents', async () => {
      const id1 = await sessionMemory.persistDevJournal('agent-casbin-alpha', 'Analyzing issue #42', { issue: 42 });
      expect(id1).toBeDefined();

      const id2 = await sessionMemory.persistDevJournal('agent-casbin-alpha', 'Generated intent.md', { trackId: 'track-42' });
      expect(id2).toBeDefined();

      const entries = await sessionMemory.getDevJournal('agent-casbin-alpha');
      expect(entries).toHaveLength(2);
      const messages = entries.map((e) => e.message);
      expect(messages).toContain('Generated intent.md');
      expect(messages).toContain('Analyzing issue #42');
    });

    it('keeps dev journals isolated per agent', async () => {
      await sessionMemory.persistDevJournal('agent-alpha', 'alpha entry');
      await sessionMemory.persistDevJournal('agent-beta', 'beta entry');

      const alphaEntries = await sessionMemory.getDevJournal('agent-alpha');
      const betaEntries = await sessionMemory.getDevJournal('agent-beta');
      expect(alphaEntries.map((e) => e.message)).toEqual(['alpha entry']);
      expect(betaEntries.map((e) => e.message)).toEqual(['beta entry']);
    });
  });
}
