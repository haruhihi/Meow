#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const DIVIDENDS_SCRIPT = 'scripts/sync-stock-dividends.mjs';
const FUNDAMENTALS_SCRIPT = 'scripts/sync-stock-fundamentals.mjs';
const CACHE_SCRIPT = 'scripts/refresh-stock-metric-cache.mjs';

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);

const readScopedArgs = () => {
  const scopedArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbols') {
      scopedArgs.push(arg);
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        scopedArgs.push(args[index + 1]);
        index += 1;
      }
    } else if (arg === '--limit') {
      scopedArgs.push(arg, args[index + 1] ?? '0');
      index += 1;
    }
  }
  return scopedArgs;
};

const runNodeScript = (script, scriptArgs) => {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 0;
};

const main = () => {
  console.log('[stock-source-data] step 1/3 sync Tushare dividend events');
  const dividendCode = runNodeScript(DIVIDENDS_SCRIPT, args);
  if (dividendCode !== 0) return dividendCode;

  console.log('[stock-source-data] step 2/3 sync Tushare financial statements');
  const syncCode = runNodeScript(FUNDAMENTALS_SCRIPT, args);
  if (syncCode !== 0) return syncCode;

  if (hasFlag('--dry-run')) {
    console.log('[stock-source-data] dry-run: skipped metric cache refresh');
    return 0;
  }

  console.log('[stock-source-data] step 3/3 refresh derived metric cache');
  return runNodeScript(CACHE_SCRIPT, readScopedArgs());
};

process.exit(main());