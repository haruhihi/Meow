#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-database-url.mjs <command> [...args]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
