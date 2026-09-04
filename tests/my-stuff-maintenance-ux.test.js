import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('private PDF report is compact and expandable', () => {
  const panel = source('src/components/ReportPanel.js')
  assert.match(panel, /const \[expanded, setExpanded\] = useState\(false\)/)
  assert.match(panel, /accessibilityState=\{\{ expanded \}\}/)
  assert.match(panel, /expanded \? 'Hide PDF options' : 'Show PDF options'/)
  assert.match(panel, /\{expanded && <>/)
})

test('My Stuff integrates usage updates with maintenance and removes the standalone usage section', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.doesNotMatch(detail, />Usage readings</)
  assert.doesNotMatch(detail, /No appended usage readings yet/)
  assert.match(detail, />Maintenance schedules</)
  assert.match(detail, /Update current usage/)
  assert.match(detail, /Save Current Usage/)
  assert.match(detail, /recordMyStuffReadingV2/)
  assert.match(detail, /refresh:\(\)=>load\(\{quiet:true,throwOnError:true\}\)/)

  const maintenance = detail.indexOf('>Maintenance schedules<')
  const report = detail.indexOf('<ReportPanel', maintenance)
  const history = detail.indexOf('>Service history<', maintenance)
  assert.ok(maintenance >= 0 && report > maintenance && history > report)
})

test('maintenance completion captures active usage, rolls due state through refresh, and celebrates success', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /for\(const axis of definitionUsageAxes\(value\)\)nextReadings\[axis\]=item\.currentUsage\[axis\]/)
  assert.match(detail, /buildRecordServiceOccurrenceV2WirePayload/)
  assert.match(detail, /setCompletionCelebration\(/)
  assert.match(detail, />Good Job!</)
  assert.match(detail, /accessibilityLabel="Close maintenance success"/)
  assert.match(detail, /setCompletionCelebration\(null\)/)
})
