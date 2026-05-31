#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const TUSHARE_API_URL = 'http://api.tushare.pro';

const setOutput = (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};

const isTushareTokenPayload = (payload) => {
  const message = String(payload?.msg ?? '').toLowerCase();
  return payload?.code === -2001 || /token|权限|过期|失效|无效|expired|invalid|unauthorized/.test(message);
};

const main = async () => {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    console.warn('Skipping Tushare sync: missing TUSHARE_TOKEN.');
    setOutput('valid', 'false');
    return 0;
  }

  const response = await fetch(TUSHARE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: 'stock_basic',
      token,
      params: { list_status: 'L' },
      fields: 'ts_code',
    }),
  });
  if (!response.ok) throw new Error(`tushare http ${response.status}`);

  const payload = await response.json();
  if (payload.code === 0) {
    console.log('Tushare token is valid.');
    setOutput('valid', 'true');
    return 0;
  }

  if (isTushareTokenPayload(payload)) {
    console.warn(`Skipping Tushare sync: tushare token check error ${payload.code}: ${payload.msg ?? ''}`);
    setOutput('valid', 'false');
    return 0;
  }

  throw new Error(`tushare token check error ${payload.code}: ${payload.msg ?? ''}`);
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });