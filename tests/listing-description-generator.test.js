import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDescriptionRequest,
  needsDescriptionPreview,
  normalizeListingSelection,
} from '../src/screens/listingGeneratorModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

test('listing selections support Professional, Normal, and Funny with Balanced as the default humor level', () => {
  assert.deepEqual(normalizeListingSelection('professional'), { style: 'professional', humorLevel: null })
  assert.deepEqual(normalizeListingSelection('normal'), { style: 'normal', humorLevel: null })
  assert.deepEqual(normalizeListingSelection('funny'), { style: 'funny', humorLevel: 'balanced' })
  assert.deepEqual(normalizeListingSelection('funny', 'subtle'), { style: 'funny', humorLevel: 'subtle' })
  assert.throws(() => normalizeListingSelection('auction'), /style/i)
})

test('generation requests send project identity, controlled style choices, and bounded seller context', () => {
  assert.deepEqual(createDescriptionRequest(PROJECT_ID, 'funny', 'unhinged', '', '  Runs well; scratch on left side.  '), {
    projectId: PROJECT_ID,
    style: 'funny',
    humorLevel: 'unhinged',
    sellerBrief: 'Runs well; scratch on left side.',
  })
  assert.deepEqual(createDescriptionRequest(PROJECT_ID, 'professional'), {
    projectId: PROJECT_ID,
    style: 'professional',
  })
  assert.deepEqual(createDescriptionRequest(PROJECT_ID, 'normal', null, '  Seller draft  '), {
    projectId: PROJECT_ID,
    style: 'normal',
    existingDescription: 'Seller draft',
  })
  assert.equal(createDescriptionRequest(PROJECT_ID, 'normal', null, 'x'.repeat(5000)).existingDescription.length, 4000)
  assert.equal(createDescriptionRequest(PROJECT_ID, 'normal', null, '', 'x'.repeat(3000)).sellerBrief.length, 2000)
})

test('existing editable text always requires preview while blank text can accept directly', () => {
  assert.equal(needsDescriptionPreview(''), false)
  assert.equal(needsDescriptionPreview('   \n'), false)
  assert.equal(needsDescriptionPreview('Seller wrote this already.'), true)
})

test('project listing editor exposes the requested quick style and preview flow', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  for (const label of ['Generate Description', 'Choose a style', 'Professional', 'Normal', 'Funny', 'How funny?', 'Subtle', 'Balanced', 'Unhinged', 'Writing your description...', 'Use Description', 'Regenerate', 'Cancel']) {
    assert.match(detail, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  for (const label of ['What should buyers know?', 'Briefly describe the condition', 'Continue']) assert.match(detail, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(detail, /setGeneratorStep\('brief'\)/)
  assert.match(detail, /createDescriptionRequest\(projectId, selection\.style, selection\.humorLevel, listingTextRef\.current, sellerBrief\)/)
  assert.match(detail, /createDescriptionRequest\(projectId/)
  assert.match(detail, /needsDescriptionPreview\(listingTextRef\.current\)/)
  assert.match(detail, /disabled=\{generatingListing\}/)
  assert.match(detail, /generationRequestRef/)
  assert.match(detail, /setTimeout\(\(\) => controller\.abort\(\), 25_000\)/)
  assert.match(detail, /ai_listing_regenerated/)
  assert.match(detail, /ai_listing_accepted/)
  assert.equal((detail.match(/<Modal\b/g) || []).length, 2, 'listing generation must remain inside one listing Modal')
  assert.match(detail, /keyboardShouldPersistTaps="handled"/)
  assert.match(detail, /onChangeText=\{handleListingTextChange\}/)
  assert.match(detail, /generatedPreviewSelection/)
  assert.match(detail, /const hadExistingDescription = needsDescriptionPreview\(listingTextRef\.current\)/)
  assert.match(detail, /setGeneratedPreviewSelection\(\{ \.\.\.selection, hadExistingDescription \}\)/)
  assert.match(detail, /had_existing_description: generatedPreviewSelection\?\.hadExistingDescription \?\? true/)
  assert.match(detail, /accessibilityState=\{\{ selected:/)
  assert.match(detail, /accessibilityLabel="Generated description preview"/)
  assert.match(detail, /<FocusAwareScrollView style=\{s\.generatorCard\}/)
  assert.match(detail, /accessibilityElementsHidden=\{generatorStep !== null\}/)
  assert.match(detail, /importantForAccessibility=\{generatorStep !== null \? 'no-hide-descendants' : 'auto'\}/)
  assert.match(detail, /accessibilityViewIsModal importantForAccessibility="yes"/)
  assert.match(detail, /generatorCard:\{[^\n]*maxHeight:'85%'/)
})

test('listing analytics allow controlled style fields without listing text or project identity', () => {
  const analytics = source('src/lib/analyticsModel.js')
  assert.match(analytics, /'listing_style'/)
  assert.match(analytics, /'humor_level'/)
  assert.match(analytics, /'had_existing_description'/)
  assert.doesNotMatch(analytics, /'listing_text'|'project_id'/)
})
