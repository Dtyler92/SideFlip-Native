import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function readRgbaPng(relative) {
  const png = readFileSync(new URL(`../${relative}`, import.meta.url))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  const idat = []
  let width
  let height
  let colorType
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString()
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.equal(data[8], 8, 'icon must use 8-bit channels')
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  assert.equal(colorType, 6, 'adaptive foreground must be RGBA')
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const encoded = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0, input = 0; y < height; y += 1) {
    const filter = encoded[input++]
    const row = y * stride
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[input++]
      const left = x >= bytesPerPixel ? pixels[row + x - bytesPerPixel] : 0
      const up = y > 0 ? pixels[row + x - stride] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[row + x - stride - bytesPerPixel] : 0
      if (filter === 0) pixels[row + x] = raw
      else if (filter === 1) pixels[row + x] = (raw + left) & 255
      else if (filter === 2) pixels[row + x] = (raw + up) & 255
      else if (filter === 3) pixels[row + x] = (raw + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const estimate = left + up - upperLeft
        const pa = Math.abs(estimate - left)
        const pb = Math.abs(estimate - up)
        const pc = Math.abs(estimate - upperLeft)
        pixels[row + x] = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255
      } else throw new Error(`Unsupported PNG filter ${filter}`)
    }
  }
  return { width, height, pixels }
}

test('project photos open an accessible zoomable viewer without replacing remove behavior', () => {
  const picker = source('src/components/MultiPhotoPicker.js')
  const viewer = source('src/components/PhotoViewer.js')
  assert.match(picker, /<PhotoViewer/)
  assert.match(picker, /setViewedPhoto\(url\)/)
  assert.match(picker, /accessibilityLabel=\{`View photo \$\{i \+ 1\}`\}/)
  assert.match(picker, /accessibilityLabel=\{`Remove photo \$\{i \+ 1\}`\}/)
  assert.match(viewer, /PanResponder\.create/)
  assert.match(viewer, /touches\.length >= 2/)
  assert.match(viewer, /accessibilityLabel="Close photo viewer"/)
  assert.match(viewer, /onRequestClose=\{onClose\}/)
})

test('adaptive Android foreground is centered, transparent, and inside the 66 percent safe zone', () => {
  const { width, height, pixels } = readRgbaPng('assets/adaptive-icon.png')
  assert.deepEqual([width, height], [1024, 1024])
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (pixels[(y * width + x) * 4 + 3] === 0) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  assert.ok(maxX >= 0, 'foreground mark must not be empty')
  assert.ok(maxX - minX + 1 <= 676)
  assert.ok(maxY - minY + 1 <= 676)
  assert.ok(Math.abs((minX + maxX) / 2 - (width - 1) / 2) <= 1)
  assert.ok(Math.abs((minY + maxY) / 2 - (height - 1) / 2) <= 1)
  assert.equal(pixels[3], 0, 'foreground canvas corners must stay transparent')
})

test('native forms share focus-aware keyboard scrolling', () => {
  const helper = source('src/components/FocusAwareScrollView.js')
  assert.match(helper, /scrollResponderScrollNativeHandleToKeyboard/)
  assert.match(helper, /keyboardDidShow/)
  assert.match(helper, /keyboardWillShow/)
  for (const screen of [
    'MyStuffCreateScreen.js',
    'MyStuffDetailScreen.js',
    'ProjectDetailScreen.js',
    'NewProjectScreen.js',
    'SellProjectScreen.js',
    'AnalyzeScreen.js',
    'LoginScreen.js',
    'SignUpScreen.js',
    'OnboardingScreen.js',
  ]) {
    assert.match(source(`src/screens/${screen}`), /FocusAwareScrollView/,
      `${screen} must use shared focus-aware scrolling`)
  }
})
