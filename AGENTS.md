# Agent Instructions

- Do not run `npm run build` by default. Prefer narrower checks such as `npm run lint`, `npm run p -- validate`, targeted type/diagnostic checks, or behavior-specific commands. Run `npm run build` only when explicitly requested or when a broad production-build validation is necessary before finishing a risky change.
