import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import fc from 'fast-check'

const unexpectedNetwork = vi.fn(async (input: string | URL | Request) => {
  const target = input instanceof Request ? input.url : String(input)
  throw new Error(`Unexpected real network request in test: ${target}`)
})

beforeEach(() => {
  unexpectedNetwork.mockClear()
  vi.stubGlobal('fetch', unexpectedNetwork)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const configuredFastCheckSeed = import.meta.env.VITE_FAST_CHECK_SEED
if (configuredFastCheckSeed) {
  const seed = Number(configuredFastCheckSeed)
  if (Number.isInteger(seed)) fc.configureGlobal({ seed })
}
