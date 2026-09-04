import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateVinCheckDigit,
  isVinCheckDigitApplicable,
  maskVin,
  mergeDecodedSuggestions,
  normalizeVin,
  validateVin,
} from '../src/domain/myStuff/vinModel.js'

test('VIN normalization uppercases and removes spaces and hyphens only', () => {
  assert.equal(normalizeVin(' 1hg-cm826 33a004352 '), '1HGCM82633A004352')
  assert.equal(normalizeVin('abc_def'), 'ABC_DEF')
})

test('standard North American VIN validates forbidden letters and check digit', () => {
  assert.equal(calculateVinCheckDigit('1HGCM82633A004352'), '3')
  assert.deepEqual(validateVin('1HGCM82633A004352'), {
    normalized: '1HGCM82633A004352', kind: 'standard', valid: true, canDecode: true,
    checkDigitApplicable: true, checkDigitValid: true, reason: null,
  })
  assert.equal(validateVin('1HGCM82643A004352').valid, false)
  assert.match(validateVin('1HGCM82I33A004352').reason, /I, O, or Q/)
})

test('US-market context enforces check digits for foreign-built VINs', () => {
  const validJapaneseVin = 'JH4KA8268MC000000'
  const invalidJapaneseVin = 'JH4KA8261MC000000'
  assert.equal(calculateVinCheckDigit(validJapaneseVin), '8')
  assert.equal(isVinCheckDigitApplicable(validJapaneseVin), false)
  assert.equal(isVinCheckDigitApplicable(validJapaneseVin, { market: 'US' }), true)
  assert.equal(validateVin(invalidJapaneseVin).valid, true)
  assert.deepEqual(validateVin(invalidJapaneseVin, { market: 'US' }), {
    normalized: invalidJapaneseVin, kind: 'standard', valid: false, canDecode: false,
    checkDigitApplicable: true, checkDigitValid: false, reason: 'VIN check digit does not match.',
  })
  assert.equal(validateVin(invalidJapaneseVin, { decoder: { checkDigitApplicable: true } }).valid, false)
})

test('older and nonstandard identifiers remain valid for manual entry but bypass decode', () => {
  const result = validateVin('abc-12345')
  assert.equal(result.normalized, 'ABC12345')
  assert.equal(result.kind, 'manual')
  assert.equal(result.valid, true)
  assert.equal(result.canDecode, false)
  assert.match(result.reason, /manual entry/)
  assert.equal(validateVin('').valid, false)
})

test('masking does not expose all of a private identifier', () => {
  assert.equal(maskVin('1HGCM82633A004352'), '•••••••••••••4352')
  assert.equal(maskVin('ABC12'), '•BC12')
  assert.equal(maskVin('A'), '•')
  assert.equal(maskVin(''), '')
})

test('decoded suggestions fill blanks but never overwrite or silently resolve conflicts', () => {
  const existing = { year: 2003, make: 'Honda', model: '', trim: 'EX', notes: 'mine' }
  const decoded = { year: '2003', make: 'HONDA', model: 'Accord', trim: 'LX', engine: '2.4L', ignored: 'nope' }
  const merged = mergeDecodedSuggestions(existing, decoded)
  assert.deepEqual(merged.values, { year: 2003, make: 'Honda', model: 'Accord', trim: 'EX', notes: 'mine', engine: '2.4L' })
  assert.equal(merged.fields.year.status, 'verified')
  assert.equal(merged.fields.make.status, 'verified')
  assert.equal(merged.fields.model.status, 'suggested')
  assert.equal(merged.fields.trim.status, 'conflicting')
  assert.deepEqual(merged.fields.trim, { status: 'conflicting', existing: 'EX', suggestion: 'LX' })
  assert.equal('ignored' in merged.values, false)
})

test('decoded merge deeply isolates nested existing and decoded values', () => {
  const existing = { notes: { private: ['keep'] }, model: '' }
  const decoded = { model: { label: 'Accord', metadata: { source: ['decoder'] } } }
  const merged = mergeDecodedSuggestions(existing, decoded)

  merged.values.notes.private.push('changed')
  merged.values.model.metadata.source.push('changed')
  merged.fields.model.suggestion.metadata.source.push('field changed')

  assert.deepEqual(existing, { notes: { private: ['keep'] }, model: '' })
  assert.deepEqual(decoded, { model: { label: 'Accord', metadata: { source: ['decoder'] } } })
  assert.notStrictEqual(merged.values.model, merged.fields.model.suggestion)
})
