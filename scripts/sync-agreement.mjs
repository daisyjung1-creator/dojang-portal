// Copies the agreement text (src/lib/agreement.js) into the email function so
// the PDF a family receives matches the form they signed. Run after editing
// the agreement: node scripts/sync-agreement.mjs — then redeploy registration-emails.
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/lib/agreement.js', import.meta.url), 'utf8');
writeFileSync(
  new URL('../supabase/functions/registration-emails/agreement.ts', import.meta.url),
  `// @ts-nocheck\n// GENERATED from src/lib/agreement.js by scripts/sync-agreement.mjs — edit that file, not this one.\n${src}`
);
console.log('agreement.ts updated');
