import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = process.cwd();
const localesDir = resolve(rootDir, 'apps/web/src/messages');

const localePaths = {
  en: resolve(localesDir, 'en.json'),
  ru: resolve(localesDir, 'ru.json')
};

const placeholderPattern = /\?{3,}/;
const mojibakePairPattern = /(?:\u0420.|\u0421.){2,}/;
const cpArtifactPattern = /\u0432\u0402|\u00c2|\ufffd/i;

const readLocale = (locale) => {
  const path = localePaths[locale];
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
};

const en = readLocale('en');
const ru = readLocale('ru');

const issues = [];

const enKeys = Object.keys(en);
const ruKeys = Object.keys(ru);

for (const key of enKeys) {
  if (!(key in ru)) {
    issues.push(`[keys] Missing key in ru.json: ${key}`);
  }
}

for (const key of ruKeys) {
  if (!(key in en)) {
    issues.push(`[keys] Extra key in ru.json: ${key}`);
  }
}

for (const [key, value] of Object.entries(ru)) {
  if (typeof value !== 'string') {
    issues.push(`[value] Non-string value for key "${key}"`);
    continue;
  }

  if (placeholderPattern.test(value)) {
    issues.push(`[placeholder] ${key} => ${JSON.stringify(value)}`);
  }

  if (mojibakePairPattern.test(value) || cpArtifactPattern.test(value)) {
    issues.push(`[encoding] ${key} => ${JSON.stringify(value)}`);
  }
}

if (issues.length > 0) {
  console.error(`Locale validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Locale validation passed: en.json and ru.json are consistent.');
