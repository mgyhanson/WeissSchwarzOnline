/**
 * npm run registry          regenerates rules/registry.json and prints the coverage report
 * npm run registry -- --check   fails if registry.json is out of date or coverage has problems
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCoverage, collectTestTitles, parseRegistry, registryJson } from './registry-lib.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const markdownPath = join(root, 'rules/rule-registry.md');
const jsonPath = join(root, 'rules/registry.json');
const checkOnly = process.argv.includes('--check');

const registry = parseRegistry(readFileSync(markdownPath, 'utf8'));
const json = registryJson(registry);
const report = checkCoverage(registry, collectTestTitles(root, ['game-engine/tests', 'card-database/tests', 'tests']));

let current = '';
try {
  current = readFileSync(jsonPath, 'utf8');
} catch {
  current = '';
}

if (!checkOnly && current !== json) {
  writeFileSync(jsonPath, json);
  console.log('rules/registry.json updated');
}

const { summary } = registry;
console.log(`Rules: ${registry.rules.length} (已測試 ${summary['已測試']}, 部分 ${summary['部分']}, 未實作 ${summary['未實作']}); invariants: ${registry.invariants.length}`);

const problems = [...report.problems];
if (checkOnly && current !== json) problems.unshift('rules/registry.json is out of date: run npm run registry');
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Every rule marked 已測試 is named by at least one test, and every test ID is in the registry.');
