import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFeedbackMailto, FEEDBACK_EMAIL } from '../src/lib/feedback.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('feedback mail links are bounded, encoded, and include useful build context', () => {
  assert.equal(FEEDBACK_EMAIL, 'tyler@tourbillionenergy.com')
  const bug = buildFeedbackMailto('bug', 'android', '1.4.0')
  assert.match(bug, /^mailto:tyler@tourbillionenergy\.com\?/)
  assert.match(decodeURIComponent(bug), /subject=SideFlip Bug Report/)
  assert.match(decodeURIComponent(bug), /Please describe what happened:/)
  assert.match(decodeURIComponent(bug), /App version: 1\.4\.0/)
  assert.match(decodeURIComponent(bug), /Platform: android/)

  const suggestion = decodeURIComponent(buildFeedbackMailto('suggestion', 'ios', '1.4.0'))
  assert.match(suggestion, /subject=SideFlip Suggestion/)
  assert.match(suggestion, /Please share your suggestion:/)
  assert.match(suggestion, /Platform: ios/)
})

test('feedback mail links reject unsupported kinds and bound untrusted context', () => {
  assert.throws(() => buildFeedbackMailto('other', 'android', '1.4.0'), /Unsupported feedback kind/)
  const decoded = decodeURIComponent(buildFeedbackMailto('bug', 'x'.repeat(200), 'v'.repeat(200)))
  assert.ok(decoded.length < 500)
})

test('Settings exposes accessible bug and suggestion actions on every build', () => {
  const settings = source('src/screens/SettingsScreen.js')
  const packageJson = JSON.parse(source('package.json'))
  assert.match(settings, /import \{ buildFeedbackMailto \} from '\.\.\/lib\/feedback'/)
  assert.match(settings, /import appConfig from '\.\.\/\.\.\/app\.json'/)
  assert.match(settings, /const APP_VERSION = Application\.nativeApplicationVersion \|\| appConfig\.expo\.version/)
  assert.match(settings, /Linking\.openURL\(buildFeedbackMailto\(kind, Platform\.OS, APP_VERSION\)\)/)
  assert.match(settings, /accessibilityLabel="Report a Bug"/)
  assert.match(settings, />Report a Bug<\/Text>/)
  assert.match(settings, /onPress=\{\(\) => openFeedback\('bug'\)\}/)
  assert.match(settings, /accessibilityLabel="Leave a Suggestion"/)
  assert.match(settings, />Leave a Suggestion<\/Text>/)
  assert.match(settings, /onPress=\{\(\) => openFeedback\('suggestion'\)\}/)
  assert.match(settings, /Could not open your email app/)
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.js')
})

test('iOS Settings places the complete Help section below Account and above Currency', () => {
  const settings = source('src/screens/SettingsScreen.js')
  const account = settings.indexOf('<Text style={s.sectionTitle}>Account</Text>')
  const help = settings.indexOf('<Text style={s.sectionTitle}>Help</Text>')
  const currency = settings.indexOf('<Text style={s.sectionTitle}>Currency</Text>')

  assert.ok(account >= 0 && help >= 0 && currency >= 0)
  assert.ok(account < help, 'Help should follow Account')
  assert.ok(help < currency, 'Help should precede Currency')
  assert.match(settings.slice(help, currency), /Replay Walkthrough[\s\S]*Report a Bug[\s\S]*Leave a Suggestion/)
})
