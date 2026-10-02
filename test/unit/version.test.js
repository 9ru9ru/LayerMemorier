'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');

test('package.json and manifest agree on the version, panel opens 900px wide', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const man = fs.readFileSync(path.join(root, 'CSXS/manifest.xml'), 'utf8');
  assert.equal(pkg, '0.4.1');
  assert.match(man, new RegExp(`ExtensionBundleVersion="${pkg}"`));
  assert.match(man, new RegExp(`Extension Id="local.layermemorier.panel" Version="${pkg}"`));
  assert.match(man, /<Size><Height>760<\/Height><Width>900<\/Width><\/Size>/);
});
