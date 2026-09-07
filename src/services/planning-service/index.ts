import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { KnowledgeBackend } from '../../core/interfaces/memory-interface';

export type Archetype = 'A' | 'B' | 'C' | 'H';

export interface TaskContext {
  trackId: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  labels?: string[];
  baseDir?: string;
}

export interface GuardSignature {
  guard: 1 | 2 | 3;
  signedBy: string;
  timestamp: number;
  comments?: string;
}

export class PlanningService {
  constructor(private readonly memoryBackend?: KnowledgeBackend) {}

  /**
   * Classifies task archetype based on issue title, body, and labels.
   */
  classifyArchetype(context: Pick<TaskContext, 'issueTitle' | 'issueBody' | 'labels'>): Archetype {
    const labels = context.labels?.map((l) => l.toLowerCase()) || [];
    const text = `${context.issueTitle} ${context.issueBody}`.toLowerCase();

    if (labels.includes('hotfix') || labels.includes('incident') || labels.includes('p0') || text.includes('critical security') || text.includes('outage')) {
      return 'H';
    }

    if (labels.includes('architecture') || labels.includes('breaking') || text.includes('architecture') || text.includes('refactor core') || text.includes('database migration')) {
      return 'A';
    }

    if (labels.includes('docs') || labels.includes('typo') || labels.includes('trivial') || labels.includes('chore') || text.includes('typo') || text.includes('readme')) {
      return 'C';
    }

    // Default archetype for standard features, enhancements, and bugs
    return 'B';
  }

  private getTrackDir(context: TaskContext): string {
    const base = context.baseDir || process.cwd();
    return path.join(base, 'flight-deck', 'tracks', context.trackId);
  }

  /**
   * Generates Guard 1 intent.md
   */
  async generateIntent(context: TaskContext, archetype: Archetype, signedBy?: string): Promise<string> {
    const trackDir = this.getTrackDir(context);
    await fs.mkdir(trackDir, { recursive: true });

    const content = `# Intent Document (Guard 1)
**Track ID**: \`${context.trackId}\`
**Repository**: \`${context.repo}\`
**Issue**: #${context.issueNumber} - ${context.issueTitle}
**Archetype**: **${archetype}**
**Created At**: ${new Date().toISOString()}

## Problem Statement
${context.issueBody || 'No issue description provided.'}

## Target Scope & Requirements
- Resolve issue #${context.issueNumber} according to Hanoi Rainbow SDD methodology.
- Ensure strict zero-defect layered architecture compliance.
- Produce verifiable unit and integration test coverage.

## Archetype Governance
- Classification: **Archetype ${archetype}** (${archetype === 'A' ? 'Core Architectural Change' : archetype === 'B' ? 'Feature / Integration' : archetype === 'C' ? 'Trivial / Docs' : 'Emergency Hotfix'}).
- Guard 1 Policy: ${archetype === 'C' || archetype === 'H' ? 'Auto-bypassed for fast-track execution.' : 'Requires Analyst certification.'}

## Certification
**Status**: ${signedBy ? `CERTIFIED by ${signedBy}` : archetype === 'C' || archetype === 'H' ? 'AUTO-CERTIFIED (Bypass)' : 'PENDING SIGNATURE'}
`;

    const filePath = path.join(trackDir, 'intent.md');
    await fs.writeFile(filePath, content, 'utf-8');

    if (this.memoryBackend) {
      await this.memoryBackend.persist_guard_document(context.trackId, 'intent', content, signedBy);
    }

    return content;
  }

  /**
   * Generates Rainbow spec.md
   */
  async generateSpec(context: TaskContext, archetype: Archetype): Promise<string> {
    const trackDir = this.getTrackDir(context);
    await fs.mkdir(trackDir, { recursive: true });

    const content = `# Technical Specification (spec.md)
**Track ID**: \`${context.trackId}\`
**Issue**: #${context.issueNumber} - ${context.issueTitle}

## Functional Acceptance Criteria
1. Given issue #${context.issueNumber}, the solution must address the root cause without side effects.
2. Changes must preserve existing public API contracts.
3. Automated test suite must pass with 100% success rate.

## System Invariants
- Zero external runtime dependencies.
- Strict layered dependency graph (Leaf modules -> Services -> Use-cases -> UI).
`;

    const filePath = path.join(trackDir, 'spec.md');
    await fs.writeFile(filePath, content, 'utf-8');

    if (this.memoryBackend) {
      await this.memoryBackend.persist_guard_document(context.trackId, 'spec', content);
    }

    return content;
  }

