# Azure Web App Docker Troubleshoot

- Streaming Log: Azure Portal -> Monitoring -> Log Stream
- Online Container Log: https://<app-name>.scm.azurewebsites.net/api/vfs/LogFiles/
- Download Zip: https://<app-name>.scm.azurewebsites.net/api/logs/docker/zip

## Environment

- `DATABASE`: PostgreSQL server base URL without a database path, for example `postgresql://user:password@host:5432`. The app derives concrete database URLs from this value.
- `DATABASE_URL`: generated from `DATABASE` for Prisma commands and runtime database access. Use `node scripts/with-database-url.mjs <command>` or `npm run p -- <prisma-command>` instead of setting it manually for local Prisma commands.
- `SESSION_SECRET`: secret used to sign the session cookie.
- `TUSHARE_TOKEN`: optional. Required only when running stock source-data, dividend, financial, valuation, or index sync scripts.

The main app database name is `postgres`.