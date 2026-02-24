import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import yaml from 'js-yaml';
import type { Rule } from './types.js';

interface RuleFileContent {
  rules: Rule[];
}

/**
 * Load rules from a single YAML or JSON file.
 */
export function loadRulesFromFile(filePath: string): Rule[] {
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  let parsed: RuleFileContent;
  if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.load(content) as RuleFileContent;
  } else if (ext === '.json') {
    parsed = JSON.parse(content) as RuleFileContent;
  } else {
    throw new Error(`Unsupported rule file format: ${ext} (expected .yaml, .yml, or .json)`);
  }

  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid rule file ${filePath}: expected { rules: [...] }`);
  }

  return parsed.rules;
}

/**
 * Load and merge rules from all YAML/JSON files in a directory.
 */
export function loadRulesFromDirectory(dirPath: string): Rule[] {
  const files = readdirSync(dirPath).filter((f) => {
    const ext = extname(f).toLowerCase();
    return ext === '.yaml' || ext === '.yml' || ext === '.json';
  });

  const allRules: Rule[] = [];
  for (const file of files.sort()) {
    const rules = loadRulesFromFile(join(dirPath, file));
    allRules.push(...rules);
  }

  return allRules;
}
