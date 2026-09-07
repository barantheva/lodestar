import type { EventBus } from '../core/event-bus.ts';

export type SseClient = (data: string) => void;

export class SseHub {
  private clients: Set<SseClient> = new Set();

  constructor(eventBus: EventBus) {
    eventBus.onAny((type, payload) => {
      const data = JSON.stringify({ type, payload });
      for (const client of this.clients) client(data);
    });
  }

  public subscribe(client: SseClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  public get clientCount(): number {
    return this.clients.size;
  }
}
