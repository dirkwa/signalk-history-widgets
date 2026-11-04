# History Widgets

History strip widgets for [Signal K](https://signalk.org/) chartplotters that
support Plotter Extensions, such as Freeboard-SK. A strip shows one value over
the last minutes or hours, newest at the top, like the wind history page of a
sailing instrument: the live value, the window's minimum, average and maximum,
and one bar per moment between them. The scale follows the window's own
minimum and maximum, so the trace fills the strip however little the value
moves.

![True wind direction and speed over 30 minutes](docs/screenshots/wind-strips.png)

## Use

1. Install **History Widgets** from the App Store and restart the server. The
   plugin is enabled on install.
2. In Freeboard-SK, press and hold an empty spot in a widget area (a corner or
   the bottom centre) and pick **History strip** (tall) or **History strip
   (wide)**.
3. Pick the value: a quick button (TWD, TWS, TWA, AWA, AWS, SOG, STW, COG,
   HDG, depth, air pressure, air and water temperature) or any numeric Signal K
   path. Set the time span in minutes or hours, from one minute to a week.

For several values, place several strips next to each other. Press and hold a
placed strip to change it or remove it.

![Configuration](docs/screenshots/config.png)

## History

With a History API provider on the server (for example the KIP plugin,
signalk-parquet or signalk-to-influxdb2) a new strip shows the whole window at
once. Without one it starts empty and fills from live data. The configuration
panel says which case applies.

Directions such as true wind direction or heading read 0 to 360 and stay one
band when they swing across north. Other angles, such as the apparent wind
angle, are signed. Values show in the unit set for the path in the server's
Unit Preferences, unless the strip sets its own.

![Apparent wind angle over 24 hours](docs/screenshots/awa-24h.png)

## Requirements

- Signal K server 2.22.1 or newer (History API v2)
- A chartplotter that hosts Plotter Extensions widgets, such as Freeboard-SK
