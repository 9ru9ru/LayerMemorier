'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { psRun, psCall, ROOT } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');
const { enumerate } = require('../../core/variation');
const { buildJobs } = require('../../core/jobs');
const { CELL, expectedOn } = require('../helpers/cells');

const DEST = path.join(ROOT, 'test', 'out', 'export', '한글 폴더');

function pixel(png, col, row) {
  const i = ((row * 40 + 20) * png.width + (col * 40 + 20)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function runExport(jobs, layerIds) {
  const lines = [`LM.exportBegin(${JSON.stringify(JSON.stringify({ layerIds }))});`, 'var results = [];'];
  for (const job of jobs) {
    const arg = { on: job.on, off: job.off, path: DEST.replace(/\\/g, '/') + '/' + job.relativePath };
    lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(arg))}));`);
  }
  lines.push('results.push(LM.exportEnd());', 'JSON.stringify(results)');
  return JSON.parse(psRun(lines.join('\n'))).map(r => JSON.parse(r));
}

test('export writes every variation with correct pixels and restores visibility', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  const { layers, byName } = buildFixture();
  const docData = docDataFor(byName, DEST);
  psCall('writeDocData', docData);

  const variations = enumerate(docData.categories, { excluded: docData.excluded });
  const { jobs, conflicts, warnings } = buildJobs(docData, layers, variations);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(warnings, [{ type: 'unused', detail: { count: 3 } }], 'BG, H, GB are in no combo');
  assert.equal(jobs.length, 12);

  const before = psCall('getLayers').map(l => [l.name, l.visible]);
  const results = runExport(jobs, layers.map(l => l.id));
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r));

  const written = [];
  for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) written.push(dir + '/' + f);
  assert.deepEqual(written.sort(), jobs.map(j => j.relativePath).sort());
  assert.ok(written.includes('fx_A0/fx_A0_0_1.png'));

  jobs.forEach((job, i) => {
    const png = PNG.sync.read(fs.readFileSync(path.join(DEST, job.relativePath)));
    assert.equal(png.width, 240);
    assert.equal(png.height, 160);
    for (const name of Object.keys(CELL)) {
      const [col, row, rgb] = CELL[name];
      const [r, g, b, a] = pixel(png, col, row);
      const on = expectedOn(name, variations[i]);
      const where = `${job.relativePath} ${name}`;
      if (on) {
        assert.equal(a, 255, where + ' alpha');
        assert.ok(Math.abs(r - rgb[0]) <= 2 && Math.abs(g - rgb[1]) <= 2 && Math.abs(b - rgb[2]) <= 2, `${where} rgb=${[r, g, b]}`);
      } else {
        assert.equal(a, 0, where + ' should be transparent');
      }
    }
  });

  const after = psCall('getLayers').map(l => [l.name, l.visible]);
  assert.deepEqual(after, before, 'visibility restored');
});

test('exportOne reports an error for an unwritable path and export continues', () => {
  const { layers, byName } = buildFixture();
  const docData = docDataFor(byName, DEST);
  const bad = psCall('exportBegin', { layerIds: layers.map(l => l.id) });
  assert.equal(bad.ok, true);
  const out = psRun(`LM.exportOne(${JSON.stringify(JSON.stringify({ on: [], off: [], path: 'Q:/no/such/drive/x.png' }))})`);
  assert.match(out, /"error"/);
  assert.equal(psCall('exportEnd').ok, true);
});
