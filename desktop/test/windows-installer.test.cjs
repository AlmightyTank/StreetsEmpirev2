'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('Windows release is a portable executable with no installer or elevation', () => {
  assert.equal(pkg.build.win.requestedExecutionLevel, 'asInvoker');
  assert.deepEqual(pkg.build.win.target, ['portable']);
  assert.equal(pkg.build.nsis, undefined);
  assert.equal(pkg.build.portable.artifactName, 'StreetsEmpire-Portable-${version}.${ext}');
  assert.match(pkg.scripts['dist:portable'], /electron-builder --win portable --x64/);
  assert.equal(pkg.scripts['dist:win'], 'npm run dist:portable');
});
