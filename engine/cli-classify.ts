// Thin CLI entry: classify a list of files against a given config.yml and print
// the tier + reasons. Used by `blast-radius classify` (cli/bin/cli.js).
//
//   npx tsx engine/cli-classify.ts --config <path> [--added-only] file1 file2 ...
import { classify } from './classify';

const argv = process.argv.slice(2);
let cfgPath = '';
let addedOnly = false;
const files: string[] = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--config') {
    cfgPath = argv[++i];
  } else if (a === '--added-only') {
    addedOnly = true;
  } else {
    files.push(a);
  }
}

if (!cfgPath || files.length === 0) {
  console.error('usage: cli-classify --config <config.yml> [--added-only] <file>...');
  process.exit(2);
}

const r = classify(files, { cfgPath, addedOnly });
console.log(`tier=${r.tier}`);
for (const reason of r.reasons) console.log(`  - ${reason}`);
