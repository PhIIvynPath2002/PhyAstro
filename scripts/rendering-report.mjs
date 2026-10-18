import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true } });
try {
  const { systemSnapshot } = await server.ssrLoadModule('/src/core/system/Ephemeris.ts');
  const { solarVisibility, phase } = await server.ssrLoadModule('/src/core/system/Illumination.ts');
  const { bodyPose } = await server.ssrLoadModule('/src/core/system/BodyPose.ts');
  const { SNAPSHOTS, ECLIPSE_SNAPSHOTS } = await server.ssrLoadModule('/src/core/system/CivilTime.ts');
  const assets = [];
  for (const name of ['earth.jpg', 'moon.jpg', 'source/earth.png', 'source/moon.jpg']) {
    const bytes = await readFile(new URL(`../src/assets/${name}`, import.meta.url));
    assets.push({ file: `src/assets/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const snapshots = [...SNAPSHOTS, ...ECLIPSE_SNAPSHOTS].map(utc => {
    const snapshot = systemSnapshot(new Date(utc));
    return { utc, frame: snapshot.frame, snapshot,
      moonFromEarth: phase(snapshot, snapshot.bodies.earth.positionKm, 'moon'),
      moonCenterShadow: solarVisibility(snapshot.bodies.moon.positionKm, snapshot, 'earth'),
      earthCenterShadow: solarVisibility(snapshot.bodies.earth.positionKm, snapshot, 'moon'),
      poses: Object.fromEntries(['earth', 'moon', 'sun'].map(id => [id, bodyPose(id, new Date(utc))])) };
  });
  const report = { version: '0.3.0', generatedAtUTC: new Date().toISOString(),
    independentEphemerisValidation: 'Not completed; prior Horizons CONNECT 403 is recorded in v0.2.0-science.json. No new external reference claim.',
    shadowModel: 'Uniform-brightness angular circles; planar disc overlap; physical surface/radii; no atmosphere or contact-time accuracy claim.',
    assets, snapshots };
  await writeFile(new URL('../docs/validation/v0.3.0-rendering.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ version: report.version, snapshots: snapshots.map(row => ({ utc: row.utc, phaseDeg: row.moonFromEarth.angleDeg,
    lunarShadow: row.moonCenterShadow.state, solarVisibility: row.moonCenterShadow.fraction })), assets }, null, 2));
} finally { await server.close(); }
