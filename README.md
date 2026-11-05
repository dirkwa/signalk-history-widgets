# History Widgets

History strip widgets for [Signal K](https://signalk.org/) chartplotters that
support Plotter Extensions, such as Freeboard-SK. A strip shows one value over
the last minutes or hours, newest at the top, like the wind history page of a
sailing instrument: the live value, the window's minimum, average and maximum,
and one bar per moment between them. The scale follows the window's own
minimum and maximum, so the trace fills the strip however little the value
moves.

![True wind direction and speed over 30 minutes](docs/screenshots/wind-strips.png)

The package also brings a **Wind steering** dial, **Tank level** and
**Battery charge** widgets and a **Clock**, described [below](#wind-steering).

## Use

1. Install **History Widgets** from the App Store and restart the server. The
   plugin is enabled on install.
2. In Freeboard-SK, press and hold an empty spot in a widget area (a corner or
   the bottom centre) and pick **History strip** (tall) or **History strip
   (wide)**.
3. Pick the value: a quick button (TWD, TWS, TWA, AWA, AWS, SOG, STW, COG,
   HDG, depth, air pressure, air and water temperature) or any numeric Signal K
   path. Tap the time span, from 5 minutes to 24 hours.

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
`navigation.headingTrue`, `navigation.courseOverGroundTrue`,
`navigation.course.calcValues.bearingTrue` and `environment.current.setTrue`
(with magnetic north `navigation.headingMagnetic`,
`navigation.courseOverGroundMagnetic`,
`navigation.course.calcValues.bearingMagnetic` and
`environment.current.setMagnetic`), plus `environment.wind.*`,
`navigation.speedOverGround`, `environment.current.drift` and
`steering.rudderAngle`.

## Tank level and battery charge

A tank's level or a battery bank's state of charge as a glass cylinder or, if
you prefer, a flat bar, with the percentage underneath. A tank that publishes
its capacity also shows the volume left, and a battery bank its voltage, in
the units set in the server's Unit Preferences. The colour follows the zones
set for the level in the server's metadata (`meta.zones`): green when the
level is normal, yellow in an alert or warn zone, red in an alarm or
emergency zone. Marks beside the bar show where the zones begin, so you see
how far the level is from the next one. Without zones the bar stays green.

![A battery bank as a cylinder and as a flat bar, and a tank as a flat bar](docs/screenshots/levels.png)

Both come in a small size too (1x1), with the reading beside the bar:

![Small battery and tank widgets](docs/screenshots/levels-small.png)

Press and hold the widget to pick another tank or bank. The panel lists every
`tanks.*.*.currentLevel` (or every
`electrical.batteries.*.capacity.stateOfCharge`) on the server with its
current level, plus any other 0 to 100 % value, and offers the look (3D or
flat) and whether to show the volume or voltage as buttons, so it is set up
with a few taps and no keyboard. A level older than two minutes shows as
`--`.

## Clock

The time, as large as the widget allows, with the date underneath. It shows
this screen's time zone, UTC, or the boat's time zone as the server reports
it (`environment.time.timezoneRegion`, or `environment.time.timezoneOffset`),
so every screen on board shows the same time wherever its own clock is set.
A screen whose clock is more than two seconds off the GPS time
(`navigation.datetime`) follows the GPS, which keeps a display that booted
without a network right.

![The clock in boat time](docs/screenshots/clock.png)

Press and hold the clock to choose the zone, 24 or 12 hours, and whether to
show seconds and the date, all with buttons.

## Requirements

- Signal K server 2.22.1 or newer (History API v2) on Node 24 or newer
- A chartplotter that hosts Plotter Extensions widgets, such as Freeboard-SK
