import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, cacheDir: '/tmp/phyastro-v0.2-report-vite', server: { middlewareMode: true } });
try {
  const { systemSnapshot } = await server.ssrLoadModule('/src/core/system/Ephemeris.ts');
  const { measure } = await server.ssrLoadModule('/src/core/system/Measurements.ts');
  const { SNAPSHOTS } = await server.ssrLoadModule('/src/core/system/CivilTime.ts');
  const { solarLunarPositions } = await server.ssrLoadModule('/src/core/astronomy/Ephemeris.ts');
  const { astronomicalTime } = await server.ssrLoadModule('/src/core/astronomy/Time.ts');
  const snapshots = SNAPSHOTS.map(utc => systemSnapshot(new Date(utc)));
  const request = {
    format: 'json', COMMAND: "'301'", CENTER: "'500@399'", EPHEM_TYPE: "'VECTORS'",
    REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", VEC_CORR: "'NONE'", OUT_UNITS: "'KM-S'",
    TIME_TYPE: "'TT'", TLIST: `'${snapshots[0].julianDateTT.toFixed(9)}'`, CSV_FORMAT: "'YES'", VEC_TABLE: "'2'",
  };
  const args = ['--get', '--silent', '--show-error', '--fail-with-body', '--connect-timeout', '10', '--max-time', '20',
    'https://ssd.jpl.nasa.gov/api/horizons.api', ...Object.entries(request).flatMap(([key, value]) => ['--data-urlencode', `${key}=${value}`])];
  const attempt = spawnSync('curl', args, { encoding: 'utf8' });
  const external = {
    source: 'NASA JPL Horizons', endpoint: 'https://ssd.jpl.nasa.gov/api/horizons.api',
    attemptedAtUTC: new Date().toISOString(), request, exitCode: attempt.status,
    completed: false, status: attempt.status === 0 ? 'retrieved-but-not-yet-compared' : 'unavailable',
    reason: attempt.status === 0 ? 'Response obtained; no comparison has been approved by this report generator.' : attempt.stderr.trim(),
    expectedFrame: 'ICRF axes; distance comparison is orientation invariant; vector comparison needs the EQJ/ICRF frame-bias convention recorded.',
    expectedTimeScale: 'TT request at engine-computed TT; no claim of exact TDB conversion.',
  };
  if (attempt.status === 0) external.response = attempt.stdout;
  const comparisons = snapshots.flatMap(snapshot => [['earth', 'moon'], ['earth', 'sun'], ['moon', 'sun']].map(([observer, target]) => ({
    utc: snapshot.utc, julianDateTT: snapshot.julianDateTT, observer, target,
    computed: measure(snapshot, observer, target), referenceDistanceKm: null, referenceVectorKm: null,
    absoluteErrorKm: null, relativeError: null, conclusion: '尚未完成独立星历对照',
  })));
  const crossLibraryConsistency = snapshots.map(snapshot => {
    const legacy = solarLunarPositions(astronomicalTime(new Date(snapshot.utc)), { name: 'check', latitude: 0, longitude: 0 });
    return { utc: snapshot.utc,
      note: 'Astronomia low-order Meeus versus Astronomy Engine: cross-library model consistency only, not independent JPL validation.',
      bodies: legacy.map(body => {
        const engineDistanceKm = measure(snapshot, 'earth', body.id).distanceKm;
        return { id: body.id, engineDistanceKm, meeusDistanceKm: body.distanceKm, differenceKm: engineDistanceKm - body.distanceKm };
      }),
    };
  });
  const report = { version: '0.2.0', generatedAtUTC: new Date().toISOString(), frame: snapshots[0].frame,
    externalReference: external, snapshots, comparisons, crossLibraryConsistency };
  const output = new URL('../docs/validation/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('v0.2.0-science.json', output), JSON.stringify(report, null, 2) + '\n');
  const markdown = `# PhyAstro v0.2.0 Scientific Validation\n\n` +
    `Generated: ${report.generatedAtUTC}\n\n` +
    `## Reference And Time\n\nOrigin: Solar System Barycenter. Orientation: J2000 mean equator/equinox (EQJ), a right-handed frame. X: mean equinox; Z: north celestial pole; Y completes the axes. This is not labeled as exact ICRF. All bodies use Astronomy Engine 2.1.19 BaryState at the same estimated TT and are converted from library AU to km (${snapshots[0].frame.kmPerLibraryAU} km per library AU). Input is UTC, treated as UT1 for the library's Delta-T model. No light-time, aberration, refraction or gravitational deflection.\n\n` +
    `## Independent Ephemeris Comparison\n\n**尚未完成独立星历对照。** NASA JPL Horizons could not be compared in this run. Status: ${external.status}; curl exit: ${attempt.status}.\n\n` +
    `Diagnostic: ${external.reason}\n\nThe exact request and attempt time are saved in v0.2.0-science.json. Reference values and errors remain null; none of the following calculated distances are represented as NASA reference data. An eventual vector comparison must reconcile EQJ/ICRF frame bias and the TT/TDB time convention. Distance comparisons are invariant under axis rotation.\n\n` +
    `| UTC | Observer → Target | Computed Distance (km) | JPL Reference | Error | Conclusion |\n|---|---|---:|---|---|---|\n` +
    comparisons.map(row => `| ${row.utc} | ${row.observer} → ${row.target} | ${row.computed.distanceKm.toFixed(6)} | unavailable | not calculated | pending |`).join('\n') +
    `\n\n## Cross-Library Consistency\n\nThe retained Astronomia/Meeus backend is compared with the new system's Earth-to-body distances. This is a separate implementation check with partly shared analytical foundations, not a JPL accuracy certification.\n\n| UTC | Body | Astronomy Engine (km) | Astronomia/Meeus (km) | Engine − Meeus (km) |\n|---|---|---:|---:|---:|\n` +
    crossLibraryConsistency.flatMap(row => row.bodies.map(body => `| ${row.utc} | ${body.id} | ${body.engineDistanceKm.toFixed(6)} | ${body.meeusDistanceKm.toFixed(6)} | ${body.differenceKm.toFixed(6)} |`)).join('\n') +
    `\n\n## Automated Checks\n\nThe independent rendering-free suite checks vector antisymmetry, symmetric distances, triangle closure, angular-size units and invalid inputs, common epochs/frames, New York DST boundaries, display-only time-zone changes and scale invariance. Geometry tests cover swept camera collision, large-origin subtraction and actual-camera frustum/occlusion logic. Browser checks exercise the real rendered scene separately. Test counts and outcomes are reported in the delivery notes, not inferred from this data generator.\n\n## Reproduce\n\nRun \`npm run report:science\`. The command recalculates snapshots locally and attempts the documented Horizons request. Runtime application and offline HTML never contact Horizons.\n`;
  await writeFile(new URL('v0.2.0-science.md', output), markdown);
  console.log(JSON.stringify({ report: fileURLToPath(new URL('v0.2.0-science.json', output)), externalStatus: external.status, comparedWithJPL: false, snapshotCount: snapshots.length, comparisonRows: comparisons.length }, null, 2));
} finally { await server.close(); }
