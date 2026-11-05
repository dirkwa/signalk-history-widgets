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

/** The Plotter Extensions manifest (apiVersion 1). */
export function buildManifest(version: string) {
  return {
    name: 'History Widgets',
    description:
      'Any value over the last minutes or hours as a vertical strip with its minimum, average and maximum, a wind steering dial with the wind shift of the last minutes, and tank levels coloured by their zones.',
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
      {
        id: 'tank',
        title: 'Tank level',
        type: 'iframe',
        url: `${ASSET_BASE}/tank.html`,
        size: '1x2',
        configPanel: 'tank-config',
        lifecycle: 'whileEnabled'
      }
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
      {
        id: 'tank-config',
        title: 'Tank level',
        type: 'iframe',
        url: `${ASSET_BASE}/tank-config.html`,
        lifecycle: 'onOpen'
      }
    ]
  }
}
