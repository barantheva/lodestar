import type { KnowledgeBackend } from '../../core/interfaces/memory-interface';

export interface MemoryBankSection {
  activeContext?: string;
  progress?: string;
  decisionLog?: string;
  systemPatterns?: string;
}

export class SessionMemory {
  // Serializes updateMemoryBank per repo so two concurrent workers updating
  // different sections of the same repo's bank can't lose one write to a race.
  private readonly memoryBankLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly memoryService: KnowledgeBackend) {}

  /**
   * Records a key architectural or design decision with tags.
   */
  async recordDecision(trackId: string, quote: string, tags: string[] = []): Promise<void> {
    await this.memoryService.persist_decision(trackId, quote, tags);
  }

  /**
   * Updates a section of the LodestarMemory Bank for a specific repository.
   */
  async updateMemoryBank(
    repo: string,
    section: 'activeContext' | 'progress' | 'decisionLog' | 'systemPatterns',
    content: string
  ): Promise<void> {
    const previous = this.memoryBankLocks.get(repo) ?? Promise.resolve();
    const next = previous.then(async () => {
      const existing = await this.getMemoryBank(repo);
      const updated = {
        ...existing,
        [section]: content,
        updatedAt: Date.now(),
      };

      await this.memoryService.persist_knowledge('memory-banks', {
        id: repo,
        repo,
        ...updated,
      });
    });

    this.memoryBankLocks.set(repo, next);
    try {
      await next;
    } finally {
      if (this.memoryBankLocks.get(repo) === next) {
        this.memoryBankLocks.delete(repo);
      }
    }
  }

  /**
   * Retrieves the full LodestarMemory Bank for a specific repository.
   */
  async getMemoryBank(repo: string): Promise<MemoryBankSection> {
    const records = await this.memoryService.retrieve_knowledge('memory-banks', { repo });
    if (records.length === 0) {
      return {};
    }
    const item = records[0] as Record<string, unknown>;
    return {
      activeContext: (item.activeContext as string) ?? undefined,
      progress: (item.progress as string) ?? undefined,
      decisionLog: (item.decisionLog as string) ?? undefined,
      systemPatterns: (item.systemPatterns as string) ?? undefined,
    };
  }

  /**
   * Persists an agent dev-journal entry to knowledge storage.
   */
  async persistDevJournal(
    agentName: string,
    message: string,
    meta: Record<string, unknown> = {}
  ): Promise<string> {
    const collection = `dev-journal/${agentName}`;
    const res = await this.memoryService.persist_knowledge(collection, {
      agentName,
      message,
      timestamp: Date.now(),
      ...meta,
    });
    return res.id;
  }

  /**
   * Retrieves dev-journal entries for a given agent.
   */
  async getDevJournal(agentName: string): Promise<Array<Record<string, unknown>>> {
    const collection = `dev-journal/${agentName}`;
    const items = await this.memoryService.retrieve_knowledge(collection);
    return items as Array<Record<string, unknown>>;
  }
}
