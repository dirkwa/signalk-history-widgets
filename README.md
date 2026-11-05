# History Widgets

History strip widgets for [Signal K](https://signalk.org/) chartplotters that
support Plotter Extensions, such as Freeboard-SK. A strip shows one value over
the last minutes or hours, newest at the top, like the wind history page of a
sailing instrument: the live value, the window's minimum, average and maximum,
and one bar per moment between them. The scale follows the window's own
minimum and maximum, so the trace fills the strip however little the value
moves.

![True wind direction and speed over 30 minutes](docs/screenshots/wind-strips.png)

The package also brings a **Wind steering** dial, described [below](#wind-steering).

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

## Wind steering

A square dial for steering by the wind, bow always up. In its default
compass mode the card turns with the heading; set to wind angles it shows 0
to 180 degrees port and starboard instead. On the dial:

![Wind steering dial](docs/screenshots/wind-steering.png)

- the apparent wind (blue pointer, **A**) and the true wind (orange marker,
  **T**), with AWS, TWS, AWA and TWA in the corners;
- dashed close-hauled lines for both tacks: red is the heading on port tack,
  green on starboard tack, at the close-hauled angle off the true wind
  (45 degrees unless set otherwise);
- the wind shift fan: how far the true wind direction swung over the last
  minute (or the window you choose), so a lift or a header shows at a glance;
- the next waypoint (purple dot) when a destination is active, course over
  ground (pink diamond) when the boat is moving, the current as an arrow
  with its drift, and the rudder angle as a bar under the dial.

Press and hold the dial to choose the dial type, true or magnetic north,
true wind through the water or over the ground, the close-hauled angle, the
shift window, and which marks to show. Values older than ten seconds are
hidden rather than shown stale. It reads standard Signal K paths:
`navigation.headingTrue` (or `headingMagnetic`), `environment.wind.*`,
`navigation.courseOverGroundTrue`, `navigation.speedOverGround`,
`navigation.course.calcValues.bearingTrue`, `environment.current.setTrue` and
`drift`, and `steering.rudderAngle`.

## Requirements

- Signal K server 2.22.1 or newer (History API v2) on Node 24 or newer
- A chartplotter that hosts Plotter Extensions widgets, such as Freeboard-SK
