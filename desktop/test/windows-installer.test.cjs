'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('Windows installer is per-user and never asks for elevation', () => {
  assert.equal(pkg.build.win.requestedExecutionLevel, 'asInvoker');
  assert.ok(pkg.build.win.target.includes('nsis'));
  assert.equal(pkg.build.nsis.oneClick, true);
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.build.nsis.allowElevation, false);
  assert.equal(pkg.build.nsis.packElevateHelper, false);
  assert.equal(pkg.build.nsis.runAfterFinish, false);
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
});
