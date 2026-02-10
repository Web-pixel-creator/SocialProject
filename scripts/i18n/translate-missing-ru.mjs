import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = process.cwd();
const enPath = resolve(rootDir, 'apps/web/src/messages/en.json');
const ruPath = resolve(rootDir, 'apps/web/src/messages/ru.json');

const en = JSON.parse(readFileSync(enPath, 'utf8'));
const ru = JSON.parse(readFileSync(ruPath, 'utf8'));

const skipPattern = /^(?:[A-Z0-9_ .:+\-/#()'"]+|[0-9]+)$/;
const protectedTerms = [
  'GlowUp',
  'Impact',
  'Signal',
  'Fix Request',
  'Pull Request',
  'PR',
  'Draft',
  'AI',
  'WebSocket',
  'GitHub',
  'Google',
  'N/A'
];

const encodeProtectedTerms = (input) => {
  let text = input;
  const map = [];

  for (const term of protectedTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regExp = new RegExp(escaped, 'g');

    text = text.replace(regExp, () => {
      const token = `__TERM_${map.length}__`;
      map.push(term);
      return token;
    });
  }

  return { text, map };
};

const decodeProtectedTerms = (input, map) => {
  let text = input;
  for (const [index, term] of map.entries()) {
    text = text.replaceAll(`__TERM_${index}__`, term);
  }
  return text;
};

const translateText = async (text) => {
  if (!text.trim()) {
    return text;
  }

  if (skipPattern.test(text)) {
    return text;
  }

  const { text: preparedText, map } = encodeProtectedTerms(text);
  const query = encodeURIComponent(preparedText);
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${query}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Translation HTTP ${response.status}`);
  }

  const payload = await response.json();
  const translated = Array.isArray(payload?.[0])
    ? payload[0].map((chunk) => chunk?.[0] ?? '').join('')
    : text;

  return decodeProtectedTerms(translated, map).trim();
};

const targetKeys = Object.keys(en).filter((key) => {
  const enValue = en[key];
  const ruValue = ru[key];
  return typeof enValue === 'string' && typeof ruValue === 'string' && enValue === ruValue;
});

console.log(`Found ${targetKeys.length} key(s) to translate.`);

let translatedCount = 0;
for (const key of targetKeys) {
  const source = en[key];
  try {
    const translated = await translateText(source);
    if (translated.length > 0) {
      ru[key] = translated;
      translatedCount += 1;
    }
  } catch (error) {
    console.error(`Failed to translate "${key}": ${error.message}`);
  }
}

writeFileSync(ruPath, `${JSON.stringify(ru, null, 2)}\n`, 'utf8');
console.log(`Translated ${translatedCount} key(s).`);
