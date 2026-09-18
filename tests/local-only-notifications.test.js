import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const localPlugin = './plugins/withLocalOnlyNotifications'

test('local-only policy is registered before expo-notifications and retains the dependency', () => {
  const app = require('../app.json').expo
  assert.equal(app.plugins[0], localPlugin)
  assert.ok(app.plugins.indexOf('expo-notifications') > app.plugins.indexOf(localPlugin))
  assert.match(require('../package.json').dependencies['expo-notifications'], /^~0\.32\./)
})

for (const environment of ['development', 'production', undefined]) {
  test(`local-only mod removes only APNs and is idempotent (${environment})`, async () => {
    const plugin = require('../plugins/withLocalOnlyNotifications')
    const preserved = {
      'com.apple.developer.applesignin': ['Default'],
      'com.apple.security.application-groups': ['group.example.test'],
      'keychain-access-groups': ['$(AppIdentifierPrefix)com.example.test'],
      'get-task-allow': false,
    }
    const entitlements = { ...preserved }
    if (environment !== undefined) entitlements['aps-environment'] = environment
    const configured = plugin({ name: 'Test', slug: 'test' })
    assert.deepEqual(Object.keys(configured.mods), ['ios'])
    const result = await configured.mods.ios.entitlements({ modResults: entitlements, modRequest: {} })
    assert.deepEqual(result.modResults, preserved)
    const repeated = await configured.mods.ios.entitlements({ ...result, modRequest: {} })
    assert.deepEqual(repeated.modResults, preserved)
  })
}

// Exercise the installed SDK and actual app config, not a mocked plugin result.
// Native generation stays outside the managed source tree; no install/signing/build.
test('generated and introspected iOS entitlements omit APNs while notifications stay autolinked', { timeout: 180000 }, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'sideflip-local-notifications-'))
  const run = (binary, args) => execFileSync(path.join(root, 'node_modules/.bin', binary), args, {
    cwd: temporary,
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  })
  try {
    for (const file of ['app.json', 'package.json', 'assets', 'plugins']) {
      if (existsSync(path.join(root, file))) cpSync(path.join(root, file), path.join(temporary, file), { recursive: true })
    }
    symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir')
    run('expo', ['prebuild', '--clean', '--platform', 'ios', '--no-install'])
    const plist = require('@expo/plist').default
    const generated = plist.parse(readFileSync(path.join(temporary, 'ios/SideFlip/SideFlip.entitlements'), 'utf8'))
    assert.equal(Object.hasOwn(generated, 'aps-environment'), false)
    const info = plist.parse(readFileSync(path.join(temporary, 'ios/SideFlip/Info.plist'), 'utf8'))
    assert.equal((info.UIBackgroundModes ?? []).includes('remote-notification'), false)
    const introspected = JSON.parse(run('expo', ['config', '--type', 'introspect', '--json']))
    // Plist dictionaries have null prototypes; compare their JSON values.
    assert.deepEqual(introspected._internal.modResults.ios.entitlements, JSON.parse(JSON.stringify(generated)))
    assert.equal((introspected._internal.modResults.ios.infoPlist.UIBackgroundModes ?? []).includes('remote-notification'), false)
    const autolinking = JSON.parse(run('expo-modules-autolinking', ['resolve', '--platform', 'ios', '--json']))
    const notifications = autolinking.modules.find(module => module.packageName === 'expo-notifications')
    assert.ok(notifications, 'expo-notifications must remain in native autolinking')
    assert.ok(notifications.pods.some(pod => pod.podName === 'EXNotifications'))
    for (const module of ['PermissionsModule', 'SchedulerModule']) assert.ok(notifications.modules.includes(module))
    assert.equal(introspected.version, '1.1.0')
    assert.equal(introspected.ios.buildNumber, '20')
    assert.equal(introspected.ios.bundleIdentifier, 'com.sideflip.app')
    // Keep machine-readable evidence when requested by release preflight.
    if (process.env.LOCAL_NOTIFICATIONS_EVIDENCE_DIR) {
      cpSync(temporary, process.env.LOCAL_NOTIFICATIONS_EVIDENCE_DIR, { recursive: true, filter: source => path.basename(source) !== 'node_modules' })
      writeFileSync(path.join(process.env.LOCAL_NOTIFICATIONS_EVIDENCE_DIR, 'introspected.json'), JSON.stringify(introspected, null, 2))
      writeFileSync(path.join(process.env.LOCAL_NOTIFICATIONS_EVIDENCE_DIR, 'autolinking.json'), JSON.stringify(autolinking, null, 2))
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
