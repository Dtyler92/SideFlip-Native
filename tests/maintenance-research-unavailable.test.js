import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { transformSync } = require('@babel/core')
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function renderUnavailable() {
  const code = transformSync(source('src/components/MaintenanceResearchUnavailable.js'), {
    babelrc: false, configFile: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
  }).code
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value } }
      throw new Error(`Disabled research must not import runtime services: ${name}`)
    },
    fetch() { throw new Error('Disabled research must not make requests') },
  })
  return exports.default()
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}

test('automated research is visibly disabled, accessible, and has no event or network path', () => {
  const tree = renderUnavailable()
  const elements = nodes(tree)
  const control = elements.find(node => node.props.accessibilityRole === 'button')
  assert.ok(control, 'Coming soon control must be discoverable')
  assert.equal(control.props.disabled, true)
  assert.equal(control.props.accessibilityState.disabled, true)
  assert.match(control.props.accessibilityLabel, /Automated maintenance research.*Coming soon/)
  for (const node of elements) {
    for (const [key, value] of Object.entries(node.props)) {
      assert.ok(!/^on[A-Z]/.test(key) || typeof value !== 'function', `No callable ${key}`)
    }
  }
  assert.match(JSON.stringify(tree), /VIN decoding and manual maintenance remain available/)
  assert.match(JSON.stringify(tree), /backgroundColor.*#E5E7EB/)
})

test('My Stuff mounts only the inert research control while retaining decode and manual schedules', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /detailTab==='Maintenance'&&supportsVinDecoder\(item.itemType\)&&<MaintenanceResearchUnavailable\s*\/>/)
  assert.doesNotMatch(detail, /ManufacturerMaintenanceResearch|createManufacturerResearchClient|requestManufacturer|enqueue.*Research/)
  assert.match(detail, /<VinDecodePanel subjectType="my_stuff_item"/)
  assert.match(detail, /onPress=\{saveDefinition\} disabled=\{saving\}/)
  assert.match(detail, /openDefinitionEditor\(\)/)
  const panel = source('src/components/VinDecodePanel.js')
  assert.match(panel, /await client.decode\(/)
  assert.match(panel, /onPress=\{decode\}/)
  assert.doesNotMatch(panel, /createManufacturerResearchClient|enqueue.*Research/)
})
