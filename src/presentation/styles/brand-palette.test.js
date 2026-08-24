import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stylesDirectory = resolve(process.cwd(), 'src/presentation/styles')
const tokens = readFileSync(resolve(stylesDirectory, 'tokens.css'), 'utf8')
const components = readFileSync(
  resolve(stylesDirectory, 'components.css'),
  'utf8',
)

function token(name) {
  const match = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match?.[1]) throw new Error(`Missing design token --${name}`)
  return match[1].trim()
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe('Lunumia brand palette', () => {
  it('defines the approved blue, violet and restrained cyan identity', () => {
    expect(token('brand-primary')).toBe('#1267d6')
    expect(token('brand-primary-hover')).toBe('#0f56b5')
    expect(token('brand-primary-pressed')).toBe('#0d478f')
    expect(token('brand-secondary')).toBe('#6b5cff')
    expect(token('brand-accent')).toBe('#13bff2')
    expect(token('color-brand')).toBe('var(--brand-primary)')
    expect(token('color-planned')).toBe('var(--text-planned)')
  })

  it('keeps success, warning, danger and neutral independent from brand', () => {
    expect(token('semantic-success-foreground')).toBe('#187a55')
    expect(token('semantic-warning-foreground')).toBe('#9a5b00')
    expect(token('semantic-danger-foreground')).toBe('#b93845')
    expect(token('semantic-neutral-foreground')).toBe('#64748b')
    expect(token('color-positive')).toBe('var(--semantic-success-foreground)')
  })

  it('maps financial visual states without conflating expected and received income', () => {
    expect(components).toMatch(
      /\.ln-movement-row--income-expected[^}]+var\(--color-planned\)/s,
    )
    expect(components).toMatch(
      /\.ln-movement-row--income-received[^}]+var\(--color-positive\)/s,
    )
    expect(components).toMatch(
      /\.ln-movement-row--income-cancelled[^}]+var\(--color-neutral-subtle\)/s,
    )
    expect(components).toMatch(
      /\.ln-status-label--upcoming[^}]+var\(--color-brand\)/s,
    )
    expect(components).toMatch(
      /\.ln-budget-progress progress[^}]+var\(--color-brand\)/s,
    )
    expect(components).toMatch(
      /\.ln-budget-progress progress::-webkit-progress-value[^}]+var\(--color-brand\)/s,
    )
    expect(components).toMatch(
      /\.ln-budget-row--over \.ln-budget-progress progress::-webkit-progress-value[^}]+var\(--color-danger\)/s,
    )
  })

  it('keeps normal text roles at WCAG AA contrast on their intended surfaces', () => {
    const pairs = [
      [token('text-on-brand'), token('brand-primary')],
      [token('text-link'), token('surface-default')],
      [token('text-secondary'), token('surface-default')],
      [token('text-muted'), token('surface-default')],
      [token('text-planned'), token('surface-planned')],
      [
        token('semantic-success-foreground'),
        token('semantic-success-background'),
      ],
      [
        token('semantic-warning-foreground'),
        token('semantic-warning-background'),
      ],
      [
        token('semantic-danger-foreground'),
        token('semantic-danger-background'),
      ],
    ]

    for (const [foreground, background] of pairs) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
