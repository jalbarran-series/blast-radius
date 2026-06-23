#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FRAMEWORK_ROOT, scaffold } from '../lib/scaffold.mjs';
import { update } from '../lib/update.mjs';
import { uninstall } from '../lib/uninstall.mjs';

const [cmd, ...rest] = process.argv.slice(2);

function tsx(args, opts = {}) {
  return spawnSync('npx', ['tsx', ...args], { cwd: FRAMEWORK_ROOT, stdio: 'inherit', ...opts });
}

function resolveConfig(targetDir) {
  const flagIdx = rest.indexOf('--config');
  if (flagIdx !== -1) return resolve(rest[flagIdx + 1]);
  return join(targetDir, '.github', 'blast-radius', 'config.yml');
}

function help() {
  console.log(`blast-radius — tiered PR merge policy, installable into any repo

Usage:
  blast-radius install [targetDir]      Scaffold engine + workflows + starter config + skill
  blast-radius update  [targetDir]      Refresh framework files; surface workflow drift as .new
  blast-radius uninstall [targetDir]    Remove blast-radius from a repo (dry-run unless --yes)
  blast-radius doctor  [targetDir]      Validate this repo's config.yml + owners
  blast-radius classify <file>...       Print the tier for a set of changed files
  blast-radius help

After install, run \`/blast-radius init\` in your agent to tailor config.yml + owners.

Notes:
  - install never clobbers config.yml / owners / workflows once a repo owns them.
  - update overwrites framework files (engine + skill) and writes <file>.new for
    workflows/PR template that drifted from the templates (never clobbers them).
  - uninstall is dry-run by default (lists targets); pass --yes to delete. It
    removes .github/blast-radius/, the shipped bot workflows, and the agent
    skill dirs; it leaves PULL_REQUEST_TEMPLATE.md (reported).
  - doctor + classify use the config at <repo>/.github/blast-radius/config.yml
    (override with --config <path>).`);
}

switch (cmd) {
  case 'install': {
    const target = resolve(rest[0] || '.');
    scaffold(target);
    break;
  }

  case 'update': {
    const target = resolve(rest[0] || '.');
    update(target);
    break;
  }

  case 'uninstall': {
    const target = resolve(rest.find((a) => !a.startsWith('--')) || '.');
    uninstall(target, { apply: rest.includes('--yes') });
    break;
  }

  case 'doctor': {
    const target = resolve(rest[0] || '.');
    const cfg = resolveConfig(target);
    const owners = join(target, '.github', 'blast-radius', 'owners');
    if (!existsSync(cfg)) {
      console.error(`✗ no config at ${cfg} — run \`blast-radius init\` first.`);
      process.exit(1);
    }
    console.log(`Validating ${cfg}`);
    const r = tsx([join(FRAMEWORK_ROOT, 'engine', 'checkOwnersConfig.ts'), '--owners', owners, '--cfg', cfg]);
    if (r.status !== 0) {
      console.error('✗ doctor failed (orphan owners or bad config).');
      process.exit(r.status || 1);
    }
    console.log('✓ config loads and every owner classifies Tier 3.');
    break;
  }

  case 'classify': {
    const fileArgs = rest.filter((a, i) => a !== '--config' && rest[i - 1] !== '--config');
    if (fileArgs.length === 0) {
      console.error('usage: blast-radius classify <file>... [--config <path>]');
      process.exit(2);
    }
    const cfg = resolveConfig(process.cwd());
    if (!existsSync(cfg)) {
      console.error(`✗ no config at ${cfg}`);
      process.exit(1);
    }
    const r = tsx([join(FRAMEWORK_ROOT, 'engine', 'cli-classify.ts'), '--config', cfg, ...fileArgs]);
    process.exit(r.status || 0);
    break;
  }

  case 'help':
  case undefined:
    help();
    break;

  default:
    console.error(`unknown command: ${cmd}\n`);
    help();
    process.exit(2);
}
