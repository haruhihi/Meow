const APP_DATABASE_NAME = 'postgres';
const ARTICLE_DATABASE_NAME = 'sjjk';

export const buildDatabaseUrl = (databaseName: string) => {
  const baseUrl = process.env.DATABASE;
  if (!baseUrl) {
    throw new Error('DATABASE is required');
  }

  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

export const getAppDatabaseUrl = () => buildDatabaseUrl(APP_DATABASE_NAME);

export const getArticleDatabaseUrl = () => buildDatabaseUrl(ARTICLE_DATABASE_NAME);
