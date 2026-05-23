import { existsSync, readFileSync } from 'node:fs';

const APP_DATABASE_NAME = 'postgres';

const loadEnvFile = () => {
  if (!existsSync('.env')) return;

  const lines = readFileSync('.env', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2');
  }
};

export const buildDatabaseUrl = (databaseName = APP_DATABASE_NAME) => {
  loadEnvFile();

  const baseUrl = process.env.DATABASE;
  if (!baseUrl) {
    throw new Error('DATABASE is required');
  }

  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

export const setAppDatabaseUrl = () => {
  process.env.DATABASE_URL = buildDatabaseUrl(APP_DATABASE_NAME);
};
