# History Widgets

Signal K plugin providing Plotter Extensions widgets (apiVersion 1): a history
strip that draws one Signal K path over a configurable window, seeded from the
History API.

## Layout

- `src/` — the server plugin (Node, ESM, built by `vite.config.ts` into
  `plugin/`). It registers a read-only `plotterExtensions` resource provider
  with the manifest (`manifest.ts`) and serves the built pages from memory at
  `/plotterext/signalk-history-widgets/` (`assets.ts`).
- `web/` — the widget and its configuration panel (plain TypeScript and
  canvas, built by `vite.web.config.ts` into `public/`). `web/tsconfig.json`
  is its own project with DOM libs; its tests live in `web/test/`.
  - `series.ts` — the fixed-size time buckets live samples and History API rows
    share; angles are offsets from a reference so they wrap across north.
  - `units.ts` — display units from the path's `meta.displayUnits`.
  - `history.ts` — the History API query and its parsing.
  - `render.ts` — the canvas drawing.

## Contracts it depends on

- **Plotter Extensions API v1**: widget instance state through
  `state.get/set`, `state.changed` to reload, `ui.openConfigPanel` on press
  and hold, `signalk.subscribe` for live values, `nightMode.changed`.
- **History API** `/signalk/v2/api/history/values` with `min`, `max` and
  `average`; a 501 means no provider. A provider that rejects min/max is asked
  for the average alone.
- **Widget state keys** (`path`, `label`, `span`, `spanUnit`, `unit`,
  `decimals`) are stored by the host per instance. Renaming one loses users'
  settings; add new keys instead.

## Gotchas

- Asset route: not `/plugins/<id>`, which is admin-only; every chartplotter
  user loads the widget.
- Schema defaults are not applied at runtime; the plugin has no settings.
- No runtime dependencies and no install scripts. `signalk-plotterext-bus` is
  bundled into `public/`.
- `appIcon` resolves against `public/`; Vite copies `static/icon.svg` there.

## Commands

- `npm run format` — prettier + eslint --fix
- `npm run ci-lint` — read-only lint + format check (what CI runs)
- `npm run typecheck` — tsc over the plugin, the tests and the web pages
- `npm run build` — both Vite builds; type errors fail them
- `npm test` — vitest
- `npm run build:all` — all of the above, run before every commit

## Workflow

- Conventional commits and PR titles: `<type>(<scope>): <subject>`.
- One logical change per PR. Never bump the version by hand; release-please.
- Branch names use hyphens, no `/`.
- No AI attribution in commits or PRs.
