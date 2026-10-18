import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
const name = `PhyAstro-${version}-offline`;
const destination = resolve(process.argv[2] || join(repo, 'dist', `${name}.zip`));
await mkdir(dirname(destination), { recursive: true });
const staging = await mkdtemp(join(dirname(destination), '.phyastro-package-'));
const folder = join(staging, name);
await mkdir(join(folder, 'source'), { recursive: true });
await cp(join(repo, `PhyAstro-${version}.html`), join(folder, `PhyAstro-${version}.html`));
await cp(join(repo, 'docs'), join(folder, 'docs'), { recursive: true });
await cp(join(repo, 'CHANGELOG.md'), join(folder, 'CHANGELOG.md'));
for (const file of ['src', 'tests', 'scripts', 'package.json', 'package-lock.json', 'index.html',
  'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'README.md', '.nvmrc', '.gitignore'])
  await cp(join(repo, file), join(folder, 'source', file), { recursive: true });
// Source-relative license/docs imports used by the exporter remain reproducible.
await cp(join(repo, 'docs'), join(folder, 'source', 'docs'), { recursive: true });
await writeFile(join(folder, 'README.txt'), `PhyAstro ${version} — Local Offline Prototype\n\n` +
  `打开 PhyAstro-${version}.html。macOS 使用近期 Chrome，Windows 使用近期 Edge。\n` +
  `不需要联网、账户、npm 或服务器；需要 WebGL 2 与图形加速。\n` +
  `ZIP 请先完整解压。source/ 仅供开发，普通使用无须打开或编译。\n\n` +
  `主视图：天球坐标仪 / 宇宙空间观测。天球与地面在坐标仪内部。\n` +
  `空间：选择中心与目标，近观目标可查看表面；重置回到观测中心。\n` +
  `滚轮上下旋转，Shift+滚轮横向旋转，Command/Ctrl+滚轮缩放。\n` +
  `严格太阳光下夜侧和全食月面为黑色；可选 3.5% 调试补光。\n` +
  `2026-03-03 三个快照用于检查半影/本影，不是接触时刻预测。\n` +
  `物理比例与增强显示不同，增强球体轮廓不是严格食象轮廓。\n` +
  `UI Lighting 是艺术反馈，不是科学测量。太阳表面是静态程序化示意。\n\n` +
  `docs/ 含模型、资源许可和验证记录。source/src/assets/source/ 含原始地图，\n` +
  `source/src/rendering/system/SurfaceMaterial.ts 含太阳纹理与表面着色源码。\n` +
  `图像衍生素材按 GPL-2.0-or-later 分发，保留原文件、许可及上游署名。\n` +
  `独立 JPL 精度对照尚未完成；真实 macOS/Windows 交互与性能仍需确认。\n` +
  `仅限三天体几何与渲染实验，不用于导航、精密指向或食象预报。\n`);
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), `${relative}/`));
    else result.push(relative);
  }
  return result.sort();
}
const hashes = [];
for (const file of await files(folder)) hashes.push(`${createHash('sha256').update(await readFile(join(folder, file))).digest('hex')}  ${file}`);
await writeFile(join(folder, 'SHA256SUMS'), hashes.join('\n') + '\n');
const temporaryZip = join(staging, `${name}.zip`);
const zipped = spawnSync('zip', ['-q', '-r', temporaryZip, name], { cwd: staging, stdio: 'inherit' });
if (zipped.status !== 0) throw new Error('Offline ZIP packaging failed.');
await cp(temporaryZip, destination);
console.log(JSON.stringify({ version, file: destination, sourceDirectory: folder, checksummedFiles: hashes.length }, null, 2));
