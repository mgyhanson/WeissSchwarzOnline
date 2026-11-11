/**
 * Reading the rule registry (rules/rule-registry.md) and checking it
 * against the test suite.
 *
 * The Markdown file stays the single place where the registry is edited.
 * rules/registry.json is generated from it for tools, and a test makes sure
 * the two never disagree.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type RuleStatus = '未實作' | '部分' | '已測試';
export const STATUSES: readonly RuleStatus[] = ['未實作', '部分', '已測試'];

export interface RuleEntry {
  id: string;
  section: string;
  description: string;
  status: RuleStatus;
  tests: string[];
}

export interface InvariantEntry {
  id: string;
  description: string;
}

export interface Registry {
  source: string;
  rulesVersion: string;
  rules: RuleEntry[];
  invariants: InvariantEntry[];
  /** Rule IDs mentioned in section 14, where partial rules must be explained. */
  explained: string[];
  summary: Record<RuleStatus, number>;
}

export interface TestTitle {
  file: string;
  title: string;
}

const RULE_ID = /^(CR|DR)-[\d.]+( \/ [\d.]+)*$/;
const TEST_ID = /^T-[A-Z]+-\d{3}$/;
const TEST_ID_GLOBAL = /\bT-[A-Z]+-\d{3}\b/g;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** Parses the Markdown registry. Throws on rows it cannot understand, so a typo cannot hide a rule. */
export function parseRegistry(markdown: string, source = 'rules/rule-registry.md'): Registry {
  const rules: RuleEntry[] = [];
  const invariants: InvariantEntry[] = [];
  const explained = new Set<string>();
  let section = '';
  let sectionNumber = 0;
  let rulesVersion = '';

  for (const [index, line] of markdown.split('\n').entries()) {
    const heading = /^## (\d+)\. (.+)$/.exec(line);
    if (heading) {
      sectionNumber = Number(heading[1]);
      section = `${heading[1]}. ${heading[2]}`;
      continue;
    }
    const version = /総合ルール》ver\. ([\d.]+)/.exec(line);
    if (version && !rulesVersion) rulesVersion = `JP-${version[1]}`;

    if (sectionNumber >= 14) {
      // "CR-8.7.2.1 / 8.7.5 / 8.7.7" names three rules.
      for (const match of line.matchAll(/(CR|DR)-[\d.]*\d(?:\s*\/\s*(?:(?:CR|DR)-)?[\d.]*\d)*/g)) {
        const prefix = match[1] as string;
        for (const part of match[0].split('/')) {
          const id = part.trim();
          explained.add(/^(CR|DR)-/.test(id) ? id : `${prefix}-${id}`);
        }
      }
      continue;
    }

    if (!line.startsWith('|')) continue;
    const row = cells(line);
    const first = row[0] ?? '';
    if (first === '' || first.startsWith('---') || first === 'Rule ID' || first === 'ID') continue;

    if (sectionNumber === 13) {
      if (/^INV-\d{2}$/.test(first)) invariants.push({ id: first, description: row[1] ?? '' });
      continue;
    }

    const where = `${source}:${index + 1}`;
    if (row.length !== 4) throw new Error(`${where}: expected 4 columns, found ${row.length}`);
    const [id, description, status, testCell] = row as [string, string, string, string];
    if (!RULE_ID.test(id)) throw new Error(`${where}: "${id}" is not a rule ID`);
    if (!STATUSES.includes(status as RuleStatus)) throw new Error(`${where}: unknown status "${status}"`);
    const tests = testCell
      .split(/[、,]/)
      .map((test) => test.trim())
      .filter((test) => test !== '');
    for (const test of tests) {
      if (!TEST_ID.test(test)) throw new Error(`${where}: "${test}" is not a test ID`);
    }
    rules.push({ id, section, description, status: status as RuleStatus, tests });
  }

  const summary = { 未實作: 0, 部分: 0, 已測試: 0 } as Record<RuleStatus, number>;
  for (const rule of rules) summary[rule.status]++;
  return { source, rulesVersion, rules, invariants, explained: [...explained].sort(), summary };
}

