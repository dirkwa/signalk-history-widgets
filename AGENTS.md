# History Widgets

Signal K plugin providing Plotter Extensions widgets (apiVersion 1): a history
strip that draws one Signal K path over a configurable window, seeded from the
History API, a wind steering dial, tank level and battery charge widgets,
a clock, a depth profile and a system health tile.

## Layout

- `src/` — the server plugin (Node, ESM, built by `vite.config.ts` into
  `plugin/`). It registers a read-only `plotterExtensions` resource provider
  with the manifest (`manifest.ts`) and serves the built pages from memory at
  `/plotterext/signalk-history-widgets/` (`assets.ts`).
- `web/` — the widgets and their configuration panels (plain TypeScript and
  canvas, built by `vite.web.config.ts` into `public/`). `web/tsconfig.json`
  is its own project with DOM libs; its tests live in `web/test/`.
  - `series.ts` — the fixed-size time buckets live samples and History API rows
    share; angles are offsets from a reference so they wrap across north.
  - `units.ts` — display units from the path's `meta.displayUnits`.
  - `history.ts` — the History API query and its parsing.
  - `render.ts` — the canvas drawing.
  - `host.ts` — press and hold and night mode, shared by every widget.
  - `steer-model.ts`, `steer-render.ts`, `steer.ts`, `steer-config.ts` — the
    wind steering dial: settings and angle maths, drawing (every angle off the
    bow, so one drawing serves both dial types), the widget, its panel.
  - `level-model.ts`, `level-render.ts`, `level.ts`, `level-config.ts` — the
    tank level and battery charge widgets: settings, what each kind lists and
    shows underneath (`KINDS`) and `meta.zones` states; the cylinder and flat
    drawings; the widget; its touch panel (tap a tank or bank, no keyboard).
    `tank.ts`, `battery.ts` and their `-config.ts` are the page entries.
  - `clock-model.ts`, `clock-render.ts`, `clock.ts`, `clock-config.ts` — the
    clock: settings, the boat's zone from `environment.time.*`, the GPS
    correction and the text; drawing; the widget; its touch panel.
  - `depth-model.ts`, `depth-render.ts`, `depth.ts`, `depth-config.ts` — the
    depth profile: settings, which depth to follow and the depth axis; the
    echo-sounder drawing; the widget, on the strip's `Series` and History API
    seeding; its touch panel.
  - `pi-model.ts`, `pi-render.ts`, `pi.ts`, `pi-config.ts` — the system
    health tile: signalk-rpi-stats paths, default zones and settings; the
    temperature and bars drawing; the widget; its touch panel.

## Contracts it depends on

- **Plotter Extensions API v1**: widget instance state through
  `state.get/set`, `state.changed` to reload, `ui.openConfigPanel` on press
  and hold, `signalk.subscribe` for live values, `nightMode.changed`.
- **History API** `/signalk/v2/api/history/values` with `min`, `max` and
  `average`; a 501 means no provider. A provider that rejects min/max is asked
  for the average alone.
- **signalk-rpi-stats paths** under its default prefix `environment.rpi`
  (`cpu.temperature`, `cpu.utilisation`, `memory.utilisation`,
  `storage.utilisation`, `throttling.underVoltage`, `throttling.throttled`),
  listed in `web/src/pi-model.ts`.
- **Widget state keys** (strip: `path`, `label`, `span`, `spanUnit`, `unit`,
  `decimals`; wind steering: `dial`, `north`, `trueWind`, `closeHauled`,
  `shiftSeconds`, `show*`; tank and battery: `path`, `label`, `style`, `showDetail`; clock: `zone`,
  `hours`, `seconds`, `showDate`, `label`; depth profile: `path`, `minutes`; system health: `label`, `showStorage`; every widget: `theme`) are stored by the host per instance. Renaming one loses users'
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
