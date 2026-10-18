# PhyAstro v0.3.0 Texture Sources

## Earth And Moon

Runtime maps: `src/assets/earth.jpg`, `src/assets/moon.jpg`, each 2048 x 1024,
equirectangular, north at the top, longitude 0 at the horizontal center.
The sphere UV mapping uses east-positive longitude; no photographic disc is
stretched over a sphere. Maps are static composites, not current observations.

Source repository: https://github.com/CelestiaProject/CelestiaContent

Pinned revision: `60316cf1c7df289b44b3c99711913bdbf1daea2e`.
Original editable map files are retained in `src/assets/source/` and the offline
ZIP, not fetched at runtime:

- `textures/hires/earth.png`: FarGetaNik; surface derived from Earth Starts Beating
  (https://www.earthstartsbeating.com/2019/01/16/mappamondo/), with specular data
  derived from Natural Earth II by Tom Patterson
  (http://www.shadedrelief.com/natural3/pages/extra.html).
- `textures/hires/moon.jpg`: FarGetaNik; LRO map via Celestial Matters, improved
  with NASA GSFC CGI Moon Kit (https://svs.gsfc.nasa.gov/4720).
  Credit NASA/GSFC/LRO, USGS, the original data teams, FarGetaNik and the
  Celestia contributors. This is a processed map, not an unmodified NASA image.

There are no per-file license sidecars for these two maps at this revision.
We retain the repository default **GPL-2.0-or-later**, rather than treating
third-party processing as public domain. Complete upstream attribution and the
GPL text are in `docs/licenses/CelestiaContent-credits.txt` and
`docs/licenses/GPL-2.0-or-later.txt`, and embedded in the offline HTML notices.
The image derivatives are distributed under GPL-2.0-or-later; this does not
relicense unrelated application code. No endorsement by NASA, JPL or Caltech
is claimed. Upstream attribution lists the sources, not a photometric calibration.

Reproducible conversion (ImageMagick):

```sh
magick src/assets/source/earth.png -alpha off -resize 2048x1024 -quality 90 src/assets/earth.jpg
magick src/assets/source/moon.jpg -resize 2048x1024 -quality 90 src/assets/moon.jpg
```

Earth alpha contains specular information; it is deliberately discarded, not
composited onto black. No bump, city lights, clouds or specular shader is used.
The original maps and the conversion instructions constitute the image source
delivery; the ZIP includes them with full licenses. Source URLs are provenance
only, not runtime dependencies.

NASA image servers were inaccessible from this environment (CONNECT 403).
The official NASA-3D-Resources mirror was inspected but its available lunar
photographs were not suitable global maps, so those were not shipped.

## Sun

`solarTexture()` in `src/rendering/system/SurfaceMaterial.ts` generates a static
1024 x 512 seeded bitmap at startup. Granulation-inspired mottling is a scientific
reference schematic / Artistic Visualization, not an observation, sunspot
catalog, temperature map, solar wind, MHD result or live solar activity.
The warm palette is illustrative, not calibrated naked-eye solar color.
Its executable source is included in the ZIP. No animation, particles, corona,
prominences, postprocessing or bloom is added.

## Other Resources

Existing v0.2.0 dependencies, licenses and instrument map data are unchanged.
No Sky Guide content is used. All runtime images are Vite inline data URLs;
the offline exporter embeds all code, CSS and license text.
