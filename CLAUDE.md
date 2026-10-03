# Analyse (chess.com-style Game Review, static site)
Commands: npm ci | npm run dev | npm run lint | npm run format | npm run typecheck | npm test | npx playwright test | npm run build | npm run build:pages | node scripts/vendor-engine.mjs --check
Rules: PROMPT.md is the spec; src/types/** are frozen contracts; package.json is edited only by the lead; constants only in src/analysis/config.ts; user-facing strings only in src/import/errors.ts, src/engine/errors.ts, src/ui/strings.ts; never delete or weaken tests; never --no-verify; never force-push; commit after every green gate.
Engine: public/engine/sf19/* are committed binaries (stockfish 19.0.0 lite, GPLv3); never import them through Vite; classic workers only; one outstanding `go` per worker; scores are normalised to White once, in src/engine.
State files: PLAN.md (checklist, assumptions, follow-ups, subagent table), PROGRESS.md (gate evidence), docs/research/*.md, docs/review/*.md.
When compacting, always preserve: the full list of modified files, open PLAN.md items, the test commands above, the current phase and gate, and the branch names of running subagents.
