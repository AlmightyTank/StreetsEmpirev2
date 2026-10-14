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

test('macOS builds separate portable ZIP applications for Intel and Apple Silicon', () => {
  assert.deepEqual(pkg.build.mac.target, ['zip']);
  assert.equal(pkg.build.mac.artifactName, 'StreetsEmpire-macOS-${arch}-${version}.${ext}');
  assert.match(pkg.scripts['dist:mac:x64'], /electron-builder --mac zip --x64/);
  assert.match(pkg.scripts['dist:mac:arm64'], /electron-builder --mac zip --arm64/);
  assert.equal(pkg.build.mac.identity, null);
});

test('Linux builds a portable AppImage without an installation package', () => {
  assert.deepEqual(pkg.build.linux.target, ['AppImage']);
  assert.equal(pkg.build.linux.artifactName, 'StreetsEmpire-Linux-${arch}-${version}.${ext}');
  assert.match(pkg.scripts['dist:linux'], /electron-builder --linux AppImage --x64/);
});
