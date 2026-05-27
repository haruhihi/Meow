# Agent Instructions

- Do not run `npm run build` by default. Prefer narrower checks such as `npm run lint`, `npm run p -- validate`, targeted type/diagnostic checks, or behavior-specific commands. Run `npm run build` only when explicitly requested or when a broad production-build validation is necessary before finishing a risky change.
- This dev container does not have `rg` installed. Use VS Code search tools or shell `grep` for text/diff searches instead of `rg`.
- When starting a development server, always stop the server and free the port before finishing the turn unless the user explicitly asks to keep it running.
