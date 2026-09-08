import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const [dataPath, manifestPath] = process.argv.slice(2);
if (!dataPath || !manifestPath) {
  console.error('Usage: npm run attendance:verify-archive -- <arquivo.json> <manifesto.json>');
  process.exit(2);
}

const [dataContent, manifestContent] = await Promise.all([
  fs.readFile(path.resolve(dataPath)),
  fs.readFile(path.resolve(manifestPath), 'utf8')
]);
const manifest = JSON.parse(manifestContent);
const expected = manifest?.files?.[0]?.sha256;
const actual = createHash('sha256').update(dataContent).digest('hex');

if (!expected || expected !== actual) {
  console.error(`FAIL SHA-256 mismatch\nExpected: ${expected || '(missing)'}\nActual:   ${actual}`);
  process.exit(1);
}

console.log(`PASS ${path.basename(dataPath)}\nSHA-256 ${actual}`);
