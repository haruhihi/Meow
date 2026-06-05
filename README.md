# Azure Web App Docker Troubleshoot

- Streaming Log: Azure Portal -> Monitoring -> Log Stream
- Online Container Log: https://<app-name>.scm.azurewebsites.net/api/vfs/LogFiles/
- Download Zip: https://<app-name>.scm.azurewebsites.net/api/logs/docker/zip

## Environment

- `DATABASE`: PostgreSQL server base URL without a database path. The app maintains concrete database names in code.
- `SESSION_SECRET`: session signing secret.

The main app database is `postgres`; the article database is `sjjk`.

## prompts
股票研究公共取证流程放在 .github/skills/stock-evidence-research/SKILL.md；具体任务继续用 .github/prompts/ 下的 prompt。
- 生成某某股票估值/分红研报：使用 stock-dividend-valuation.prompt.md，先按公共取证流程跑 evidence，再用 LLM 写入 StockAiReport，不要脚本模板生成结论。
- 分析某某股票海外扩张：使用 stock-overseas-expansion.prompt.md，先按公共取证流程跑 evidence 并补拉今年以来财报/公告，再回答国家布局、产销趋势、关税影响、现金用途和低分红率原因。