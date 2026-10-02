# impl-deploy notes (Phase 2)

## pages-coi.spec.ts flake (Chromium: 4 of 11 runs next to engine-smoke with 2 workers, 0 of 8 alone or with 1 worker)

Failing runs end with this state (diagnostic snapshot printed by the spec):

```
{"isolated":false,"documents":2,"coiReloading":"1","scope":"http://localhost:4181/analyse/",
 "active":"activated","controlled":false,"href":"http://localhost:4181/analyse/?game=cc:live:129688175007&ply=5"}
```

Cause, read from the vendored `public/coi-serviceworker.min.js` (master 7b1d2a0): on the first visit the
`updatefound` handler sets `coiReloadedBySelf=updatefound` and reloads immediately, before the worker has
activated and claimed the client. When that reload wins the race, the reloaded document is not controlled; on
it `shouldRegister()` is `!coiReloadedBySelf`, so the script neither registers nor reloads again, and the page
stays non-isolated (the D.8 block then renders single-threaded at once because `coiReloading` is `1`). The next
navigation is controlled and isolated. The spec is correct per risk 4 (at most 2 documents, isolated,
controlled); it only failed when another spec ran in parallel (CPU contention), never in 8 runs alone or with
`--workers=1`.

Possible fix (lead / impl-ui, `src/main.tsx` or the inline `window.coi` of `vite.config.ts`; not my paths):
when the page is on Pages, not isolated, `navigator.serviceWorker.controller` is null and a registration is
active (or becomes active via `navigator.serviceWorker.ready`), reload once more guarded by a separate
sessionStorage flag. That makes a third document in rare runs, so the spec's "at most 2 documents" would have
to become 3 (D.8 already says "twice in rare Chromium runs"). Alternatively `retries: 1` in CI.

## Eval tables

`npm run record-evals` wrote 113 + 144 + 14 = 271 positions in about 4.5 minutes (live 93 s, daily 180 s,
lichess 1 s). Daily 1000337106 has 145 positions of which two share a key (a repetition), hence 144. All
positions are covered (re-derived and checked after the container restart). Depths reached within 2 s:
live 109 at 16, 3 at 15, 1 at 14; daily 97 at 16, 46 at 12 to 15; the two checkmate finals are recorded as
`terminal: 'checkmate'` with one `mate 0` line and `bestmove: null`.

File names: `<gameId>` with `:` replaced by `_` (`cc_live_129688175007.json`, `cc_daily_1000337106.json`,
`li_4S1PZUvW.json`), because `:` is not a valid file name character on Windows checkouts. The mock engine and
e2e/mocks.ts merge every `*.json` in the folder, so the names are not read anywhere.