/** The titles of every `describe(...)` and `it(...)` in the test files under the given folders. */
export function collectTestTitles(root: string, folders: readonly string[]): TestTitle[] {
  const titles: TestTitle[] = [];
  const call = /\b(?:it|test|describe)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const folder of folders) {
    const dir = join(root, folder);
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.test.ts'));
    for (const file of files.sort()) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const match of text.matchAll(call)) titles.push({ file: join(folder, file), title: match[2] as string });
    }
  }
  return titles;
}

/** Whether a title names a rule: "CR-3.6.4" must not match "CR-3.6.4.1" or "CR-3.6.41". */
function mentionsRule(title: string, ruleId: string): boolean {
  return ruleId
    .split(' / ')
    .map((part, i) => (i === 0 ? part : `${ruleId.slice(0, 3)}${part}`))
    .some((id) => new RegExp(`${id.replace(/\./g, '\\.')}(?![\\d]|\\.\\d)`).test(title));
}

function mentionsTest(title: string, testId: string): boolean {
  return new RegExp(`\\b${testId}\\b`).test(title);
}

export interface CoverageReport {
  problems: string[];
  /** For each rule marked as tested, the titles that cover it. */
  covered: Record<string, string[]>;
}

/**
 * The checks of STEP 5:
 *  - no rule ID is listed twice, no test ID belongs to two rules;
 *  - every rule marked 已測試 is named, by rule ID or test ID, in at least one test title;
 *  - every rule marked 部分 is explained in section 14;
 *  - a rule marked 未實作 has no test claiming it (status and tests must agree);
 *  - every test ID used in a test title exists in the registry (no typos, no orphans);
 *  - every invariant is named in at least one test title.
 */
export function checkCoverage(registry: Registry, titles: readonly TestTitle[]): CoverageReport {
  const problems: string[] = [];
  const covered: Record<string, string[]> = {};

  const seenRules = new Set<string>();
  const testOwner = new Map<string, string>();
  for (const rule of registry.rules) {
    if (seenRules.has(rule.id)) problems.push(`${rule.id} is listed more than once`);
    seenRules.add(rule.id);
    for (const test of rule.tests) {
      const owner = testOwner.get(test);
      if (owner && owner !== rule.id) problems.push(`${test} is listed for both ${owner} and ${rule.id}`);
      testOwner.set(test, rule.id);
    }
  }

  for (const rule of registry.rules) {
    const matching = titles
      .filter((t) => mentionsRule(t.title, rule.id) || rule.tests.some((test) => mentionsTest(t.title, test)))
      .map((t) => `${t.file}: ${t.title}`);

    if (rule.status === '已測試') {
      if (matching.length === 0) problems.push(`${rule.id} is marked 已測試 but no test names it (${rule.tests.join(', ') || 'no test ID'})`);
      covered[rule.id] = matching;
    }
    const parts = rule.id.split(' / ').map((part, i) => (i === 0 ? part : `${rule.id.slice(0, 3)}${part}`));
    if (rule.status === '部分' && !parts.some((part) => registry.explained.includes(part))) {
      problems.push(`${rule.id} is marked 部分 but section 14 does not explain what is missing`);
    }
    if (rule.status === '未實作') {
      const claiming = titles.filter((t) => rule.tests.some((test) => mentionsTest(t.title, test)));
      if (claiming.length > 0) problems.push(`${rule.id} is marked 未實作 but ${claiming[0]!.file} has a test for ${rule.tests.join(', ')}`);
    }
  }

  const knownTests = new Set(testOwner.keys());
  for (const t of titles) {
    for (const match of t.title.matchAll(TEST_ID_GLOBAL)) {
      if (!knownTests.has(match[0])) problems.push(`${t.file}: "${match[0]}" is not a test ID in the registry`);
    }
  }

  for (const invariant of registry.invariants) {
    if (!titles.some((t) => new RegExp(`\\b${invariant.id}\\b`).test(t.title))) {
      problems.push(`${invariant.id} is not named in any test title`);
    }
  }

  return { problems: [...new Set(problems)], covered };
}

export function registryJson(registry: Registry): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}
