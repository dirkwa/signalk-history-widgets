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
      'Any value over the last minutes or hours as a vertical strip with its minimum, average and maximum.',
    version,
    apiVersion: '1',
    requires: ['widgets', 'panels.iframe', 'signalk.stream'],
    optional: ['nightMode'],
    widgets: [
      strip('strip', 'History strip', '1x2'),
      strip('strip-wide', 'History strip (wide)', '2x2')
    ],
    panels: [
      {
        id: 'strip-config',
        title: 'History strip',
        type: 'iframe',
        url: `${ASSET_BASE}/config.html`,
        lifecycle: 'onOpen'
      }
    ]
  }
}
