/**
 * STEP 5: the rule registry and the test suite must agree.
 * Run `npm run registry` to see the full report or to regenerate registry.json.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../game-engine/src/index';
import { checkCoverage, collectTestTitles, parseRegistry, registryJson } from '../scripts/registry-lib';

const root = fileURLToPath(new URL('..', import.meta.url));
const markdown = readFileSync(join(root, 'rules/rule-registry.md'), 'utf8');
const registry = parseRegistry(markdown);

describe('rule registry', () => {
  it('rules/registry.json is generated from the current Markdown registry', () => {
    expect(readFileSync(join(root, 'rules/registry.json'), 'utf8')).toBe(registryJson(registry));
  });

  it('names the rules version the engine implements', () => {
    expect(registry.rulesVersion).toBe(RULES_VERSION);
  });

  it('every rule marked as tested is covered, and every test ID used by a test is registered', () => {
    const report = checkCoverage(registry, collectTestTitles(root, ['game-engine/tests', 'tests']));
    expect(report.problems).toEqual([]);
  });
});

describe('the coverage checker itself', () => {
  const sample = [
    '## 1. Sample',
    '| Rule ID | 說明 | 狀態 | 測試 |',
    '|---|---|---|---|',
    '| CR-9.9.1 | tested | 已測試 | T-SAMPLE-001 |',
    '| CR-9.9.2 | partial | 部分 | T-SAMPLE-002 |',
    '| CR-9.9.3 | not done | 未實作 | T-SAMPLE-003 |',
    '## 13. Invariants',
    '| ID | 不變量 |',
    '| INV-99 | something |',
    '## 14. Notes',
    '| CR-9.9.2 | half | rest |',
  ].join('\n');

  it('accepts a consistent registry', () => {
    const titles = [
      { file: 'a.test.ts', title: 'T-SAMPLE-001 / CR-9.9.1: works' },
      { file: 'a.test.ts', title: 'INV-99: holds' },
    ];
    expect(checkCoverage(parseRegistry(sample), titles).problems).toEqual([]);
  });

  it('reports a tested rule without a test, an unregistered test ID, a missing invariant and a test for an unimplemented rule', () => {
    const titles = [
      { file: 'a.test.ts', title: 'CR-9.9.1.1 and CR-9.9.10: sub-clauses and longer numbers do not cover the parent rule' },
      { file: 'a.test.ts', title: 'T-TYPO-001: misspelt' },
      { file: 'a.test.ts', title: 'T-SAMPLE-003: claims the unimplemented rule' },
    ];
    const problems = checkCoverage(parseRegistry(sample), titles).problems.join('\n');
    expect(problems).toContain('CR-9.9.1 is marked 已測試 but no test names it');
    expect(problems).toContain('"T-TYPO-001" is not a test ID');
    expect(problems).toContain('INV-99 is not named');
    expect(problems).toContain('CR-9.9.3 is marked 未實作');
  });

  it('reports a partial rule that section 14 does not explain', () => {
    const unexplained = sample.replace('| CR-9.9.2 | half | rest |', '');
    const titles = [
      { file: 'a.test.ts', title: 'T-SAMPLE-001: works' },
      { file: 'a.test.ts', title: 'INV-99: holds' },
    ];
    expect(checkCoverage(parseRegistry(unexplained), titles).problems).toEqual([
      'CR-9.9.2 is marked 部分 but section 14 does not explain what is missing',
    ]);
  });

  it('refuses rows it cannot read', () => {
    expect(() => parseRegistry(sample.replace('| 已測試 |', '| done |'))).toThrow(/unknown status/);
    expect(() => parseRegistry(sample.replace('T-SAMPLE-001', 'T-1'))).toThrow(/not a test ID/);
  });
});
