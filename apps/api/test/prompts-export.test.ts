import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportedPrompts } from '../src/llm/prompts/export.js';

describe('versioned prompts (M2)', () => {
  it('every prompt has a version and the committed exports are up to date', () => {
    for (const [name, text] of Object.entries(exportedPrompts())) {
      expect(text).toMatch(/^# [a-z_]+@\d+\n/);
      const committed = readFileSync(
        new URL(`../src/llm/prompts/exported/${name}.txt`, import.meta.url),
        'utf8',
      );
      expect(committed, `run "npm run prompts:export -w @cowork/api" (${name})`).toBe(text);
    }
  });
});
