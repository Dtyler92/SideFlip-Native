import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('iOS update displays SideFlip beneath the installed app icon', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
  assert.equal(expo.name, 'SideFlip')
  assert.equal(expo.ios.infoPlist.CFBundleDisplayName ?? expo.name, 'SideFlip')
  assert.equal(expo.ios.bundleIdentifier, 'com.sideflip.app')
  assert.equal(expo.version, '1.1.0')
  assert.equal(expo.ios.buildNumber, '22')
})
