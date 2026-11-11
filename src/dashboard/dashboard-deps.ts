import type { ServiceRegistry } from '../core/registry.ts';
import type { EventBus } from '../core/event-bus.ts';
import type { FleetDb } from '../services/agent-service/fleet-db.ts';
import type { KnowledgeBackend } from '../core/interfaces/memory-interface.ts';
import type { Config } from '../config/index.ts';
import type { AuthService } from '../services/auth-service/index.ts';

export interface DashboardDeps {
  registry: ServiceRegistry;
  eventBus: EventBus;
  fleetDb: FleetDb;
  memoryBackend?: KnowledgeBackend;
  authService?: AuthService;
  config: Config;
  baseDir?: string;
  hostname?: string;
}
