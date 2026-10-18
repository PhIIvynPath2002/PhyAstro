# Changelog

## 0.3.0 — 2026-10-18

- Preserve v0.2.0 geometric ephemeris, scales, snapshots and coordinate instrument.
- Add 2K Earth/Moon global textures and static schematic emissive solar surface.
- Add time-based Earth GAST/EQJ and lunar IAU body poses.
- Add solar Lambert illumination, strict/debug ambient modes and finite-disc
  physical eclipse shadows, with renderer-independent phase/occlusion tests.
- Add explicit camera/center phase readings, solar directions and shadow status.
- Separate primary views from the instrument's two submodes; retain camera states.
- Add near-target inspection and optional camera-driven artistic UI lighting.
- Embed maps and licenses in the offline HTML; retain editable image sources
  and complete resource/approximation notes in the offline ZIP.
- No new planets, runtime time propagation, live activity, atmosphere or MHD.
- Independent JPL ephemeris validation remains pending; no accuracy certification.

## 0.2.0 — 2026-10-17

- Add a unified offline Sun–Earth–Moon space system using Astronomy Engine
  2.1.19 barycentric positions with J2000 mean-equator/equinox axes and km units.
- Separate body-centre scientific measurements, actual orbital camera position,
  selected target and the always-present three-body render collection.
- Add Physical Scale and Enhanced Visibility with independently reported
  physical/render radii and unchanged scientific measurements.
- Add camera-relative rendering, adaptive clipping, logarithmic depth and
  swept camera collision for the multi-scale scene.
- Add four fixed 2026 snapshots and UTC/Beijing/New York civil time displays
  with DST; no continuous time propagation or lunar clock is introduced.
- Add a collapsible scientific debug panel, target aiming, local recentering,
  overview, actual-camera frustum and spherical occlusion status.
- Preserve the v0.1.3 coordinate instrument; precess Earth reference directions
  into the space frame and hide them for Sun/Moon observation centres.
- Extend offline HTML validation and mathematical/browser tests. Record the
  independent Horizons comparison as pending because the network proxy blocks
  the API; no reference values or error figures are fabricated.
- Establish `checkpoint/v0.1.3-before-v0.2.0` before modifying the clean v0.1.3
  snapshot. The earlier downloadable v0.1.3 artifacts remain intact.

## 0.1.3

- Offline celestial coordinate instrument with geographical observer, mean-of-
  date equatorial/ecliptic/horizontal coordinates, geometric Sun/Moon direction
  projections, ground view, probe, layer controls and bilingual line inspection.
- Continuous wheel/trackpad rotation and arrow-to-hand dragging cursor.
- Self-contained HTML/ZIP stored in the GitHub `v0.1.3` tag snapshot.