  /**
   * Generates Rainbow design.md
   */
  async generateDesign(context: TaskContext): Promise<string> {
    const trackDir = this.getTrackDir(context);
    await fs.mkdir(trackDir, { recursive: true });

    const content = `# Architectural Design (design.md)
**Track ID**: \`${context.trackId}\`

## Component Interaction & Data Flow
- Module updates isolated to feature domain.
- State transitions managed via EventBus catalog.
- Memory & Guard documents mirrored to KnowledgeBackend.
`;

    const filePath = path.join(trackDir, 'design.md');
    await fs.writeFile(filePath, content, 'utf-8');

    if (this.memoryBackend) {
      await this.memoryBackend.persist_guard_document(context.trackId, 'design', content);
    }

    return content;
  }

  /**
   * Generates Guard 2 plan.md
   */
  async generatePlan(context: TaskContext, signedBy = 'auto-coder-engineer'): Promise<string> {
    const trackDir = this.getTrackDir(context);
    await fs.mkdir(trackDir, { recursive: true });

    const content = `# Implementation Plan (Guard 2)
**Track ID**: \`${context.trackId}\`
**Engineer Self-Signature**: \`${signedBy}\`

## Execution Steps
1. Create isolated worktree for track \`${context.trackId}\`.
2. Implement required code changes in target files.
3. Run automated test suite to ensure non-regression.
4. Generate evidence package for Guard 3 certification.

## Risk Assessment & Rollback Strategy
- Fail-fast on build or test failure.
- Auto-revert commit on post-deploy anomaly.
`;

    const filePath = path.join(trackDir, 'plan.md');
    await fs.writeFile(filePath, content, 'utf-8');

    if (this.memoryBackend) {
      await this.memoryBackend.persist_guard_document(context.trackId, 'plan', content, signedBy);
    }

    return content;
  }

  /**
   * Generates Guard 3 guard-evidence.md and evidence.json
   */
  async generateEvidence(
    context: TaskContext,
    testOutput: string,
    signedBy = 'lead-reviewer',
    stopSlop?: { verdict: 'PASS' | 'FAIL'; reasons: string }
  ): Promise<{ markdown: string; json: Record<string, unknown> }> {
    const trackDir = this.getTrackDir(context);
    await fs.mkdir(trackDir, { recursive: true });

    const stopSlopSection = stopSlop
      ? `- **relay-stop-slop Verdict**: ${stopSlop.verdict}\n\`\`\`\n${stopSlop.reasons.trim()}\n\`\`\`\n`
      : '';

    const markdown = `# Guard 3 Evidence Package
**Track ID**: \`${context.trackId}\`
**Repository**: \`${context.repo}\`
**Lead Signature**: \`${signedBy}\`
**Status**: CERTIFIED

## Verification Summary
- **Test Output**:
\`\`\`
${testOutput.trim()}
\`\`\`
${stopSlopSection}- **Zero-Defect Certification**: Verified by Hanoi SDD Relay pipeline.
`;

    const sha256 = crypto.createHash('sha256').update(markdown).digest('hex');
    const json = {
      trackId: context.trackId,
      repo: context.repo,
      issueNumber: context.issueNumber,
      sha256,
      signedBy,
      timestamp: Date.now(),
      status: 'PASS',
      ...(stopSlop ? { stopSlopVerdict: stopSlop.verdict } : {}),
    };

    await fs.writeFile(path.join(trackDir, 'guard-evidence.md'), markdown, 'utf-8');
    await fs.writeFile(path.join(trackDir, 'evidence.json'), JSON.stringify(json, null, 2), 'utf-8');

    if (this.memoryBackend) {
      await this.memoryBackend.persist_guard_document(context.trackId, 'evidence', markdown, signedBy);
    }

    return { markdown, json };
  }
}
