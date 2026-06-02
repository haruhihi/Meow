# Azure Web App Docker Troubleshoot

- Streaming Log: Azure Portal -> Monitoring -> Log Stream
- Online Container Log: https://<app-name>.scm.azurewebsites.net/api/vfs/LogFiles/
- Download Zip: https://<app-name>.scm.azurewebsites.net/api/logs/docker/zip

## Environment

- `DATABASE`: PostgreSQL server base URL without a database path. The app maintains concrete database names in code.
- `SESSION_SECRET`: session signing secret.

The main app database is `postgres`; the article database is `sjjk`.

## prompts
生成某某股票研报，严格按 AGENTS.md 的 Stock AI report workflow：先跑 prepare evidence，再用 stock-dividend-valuation.prompt.md 写入 StockAiReport，不要脚本模板生成结论。