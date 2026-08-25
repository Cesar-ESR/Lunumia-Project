import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const bytes = (path) => readFileSync(join(root, path))
const sha256 = (path) => createHash('sha256').update(bytes(path)).digest('hex')

const pngDimensions = (path) => {
  const data = bytes(path)
  expect(data.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

const readPngPixels = (path) => {
  const data = bytes(path)
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  const bitDepth = data[24]
  const colorType = data[25]
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  expect(bitDepth).toBe(8)
  expect(channels).toBeGreaterThan(0)
  expect(data[28]).toBe(0)

  const idat = []
  let offset = 8
  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      idat.push(data.subarray(offset + 8, offset + 8 + length))
    }
    offset += length + 12
  }

  const compressed = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  let inputOffset = 0
  for (let row = 0; row < height; row += 1) {
    const filter = compressed[inputOffset]
    inputOffset += 1
    const rowOffset = row * stride
    for (let column = 0; column < stride; column += 1) {
      const raw = compressed[inputOffset + column]
      const left =
        column >= channels ? pixels[rowOffset + column - channels] : 0
      const above = row > 0 ? pixels[rowOffset - stride + column] : 0
      const upperLeft =
        row > 0 && column >= channels
          ? pixels[rowOffset - stride + column - channels]
          : 0
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, upperLeft)
      pixels[rowOffset + column] = (raw + predictor) & 0xff
    }
    inputOffset += stride
  }

  return {
    width,
    height,
    channels,
    pixel(x, y) {
      const start = (y * width + x) * channels
      return [...pixels.subarray(start, start + channels)]
    },
    pixels,
  }
}

const identityStats = (image) => {
  const stats = {
    dark: 0,
    cyan: 0,
    blue: 0,
    violet: 0,
    magenta: 0,
    colors: new Set(),
  }
  for (let offset = 0; offset < image.pixels.length; offset += image.channels) {
    const red = image.pixels[offset]
    const green = image.pixels[offset + 1]
    const blue = image.pixels[offset + 2]
    const alpha = image.channels === 4 ? image.pixels[offset + 3] : 255
    if (alpha === 0) continue
    stats.colors.add(`${red},${green},${blue}`)
    stats.dark += Math.max(red, green, blue) < 75
    stats.cyan += green > 145 && blue > 160 && red < 95
    stats.blue += blue > 145 && green > 40 && green < 175 && red < 95
    stats.violet += blue > 135 && red > 65 && red > green * 1.05
    stats.magenta += red > 140 && blue > 140 && green < 105
  }
  return stats
}

const expectOfficialIdentity = (path, minimum = 20) => {
  const stats = identityStats(readPngPixels(path))
  expect(stats.dark, `${path}: dark navy`).toBeGreaterThan(minimum)
  expect(stats.cyan, `${path}: cyan`).toBeGreaterThan(0)
  expect(stats.blue, `${path}: electric blue`).toBeGreaterThan(0)
  expect(stats.violet, `${path}: violet`).toBeGreaterThan(0)
  expect(stats.magenta, `${path}: magenta`).toBeGreaterThan(0)
  expect(stats.colors.size, `${path}: multitone`).toBeGreaterThan(minimum)
}

