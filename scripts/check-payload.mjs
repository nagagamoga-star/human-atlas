import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

// Ceilings sit a little above the post-cleanup build (node:zlib gzip, default level).
// Models were 32,956,129 bytes; the entry bundle was 134,706 bytes gzipped.
// Vite's own gzip reporter is a few kilobytes higher and is not what this script measures.
const MODEL_GZIP_BUDGET = 36_000_000;
const MAIN_JS_GZIP_BUDGET = 160_000;

const distUrl = new URL('../dist/', import.meta.url);
const dist = distUrl.pathname;
const failures = [];

function kb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(child) : fs.statSync(child).size;
  }
  return total;
}

function rel(file) {
  return path.relative(dist, file);
}

if (!fs.existsSync(dist)) {
  console.error('dist/ is missing. Run npm run build first.');
  process.exit(1);
}

const publicModels = path.join(distUrl.pathname, '../public/models');
const rawInPublic = fs.readdirSync(publicModels).filter((name) => name.endsWith('.bin'));
if (rawInPublic.length) failures.push(`public/models still ships uncompressed ${rawInPublic.join(', ')}`);

const modelDir = path.join(dist, 'models');
const modelNames = fs.existsSync(modelDir) ? fs.readdirSync(modelDir) : [];
const rawInDist = modelNames.filter((name) => name.endsWith('.bin'));
if (rawInDist.length) failures.push(`dist/models still ships uncompressed ${rawInDist.join(', ')}`);
const gzipNames = modelNames.filter((name) => name.endsWith('.bin.gz')).sort();
if (!gzipNames.length) failures.push('dist/models has no .bin.gz payload');
let modelGzip = 0;
for (const name of gzipNames) modelGzip += fs.statSync(path.join(modelDir, name)).size;
if (modelGzip > MODEL_GZIP_BUDGET) {
  failures.push(`gzipped models are ${modelGzip} bytes, over the ${MODEL_GZIP_BUDGET} byte budget`);
}

const htmlPath = path.join(dist, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const entryMatch = html.match(/<script type="module"[^>]*\ssrc="([^"]+\.js)"/);
if (!entryMatch) failures.push('dist/index.html has no module entry script');
const entryPath = entryMatch ? path.join(dist, entryMatch[1].replace(/^\//, '')) : '';
const entryBytes = entryPath && fs.existsSync(entryPath) ? fs.statSync(entryPath).size : 0;
const entryGzip = entryPath && fs.existsSync(entryPath) ? gzipSync(fs.readFileSync(entryPath)).length : 0;
if (!entryPath || !fs.existsSync(entryPath)) failures.push('the main JS bundle named by index.html is missing');
else if (entryGzip > MAIN_JS_GZIP_BUDGET) {
  failures.push(`main JS gzip is ${entryGzip} bytes, over the ${MAIN_JS_GZIP_BUDGET} byte budget`);
}

const cssMatch = html.match(/<link rel="stylesheet"[^>]*\shref="([^"]+\.css)"/);
const cssPath = cssMatch ? path.join(dist, cssMatch[1].replace(/^\//, '')) : '';
const cssBytes = cssPath && fs.existsSync(cssPath) ? fs.statSync(cssPath).size : 0;
const cssGzip = cssPath && fs.existsSync(cssPath) ? gzipSync(fs.readFileSync(cssPath)).length : 0;

const assetDir = path.join(dist, 'assets');
const jsChunks = fs.existsSync(assetDir)
  ? fs.readdirSync(assetDir).filter((name) => name.endsWith('.js')).sort()
  : [];

const rows = [
  ['Gzipped models', `${gzipNames.length} chunks`, kb(modelGzip), `${MODEL_GZIP_BUDGET.toLocaleString('en-US')} bytes`],
  ['Main JS', entryPath ? rel(entryPath) : 'missing', `${kb(entryBytes)} raw, ${kb(entryGzip)} gzip`, `${kb(MAIN_JS_GZIP_BUDGET)} gzip`],
  ['CSS', cssPath ? rel(cssPath) : 'missing', `${kb(cssBytes)} raw, ${kb(cssGzip)} gzip`, ''],
  ['dist/', '', `${dirSize(dist).toLocaleString('en-US')} bytes`, ''],
];

for (const name of jsChunks) {
  const file = path.join(assetDir, name);
  if (entryPath && path.resolve(file) === path.resolve(entryPath)) continue;
  const size = fs.statSync(file).size;
  const gzip = gzipSync(fs.readFileSync(file)).length;
  rows.push(['JS chunk', `assets/${name}`, `${kb(size)} raw, ${kb(gzip)} gzip`, size >= 500_000 ? 'over Vite\'s 500 kB warning' : '']);
}

const table = [
  '## Payload',
  '',
  '| Asset | Where | Size | Budget |',
  '| --- | --- | ---: | ---: |',
  ...rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`),
  '',
  modelGzip <= MODEL_GZIP_BUDGET
    ? `Model headroom: ${(MODEL_GZIP_BUDGET - modelGzip).toLocaleString('en-US')} bytes.`
    : `Model payload is over budget by ${(modelGzip - MODEL_GZIP_BUDGET).toLocaleString('en-US')} bytes.`,
  entryGzip <= MAIN_JS_GZIP_BUDGET
    ? `Main JS headroom: ${(MAIN_JS_GZIP_BUDGET - entryGzip).toLocaleString('en-US')} bytes gzip.`
    : `Main JS is over budget by ${(entryGzip - MAIN_JS_GZIP_BUDGET).toLocaleString('en-US')} bytes gzip.`,
  '',
].join('\n');

console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);

if (failures.length) {
  console.error('\nPayload budget failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
