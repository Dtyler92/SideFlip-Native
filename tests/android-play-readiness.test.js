import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => fs.readFileSync(new URL(path, root), 'utf8')

test('Android Play config uses the stable package and minimal permissions', () => {
  const config = JSON.parse(read('app.json')).expo
  assert.equal(config.android.package, 'com.sideflip.app')
  assert.equal(config.scheme, 'sideflip')
  assert.equal(config.version, '1.4.0')
  assert.equal(config.android.versionCode, 12)
  assert.equal(config.android.softwareKeyboardLayoutMode, 'resize')
  assert.equal(config.android.intentFilters, undefined)
  assert.equal(config.android.googleServicesFile, undefined)
  assert.deepEqual(config.android.permissions, ['android.permission.CAMERA'])
  assert.deepEqual(new Set(config.android.blockedPermissions), new Set([
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]))
  const imagePicker = config.plugins.find(item => Array.isArray(item) && item[0] === 'expo-image-picker')
  assert.equal(imagePicker[1].microphonePermission, false)
})

test('Android photo library uses the system picker without broad permission prompts', () => {
  for (const path of ['src/components/PhotoPicker.js', 'src/components/MultiPhotoPicker.js']) {
    const source = read(path)
    assert.match(source, /Platform\.OS !== 'android'/)
    assert.match(source, /launchImageLibraryAsync/)
  }
})

test('Android tabs respect the native bottom navigation safe area', () => {
  const app = read('App.js')
  assert.match(app, /useSafeAreaInsets/)
  assert.match(app, /const insets = useSafeAreaInsets\(\)/)
  assert.match(app, /const ANDROID_NAV_COMFORT = 10/)
  assert.match(app, /const navComfort = Platform\.OS === 'android' \? ANDROID_NAV_COMFORT : 0/)
  assert.match(app, /height:\s*56 \+ insets\.bottom \+ navComfort/)
  assert.match(app, /paddingBottom:\s*insets\.bottom \+ navComfort/)
  assert.doesNotMatch(app, /height:\s*84/)
  assert.doesNotMatch(app, /paddingBottom:\s*28/)
})

test('sales listing modal clears the Android status and navigation safe areas', () => {
  const detail = read('src/screens/ProjectDetailScreen.js')
  assert.match(detail, /useSafeAreaInsets/)
  assert.match(detail, /const insets = useSafeAreaInsets\(\)/)
  assert.match(detail, /modalHeaderPaddingTop = Platform\.OS === 'android' \? Math\.max\(20, insets\.top \+ 12\) : 20/)
  assert.match(detail, /modalContentPaddingBottom = Platform\.OS === 'android' \? Math\.max\(48, insets\.bottom \+ 24\) : 48/)
  assert.match(detail, /generatorCardPaddingBottom = Platform\.OS === 'android' \? Math\.max\(34, insets\.bottom \+ 24\) : 34/)
  assert.ok((detail.match(/paddingTop: modalHeaderPaddingTop/g) || []).length >= 2)
  assert.ok((detail.match(/paddingBottom: modalContentPaddingBottom/g) || []).length >= 2)
  assert.match(detail, /contentContainerStyle=\{\[s\.generatorCardContent, \{ paddingBottom: generatorCardPaddingBottom \}\]\}/)
})

test('EAS Android submission is restricted to the Google Play internal track', () => {
  const eas = JSON.parse(read('eas.json'))
  assert.equal(eas.submit.production.android.track, 'internal')
})

test('Android artifacts, generated native projects, and Play credentials stay uncommitted', () => {
  const ignore = read('.gitignore')
  for (const entry of ['/android/', '/ios/', 'builds/', '*.aab', '*.apk', 'google-service-account.json']) {
    assert.match(ignore, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
