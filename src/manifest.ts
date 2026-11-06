export const PLUGIN_ID = 'signalk-history-widgets'

/**
 * Where the widget pages are served. Not under /plugins/<id>, which is for
 * admins only: every user of the chartplotter loads these.
 */
export const ASSET_BASE = `/plotterext/${PLUGIN_ID}`

const strip = (id: string, title: string, size: string) => ({
  id,
  title,
  type: 'iframe',
  url: `${ASSET_BASE}/widget.html`,
  size,
  configPanel: 'strip-config',
  lifecycle: 'whileEnabled'
})

/** A level widget; the small one shares its page and panel. */
const level = (id: string, title: string, size = '1x2', page = id) => ({
  id,
  title,
  type: 'iframe',
  url: `${ASSET_BASE}/${page}.html`,
  size,
  configPanel: `${page}-config`,
  lifecycle: 'whileEnabled'
})

const levelPanel = (id: string, title: string) => ({
  id: `${id}-config`,
  title,
  type: 'iframe',
  url: `${ASSET_BASE}/${id}-config.html`,
  lifecycle: 'onOpen'
})

/** The Plotter Extensions manifest (apiVersion 1). */
export function buildManifest(version: string) {
  return {
    name: 'History Widgets',
    description:
      'Any value over the last minutes or hours as a vertical strip with its minimum, average and maximum, a wind steering dial with the wind shift of the last minutes, and tank levels and battery charge coloured by their zones.',
    version,
    apiVersion: '1',
    requires: ['widgets', 'panels.iframe', 'signalk.stream'],
    optional: ['nightMode'],
    widgets: [
      strip('strip', 'History strip', '1x2'),
      strip('strip-wide', 'History strip (wide)', '2x2'),
      {
        id: 'wind-steering',
        title: 'Wind steering',
        type: 'iframe',
        url: `${ASSET_BASE}/steer.html`,
        size: '2x2',
        configPanel: 'wind-steering-config',
        lifecycle: 'whileEnabled'
      },
      level('tank', 'Tank level'),
      level('tank-small', 'Tank level (small)', '1x1', 'tank'),
      level('battery', 'Battery charge'),
      level('battery-small', 'Battery charge (small)', '1x1', 'battery')
    ],
    panels: [
      {
        id: 'strip-config',
        title: 'History strip',
        type: 'iframe',
        url: `${ASSET_BASE}/config.html`,
        lifecycle: 'onOpen'
      },
      {
        id: 'wind-steering-config',
        title: 'Wind steering',
        type: 'iframe',
        url: `${ASSET_BASE}/steer-config.html`,
        lifecycle: 'onOpen'
      },
      levelPanel('tank', 'Tank level'),
      levelPanel('battery', 'Battery charge')
    ]
  }
}