describe('Lunumia official multicolor brand assets', () => {
  it('preserva intactos los originales oficiales y separa masters de derivados', () => {
    expect(sha256('brand/originals/lunumia-icon-approved-final.png')).toBe(
      'f8ef9a047cfaf82eb3d9e54e78436322b03c4536dc13c15e6a438f0f2abf737a',
    )
    expect(sha256('brand/originals/lunumia-icon-original.png')).toBe(
      '5d6256544ee7030399caaed9c40da9f6c137852f4448458d6eb695ebe0871a05',
    )
    expect(sha256('brand/originals/lunumia-maskable-original.png')).toBe(
      'cd934778d3a9b5684e01bf1d556e455172cea378e6f7997a9eae66c6c4f87e73',
    )
    expect(sha256('brand/originals/lunumia-logo-horizontal-original.png')).toBe(
      '2e377c2b49b01d6dfcaea1c0258f60e6b15548b4a100ae83166c6da46dfd4273',
    )
    expect(
      pngDimensions('brand/originals/lunumia-icon-approved-final.png'),
    ).toEqual([1254, 1254])
    expect(
      pngDimensions('brand/originals/lunumia-logo-horizontal-original.png'),
    ).toEqual([1254, 1254])
    expect(sha256('brand/lunumia-symbol-1024x1024.png')).toBe(
      sha256('brand/originals/lunumia-icon-approved-final.png'),
    )
    expect(sha256('brand/lunumia-maskable-1024x1024.png')).toBe(
      sha256('brand/originals/lunumia-maskable-original.png'),
    )
  })

  it('impide que el pipeline vuelva a forzar monocromo o azul de interfaz', () => {
    const generator = read('scripts/generate-brand-assets.py')
    expect(generator).toContain('has_official_identity')
    expect(generator).toContain('lunumia-icon-approved-final.png')
    expect(generator).not.toContain('#1267D6')
    expect(generator).not.toContain('PRIMARY_HEX')
    expect(generator).not.toContain('recolored_symbol')
    expect(generator).not.toContain('WHITE_RGBA')
    expect(generator).not.toContain('HORIZONTAL_')
    expect(generator).not.toContain('write_android_splashes')
  })

  it('preserva alpha normal y exige superficies opacas en maskable y Apple', () => {
    for (const path of [
      'brand/lunumia-symbol-1024x1024.png',
      'public/favicon-16x16.png',
      'public/favicon-32x32.png',
      'public/icons/pwa-192x192.png',
      'public/icons/pwa-512x512.png',
    ]) {
      const image = readPngPixels(path)
      expect(image.channels, path).toBe(4)
      expect(image.pixel(0, 0)[3], path).toBe(0)
      let hasOpaquePixel = false
      for (let offset = 3; offset < image.pixels.length; offset += 4) {
        hasOpaquePixel ||= image.pixels[offset] === 255
      }
      expect(hasOpaquePixel, path).toBe(true)
    }

    for (const path of [
      'public/icons/pwa-maskable-512x512.png',
      'public/apple-touch-icon.png',
      'landing/public/apple-touch-icon.png',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    ]) {
      const image = readPngPixels(path)
      expect(image.pixel(0, 0)[3] ?? 255, path).toBe(255)
      if (image.channels === 4) {
        let fullyOpaque = true
        for (let offset = 3; offset < image.pixels.length; offset += 4) {
          fullyOpaque &&= image.pixels[offset] === 255
        }
        expect(fullyOpaque, path).toBe(true)
      }
    }
  })

  it.each([
    ['brand/lunumia-symbol-1024x1024.png', 100],
    ['public/favicon-16x16.png', 2],
    ['public/favicon-32x32.png', 8],
    ['public/icons/pwa-192x192.png', 100],
    ['public/icons/pwa-512x512.png', 100],
    ['public/apple-touch-icon.png', 100],
    ['landing/public/apple-touch-icon.png', 100],
    ['public/icons/pwa-maskable-512x512.png', 100],
    ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 100],
    ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 100],
  ])('conserva navy, cyan, azul, violeta y magenta en %s', (path, minimum) => {
    expectOfficialIdentity(path, minimum)
  })

  it('mantiene la composición maskable dentro de la zona central segura', () => {
    const image = readPngPixels('public/icons/pwa-maskable-512x512.png')
    let minX = image.width
    let maxX = 0
    let minY = image.height
    let maxY = 0
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const [red, green, blue] = image.pixel(x, y)
        if (
          Math.max(red, green, blue) > 185 &&
          Math.min(red, green, blue) < 105
        ) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
    }
    expect(minX).toBeGreaterThanOrEqual(512 * 0.14)
    expect(maxX).toBeLessThanOrEqual(512 * 0.86)
    expect(minY).toBeGreaterThanOrEqual(512 * 0.14)
    expect(maxY).toBeLessThanOrEqual(512 * 0.86)
  })

  it('declara favicons PNG y Apple touch sin SVG/default Vite activos', () => {
    for (const htmlPath of ['index.html', 'landing/index.html']) {
      const html = read(htmlPath)
      expect(html).toContain('href="/favicon-32x32.png"')
      expect(html).toContain('href="/favicon-16x16.png"')
      expect(html).toContain('href="/apple-touch-icon.png"')
      expect(html).not.toContain('/favicon.svg')
      expect(html).not.toMatch(/vite\.svg|React App|GastoClaro/)
    }
    expect(existsSync(join(root, 'public/favicon.svg'))).toBe(false)
    expect(existsSync(join(root, 'landing/public/favicon.svg'))).toBe(false)
    expect(read('index.html').match(/apple-touch-icon\.png/g)).toHaveLength(1)
  })

  it('declara iconos PWA estándar y maskable con sus propósitos correctos', () => {
    const config = read('vite.config.ts')
    expect(config).toContain("name: 'Lunumia'")
    expect(config).toContain("theme_color: '#1267d6'")
    expect(config).toContain("src: '/icons/pwa-192x192.png'")
    expect(config).toContain("src: '/icons/pwa-512x512.png'")
    expect(config).toContain("src: '/icons/pwa-maskable-512x512.png'")
    expect(config).toMatch(/pwa-192x192\.png'[\s\S]+purpose: 'any'/)
    expect(config).toMatch(/pwa-512x512\.png'[\s\S]+purpose: 'any'/)
    expect(config).toMatch(
      /pwa-maskable-512x512\.png'[\s\S]+purpose: 'maskable'/,
    )
  })

  it.each([
    ['public/favicon-16x16.png', 16, 16],
    ['public/favicon-32x32.png', 32, 32],
    ['public/apple-touch-icon.png', 180, 180],
    ['public/icons/pwa-192x192.png', 192, 192],
    ['public/icons/pwa-512x512.png', 512, 512],
    ['public/icons/pwa-maskable-512x512.png', 512, 512],
    ['landing/public/favicon-16x16.png', 16, 16],
    ['landing/public/favicon-32x32.png', 32, 32],
    ['landing/public/apple-touch-icon.png', 180, 180],
    ['landing/public/lunumia-logo-horizontal.png', 1208, 458],
  ])('verifica dimensiones reales de %s', (path, width, height) => {
    expect(pngDimensions(path)).toEqual([width, height])
  })

  it('usa el logo horizontal multicolor autocontenido en la landing', () => {
    const html = read('landing/index.html')
    expect(html.match(/src="\/lunumia-logo-horizontal\.png"/g)).toHaveLength(2)
    expect(html.match(/alt="Lunumia"/g)).toHaveLength(2)
    expectOfficialIdentity('landing/public/lunumia-logo-horizontal.png', 100)
    expect(read('brand/lunumia-logo-horizontal.svg')).toContain(
      'lunumia-logo-horizontal-multicolor.png',
    )
  })

  it.each([
    ['mdpi', 48, 108],
    ['hdpi', 72, 162],
    ['xhdpi', 96, 216],
    ['xxhdpi', 144, 324],
    ['xxxhdpi', 192, 432],
  ])('verifica launchers Android %s', (density, legacySize, foregroundSize) => {
    const directory = `android/app/src/main/res/mipmap-${density}`
    expect(pngDimensions(`${directory}/ic_launcher.png`)).toEqual([
      legacySize,
      legacySize,
    ])
    expect(pngDimensions(`${directory}/ic_launcher_round.png`)).toEqual([
      legacySize,
      legacySize,
    ])
    expect(pngDimensions(`${directory}/ic_launcher_foreground.png`)).toEqual([
      foregroundSize,
      foregroundSize,
    ])
  })

  it('preserva iconos adaptativos, navy muestreado y package ID histórico', () => {
    const adaptiveIcon = read(
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    )
    const background = read(
      'android/app/src/main/res/values/ic_launcher_background.xml',
    )
    const strings = read('android/app/src/main/res/values/strings.xml')
    const capacitor = read('capacitor.config.ts')
    expect(adaptiveIcon).toContain('@color/ic_launcher_background')
    expect(adaptiveIcon).toContain('@mipmap/ic_launcher_foreground')
    expect(background).toContain('#011B6E')
    expect(background).not.toContain('#1267D6')
    expect(strings).toContain('<string name="app_name">Lunumia</string>')
    expect(strings).toContain('com.gastoclaro.app')
    expect(capacitor).toContain("appId: 'com.gastoclaro.app'")
    expect(capacitor).toContain("appName: 'Lunumia'")
    expect(
      existsSync(
        join(
          root,
          'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml',
        ),
      ),
    ).toBe(false)
  })
})
