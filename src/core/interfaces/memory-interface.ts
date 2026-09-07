export interface GuardDocumentItem {
  kind: 'intent' | 'spec' | 'design' | 'plan' | 'evidence';
  content: string;
  signedBy?: string;
  sha256?: string;
  timestamp?: number;
}

export interface KnowledgeBackend {
  persist_knowledge(collection: string, doc: Record<string, unknown>): Promise<{ id: string }>;
  retrieve_knowledge(collection: string, query?: Record<string, unknown>): Promise<unknown[]>;
  persist_decision(trackId: string, quote: string, tags: string[]): Promise<void>;
  persist_guard_document(trackId: string, kind: 'intent' | 'spec' | 'design' | 'plan' | 'evidence', content: string, signedBy?: string): Promise<void>;
  retrieve_guard_document(trackId: string, kind?: string): Promise<GuardDocumentItem[]>;
}
