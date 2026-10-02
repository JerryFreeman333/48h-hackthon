import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { CandidateBundle, SearchIntent, UserProfile } from '../domain/contract.js';

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(moduleRoot, 'fixtures', name), 'utf8'));
}

export function loadDemoInputs(): { profile: UserProfile; intent: SearchIntent; bundle: CandidateBundle } {
  return {
    profile: loadFixture('user-profile.demo.v1.json') as UserProfile,
    intent: loadFixture('search-intent.demo.v1.json') as SearchIntent,
    bundle: loadFixture('candidate-bundle.demo.v1.json') as CandidateBundle,
  };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export const FIXED_GENERATED_AT = '2026-10-02T09:00:00Z';
export const FIXED_REPORT_ID = 'report-test-1';

export { runMatchPipeline } from '../application/pipeline.js';
