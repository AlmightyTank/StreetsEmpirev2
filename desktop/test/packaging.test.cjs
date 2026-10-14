'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const { DESKTOP_BETA_RELEASE_URL } = require('../src/shell-state.cjs');

test('desktop beta package metadata points at the 0.2.0 refresh', () => {
  assert.equal(pkg.version, '0.2.0');
  assert.match(pkg.description, /Four-tab StreetsEmpire desktop client/);
  assert.equal(DESKTOP_BETA_RELEASE_URL, 'https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta');
  assert.equal(pkg.build.icon, 'assets/icon.png');
  assert.ok(pkg.build.files.includes('assets/**'));
});

test('desktop package includes approved square transparent icon assets', () => {
  const buildDir = path.join(__dirname, '..', 'assets');
  for (const file of ['icon.png', 'icon.ico', 'icon.icns']) {
    assert.ok(fs.existsSync(path.join(buildDir, file)), `${file} should exist`);
  }
  const png = fs.readFileSync(path.join(buildDir, 'icon.png'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height, 'PNG icon should be square');
  assert.ok([512, 1024].includes(width), `PNG icon should be 512 or 1024px, got ${width}`);
  assert.equal(png[25], 6, 'PNG should be RGBA/color type 6 for transparency');
});

test('desktop runtime window uses bundled app icon assets', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8');
  assert.match(mainSource, /process\.platform === 'win32' \? 'icon\.ico' : 'icon\.png'/);
  assert.match(mainSource, /icon: appIconPath\(\)/);
});

test('Windows release is a portable executable with no installer or elevation', () => {
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.equal(pkg.build.win.requestedExecutionLevel, 'asInvoker');
  assert.deepEqual(pkg.build.win.target, ['portable']);
  assert.equal(pkg.build.nsis, undefined);
  assert.equal(pkg.build.portable.artifactName, 'StreetsEmpire-Portable-${version}.${ext}');
  assert.match(pkg.scripts['dist:portable'], /electron-builder --win portable --x64/);
  assert.equal(pkg.scripts['dist:win'], 'npm run dist:portable');
});

test('macOS builds separate portable ZIP applications for Intel and Apple Silicon', () => {
  assert.equal(pkg.build.mac.icon, 'assets/icon.icns');
  assert.deepEqual(pkg.build.mac.target, ['zip']);
  assert.equal(pkg.build.mac.artifactName, 'StreetsEmpire-macOS-${arch}-${version}.${ext}');
  assert.match(pkg.scripts['dist:mac:x64'], /electron-builder --mac zip --x64/);
  assert.match(pkg.scripts['dist:mac:arm64'], /electron-builder --mac zip --arm64/);
  assert.equal(pkg.build.mac.identity, null);
});

test('Linux builds a portable AppImage without an installation package', () => {
  assert.equal(pkg.build.linux.icon, 'assets/icon.png');
  assert.deepEqual(pkg.build.linux.target, ['AppImage']);
  assert.equal(pkg.build.linux.artifactName, 'StreetsEmpire-Linux-${arch}-${version}.${ext}');
  assert.match(pkg.scripts['dist:linux'], /electron-builder --linux AppImage --x64/);
});
