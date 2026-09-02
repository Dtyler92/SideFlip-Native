import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('annual plan emphasizes the actual annual StoreKit charge over its calculated monthly equivalent', () => {
  const pro = source('src/screens/ProScreen.js')

  assert.match(pro, /const primaryPrice = item\?\.displayPrice \|\| null/)
  assert.match(pro, /const equivalentPrice = annual \? monthlyEquivalent\(item\) : null/)
  assert.match(pro, /const equivalentText = equivalentPrice \? `Equivalent to \$\{equivalentPrice\}\/month` : null/)
  assert.match(pro, /return Boolean\(item\?\.displayPrice\)/)
  assert.match(pro, /\{primaryPrice \|\| 'Loading Apple price…'\}/)
  assert.match(pro, /\{primaryPrice && <Text style=\{s\.unit\}>\{annual \? '\/year' : '\/month'\}<\/Text>\}/)
  assert.match(pro, /\{equivalentText && <Text style=\{s\.equivalent\}>\{equivalentText\}<\/Text>\}/)
  assert.match(pro, /equivalent: \{ fontSize: 13, color: '#8C8880'/)
  assert.doesNotMatch(pro, /const priceText = item \? \(annual \? monthlyEquivalent\(item\) : item\.displayPrice\)/)

  const primaryIndex = pro.indexOf("{primaryPrice || 'Loading Apple price…'}")
  const equivalentIndex = pro.indexOf('{equivalentText && <Text style={s.equivalent}>')
  assert.ok(primaryIndex >= 0 && equivalentIndex > primaryIndex, 'monthly equivalent must render after the billed annual total')
})

test('subscription choices appear before the Pro feature list', () => {
  const pro = source('src/screens/ProScreen.js')
  const pricingIndex = pro.indexOf("{hasPro ? 'Your subscription options' : 'Choose your plan'}")
  const featuresIndex = pro.indexOf('Included with Pro')
  const contentBeforePricing = pro.slice(pro.indexOf('return ('), pricingIndex)

  assert.ok(pricingIndex >= 0, 'pricing heading must render')
  assert.ok(featuresIndex > pricingIndex, 'pricing must render before the feature list')
  assert.doesNotMatch(contentBeforePricing, /portfolio insights|listing tools|growing flipper toolkit/, 'feature descriptions must not render before pricing')
})

test('purchase screen links SideFlip policies and the standard Apple EULA', () => {
  const pro = source('src/screens/ProScreen.js')

  assert.match(pro, /https:\/\/sideflip\.org\/privacy/)
  assert.match(pro, /https:\/\/sideflip\.org\/terms/)
  assert.match(pro, /https:\/\/www\.apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula\//)
  assert.match(pro, />Terms of Service</)
  assert.match(pro, />Apple EULA</)
  assert.match(pro, /legalLinks: \{[^\n]*flexWrap: 'wrap'/)
})

test('pricing-first App Review rescue keeps version 1.0.0 and advances only the iOS build to 19', () => {
  const app = JSON.parse(source('app.json'))
  assert.equal(app.expo.version, '1.0.0')
  assert.equal(app.expo.ios.bundleIdentifier, 'com.sideflip.app')
  assert.equal(app.expo.ios.buildNumber, '19')
})
