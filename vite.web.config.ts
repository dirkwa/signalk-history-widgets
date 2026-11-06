import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'web',
  // Relative asset URLs: the plugin serves the pages under its own prefix.
  base: './',
  // Copies the icon to public/, where the App Store's appIcon reads it.
  publicDir: '../static',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        widget: `${here}web/widget.html`,
        config: `${here}web/config.html`,
        steer: `${here}web/steer.html`,
        'steer-config': `${here}web/steer-config.html`,
        tank: `${here}web/tank.html`,
        'tank-config': `${here}web/tank-config.html`,
        battery: `${here}web/battery.html`,
        'battery-config': `${here}web/battery-config.html`,
        clock: `${here}web/clock.html`,
        'clock-config': `${here}web/clock-config.html`
      }
    }
  },
  // Vite only transpiles; the checker fails the build on any type error.
  plugins: [checker({ typescript: { root: `${here}web`, tsconfigPath: 'tsconfig.json' } })]
})
