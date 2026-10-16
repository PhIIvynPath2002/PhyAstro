# PhyAstro

Less Interface. More Universe.

## 下载离线版 0.1.3

- [单文件 HTML](https://github.com/PhIIvynPath2002/PhyAstro/raw/refs/tags/v0.1.3/PhyAstro-0.1.3.html)
- [离线 ZIP 包与使用说明](https://github.com/PhIIvynPath2002/PhyAstro/raw/refs/tags/v0.1.3/PhyAstro-0.1.3-offline.zip)
- [v0.1.3 标签文件](https://github.com/PhIIvynPath2002/PhyAstro/tree/v0.1.3)

macOS 使用近期版本 Google Chrome，Windows 使用近期版本 Microsoft Edge。
下载 HTML 后直接用浏览器打开；下载 ZIP 后先解压，再打开其中的 HTML。
程序、图标、地理数据和日月计算均已内置，无须联网、npm 或本地服务器。
需要 WebGL 2 与图形加速。设备自动定位可能需要系统定位服务与权限，
手动地点和 UTC 时间输入可离线使用。当前已在断网 Linux Chromium 中验证，
尚未在真实 macOS Chrome 或 Windows Edge 系统中验证。

也可以在 Tags 页面下载 `v0.1.3` 的源代码 ZIP：解压后直接打开根目录中的
`PhyAstro-0.1.3.html`，无须构建源码。

Phase 0.1 is a local, observer-centered celestial coordinate prototype. It
contains Earth, an observer, the celestial sphere, horizontal and equatorial
coordinates, an ecliptic reference, and geometric Sun/Moon positions. There are no stars, other solar-system objects,
accounts, remote services, or deployment requirements.

## Run locally

Use Node.js 24 and npm 11. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. The cloud workspace uses port 5173. A browser
with WebGL 2 is required. Browser geolocation requires a secure context (HTTPS
or localhost); manual coordinates always work. No API keys are required. All
geographic assets and astronomy calculations are bundled locally.

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use `/usr/bin/chromium` in this cloud environment. Elsewhere set
`CHROMIUM_PATH` to a Chromium executable. Playwright starts Vite when needed;
do not run an unrelated service on port 5173 during the tests. Screenshots are
written to `test-results/` and are not committed.

## Interaction

- The `天球` / `地面` selector switches between the external globe and a local
  observer view. Each view retains its camera orientation; reset restores its
  default. Ground mode starts facing north at altitude +15 degrees.
- In ground mode the camera stays at the directional origin. Zoom changes field
  of view (20-110 degrees), never the observer location. The view still rotates
  freely through complete turns with wheel/trackpad and drag input.
- Ground horizontal rotation (Shift-wheel, horizontal trackpad scrolling, or
  horizontal drag) is about local zenith, not the camera's tilted screen-up axis.
  It preserves geometric altitude even after a pole crossing. Vertical rotation
  still supports continuous full turns.
- Ground mode uses only grayscale: the sky is near black and the lower hemisphere
  is uniform gray. Above-horizon reference lines are brighter; below-horizon
  segments are dim dashed lines and can be hidden in the layer tool. Equatorial,
  ecliptic, horizontal-grid and label visibility remain independent choices.
- Drag to freely orbit Earth, including across both poles. Camera up follows the
  rotation, so there is no pole clamp or forced upright flip.
- Wheel down moves the viewpoint downward around its current screen-right axis;
  wheel up upward. Continuous input can complete any number of full turns.
- Two-finger vertical trackpad scrolling has the same behavior as the mouse wheel.
  Fractional pixel deltas are preserved, normalized with line/page wheel events,
  and smoothed with a time-based response. Horizontal trackpad scrolling rotates
  horizontally. The operating system's natural-scroll setting determines the
  sign of the delivered scroll delta.
- Shift + wheel down moves the viewpoint right around its current screen-up
  axis; wheel up left, including after the viewpoint has turned upside down.
- Ctrl/Command + wheel up zooms in; wheel down zooms out.
- On touch screens, drag to orbit and pinch to zoom. Zoom/reset buttons are also available.
- With the canvas focused, arrow keys rotate, +/- zoom, and R resets the view.
- The location, time, layers, and direction-probe tools are in the upper right.
- Click a reference or its spatial label to inspect its coordinates.
- Double-click any reference stroke for its bilingual name, coordinate system,
  fixed coordinates, ranges, units and picked direction. RA/azimuth grids use
  separately identified semicircles so opposite halves are not given one value.
  Picking chooses the closest stroke to the mouse ray; directions interpolate
  the rendered polyline and are not precision astrometric measurements.
- Double-click spatial terminology, inspector headings, or coordinate names for
  the full Chinese/English term. Moving the pointer away hides the definition.
- Location presets and recognized preset-city names update immediately offline;
  manual coordinates apply on submit. Editing preset coordinates changes the
  label to a custom location. Other names are labels, not a global geocoder.
  Valid UTC field changes update calculations immediately; Apply also commits
  and closes. Input and displayed time remain explicitly UTC, not local time.
- Tool panels stack above camera controls; covered controls cannot receive input.
- Activate the direction probe and click the sphere to choose a direction. Its
  inspector also accepts an exact right ascension and declination.
- Escape closes the current tool. Location is saved locally when storage is
  available. Time starts at the current UTC instant and stays fixed until edited.
- The canvas and spatial labels share the gesture surface. Labels accept wheel
  and drag; a tap still opens the inspector. Tool panels retain native editing and
  scrolling. Pointer capture keeps drags continuous across labels and the viewport.

## Offline HTML

```sh
npm run build:offline
```

This generates `dist/PhyAstro-offline.html`, with JavaScript, CSS, geography, and
icons embedded. An optional output path can be passed after `--`. The exporter
uses the installed Chromium to validate the document with networking disabled,
including two complete rotations and desktop/mobile rendering, and writes the
HTML only after checks pass. It also saves desktop/mobile screenshots beside it.
The cloud Chromium policy blocks direct `file://` navigation, so this check uses
the same inline document in an offline browser rather than claiming a tested
local-file launch. The exported classic script needs no module server or npm at
runtime. Browser geolocation remains optional and context-dependent.

Development remains local/offline. Public hosting and publication are deferred
until the user chooses to prepare version 1.0.

## Scientific conventions

The astronomy core is independent of rendering, DOM APIs, and UI state.

- Geographic latitude is north-positive and longitude is east-positive, in degrees.
  Earth is a sphere: input latitude is used as spherical latitude. Ellipsoid,
  altitude, and geodetic/geocentric corrections are outside this prototype.
- Core angles are radians. Equatorial vectors use right-handed XYZ, with +Z at
  the north celestial pole and +X at the mean vernal equinox of date. Renderer
  vectors are `(X, Z, -Y)`, a proper rotation that preserves handedness.
- Coordinates refer to the mean equator/equinox of the selected date, not ICRS
  or J2000 catalog coordinates. Catalog epoch transformations are not implemented.
- Astronomia 4.2.0 supplies Meeus coordinate transformations, mean sidereal time,
  estimated Delta T, and mean obliquity. Its west-positive geographical longitude
  and south-through-west azimuth conventions are adapted at the core boundary.
- Local sidereal time is GMST + east longitude. Hour angle is LST - RA.
  Azimuth is north-through-east: north 0 degrees, east 90 degrees. Altitude is
  0 at the horizon and +90 at zenith. RA displays as hours, other angles as degrees.
- UTC approximates UT1. Estimated TT is obtained using Astronomia's Delta T for
  the obliquity calculation. There is no nutation, polar motion, refraction,
  leap-second input, or observational-precision guarantee. UI dates are limited
  to 1900 through 2100; the limits are a product boundary, not an accuracy claim.
- The ecliptic is the mean ecliptic of date. Its north pole is
  `(0, -sin(obliquity), cos(obliquity))` in the equatorial frame.
- Zenith is `(cos(lat)cos(LST), cos(lat)sin(LST), sin(lat))`. The horizon is
  perpendicular to this vector. Its directions are translated to the geocenter
  for display; the observer's physical tangent plane remains at Earth's surface.
- North celestial pole altitude equals observer latitude, including below the
  horizon in the southern hemisphere. Azimuth at zenith/nadir and RA at celestial
  poles are undefined and displayed as such. At geographic poles, horizontal
  orientation follows the chosen longitude's reference meridian.
- Earth turns by GMST within the date's mean equatorial frame. The celestial
  sphere's radius is an arbitrary display scale, not a distance measurement.
  Illumination is for model visibility and does not represent the Sun or day/night.
- The direction probe stores mean-of-date RA/Dec values. Changing time retains
  those numerical values in the new date's frame; it is not a propagated star.
- Observer view rotates equatorial directions into the local east/north/up basis,
  rendered as `(east, up, -north)`. The camera is at the origin, not on the rendered
  globe surface: the finite display sphere must not introduce parallax. Reference
  polylines are split at intersections with the geometric altitude-zero plane.
  The gray lower hemisphere is only a backdrop, not a terrain model. Above the
  horizon means geometrically above, not guaranteed observable; there is no
  atmosphere, refraction, terrain, city map, or actual environment rendering.

### Sun and Moon

Astronomia supplies Meeus chapter 25 low-order geometric solar longitude/distance
and chapter 47 lunar periodic terms, evaluated at estimated TT. They are converted
using mean obliquity of date, consistent with the existing GMST frame. The solar
model assumes zero ecliptic latitude. These are approximate geometric positions,
not apparent high-precision ephemerides: there is no nutation, aberration,
light-time, atmospheric refraction, polar motion or terrain correction.

The observer position (spherical Earth radius 6371.0088 km, zero elevation) is
subtracted from each geocentric body vector before calculating topocentric RA,
Dec, azimuth, altitude, distance and angular diameter. Orbit mode uses geocentric
directions; ground mode uses topocentric directions. Inspectors distinguish both.
Sun radius is the IAU nominal 695700 km; lunar mean radius is 1737.4 km; the AU is
149597870.7 km. Angular diameter is `2 asin(radius / observer distance)`.

Bodies are unlit sphere models projected to the direction sphere. Their display
radius is `sphere radius * sin(angular diameter / 2)`, without visual inflation.
Thus angular sizes are correct **from the coordinate origin**, not from arbitrary
external camera locations. Earth, Moon and Sun are not shown at a common physical
distance/size scale. Numerical physical distances/radii remain available in the
inspector. No solar lighting, lunar phase, texture-based orientation, eclipse
simulation, or occultation ordering is claimed. Below-horizon portions follow
the existing dim/hidden convention; the horizon is geometric, not a visibility
forecast. Displayed digits do not constitute an accuracy guarantee.

Tests include Meeus examples 25.a and 47.a, topocentric vector geometry, angular
scale, location/time updates offline, horizon-axis rotation, panel hit-testing,
double-click stroke/term behavior, and actual Sun disk pixels on desktop/mobile.
This remains a teaching/visualization prototype, not a navigation, telescope
pointing, or eclipse-contact timing tool.

The tests verify the J2000 GMST reference, orthonormal observer bases, cardinal
directions, pole and zenith relationships, both coordinate-conversion round trips,
and the ecliptic inclination. Browser tests verify actual canvas pixels, camera
motion, location/time editing, layers, probing, permission denial, and mobile layout.

## Structure

```text
src/
  core/astronomy/   Coordinate systems, transformations, observer, time
  core/data/        Application state and a small set of location presets
  celestial/        Render-independent reference geometry and semantic objects
  rendering/        Three.js scene, Earth texture, picking, spatial labels
  interaction/      Camera and input controller
  ui/               On-demand tools, inspector, numerical formatting
tests/
  astronomy/        Scientific and geometry checks
  browser/          Browser interaction and rendering checks
```

## Data and references

- [Astronomia](https://github.com/commenthol/astronomia), MIT; algorithms based
  on Jean Meeus, *Astronomical Algorithms*, including chapters 12, 13 and 22.
- [World Atlas](https://github.com/topojson/world-atlas), ISC; land geometry from
  [Natural Earth](https://www.naturalearthdata.com/), public domain. Earth uses a
  bundled 1:110m land dataset rasterized at startup, with no remote image requests.
- [Three.js](https://threejs.org/), MIT; [Lucide](https://lucide.dev/), ISC.

This phase deliberately excludes stellar/planetary databases beyond Sun/Moon,
lessons, cloud synchronization, installers, and public deployment.
