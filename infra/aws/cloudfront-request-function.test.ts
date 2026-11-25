import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for the CloudFront Functions viewer-request handler.
//
// The source under test is `infra/aws/cloudfront-request-function.js`.
// We load it via a small eval-based harness because CloudFront Functions
// export a bare `function handler(event)` without ESM/CJS wrappers.
// ---------------------------------------------------------------------------

function loadHandler(): (event: {
  request: { uri: string; method: string; querystring: object; headers: object }
}) =>
  | { uri: string }
  | {
      statusCode: number
      statusDescription: string
      headers: Record<string, { value: string }>
      body: { encoding: string; data: string }
    } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const source = require('node:fs').readFileSync(
    `${process.cwd()}/infra/aws/cloudfront-request-function.js`,
    'utf8',
  )
  // Wrap in an IIFE that returns the handler so we can call it.
  return eval(`(function() { ${source}; return handler; })()`)
}

function makeEvent(uri: string) {
  return {
    request: {
      uri,
      method: 'GET',
      querystring: {},
      headers: {},
    },
  }
}

describe('CloudFront viewer-request function', () => {
  const handler = loadHandler()

  // ── Security blocks ────────────────────────────────────────────────

  it('blocks dot-path probes with 404', () => {
    for (const uri of ['/.env', '/.git/config', '/.svn/entries']) {
      const result = handler(makeEvent(uri))
      expect(result).toHaveProperty('statusCode', 404)
    }
  })

  it('blocks /api and /server-info probes with 404', () => {
    for (const uri of [
      '/api',
      '/api/',
      '/api/v1/users',
      '/server-info',
      '/server-info/',
    ]) {
      const result = handler(makeEvent(uri))
      expect(result).toHaveProperty('statusCode', 404)
    }
  })

  // ── Index.html rewrites ────────────────────────────────────────────

  it('rewrites trailing-slash URIs to index.html', () => {
    const result = handler(makeEvent('/third-party-licenses/'))
    expect(result).toHaveProperty('uri', '/third-party-licenses/index.html')
  })

  it('rewrites root / to /index.html', () => {
    const result = handler(makeEvent('/'))
    expect(result).toHaveProperty('uri', '/index.html')
  })

  it('rewrites clean-URL paths without extension to /index.html', () => {
    const result = handler(makeEvent('/third-party-licenses'))
    expect(result).toHaveProperty('uri', '/third-party-licenses/index.html')
  })

  it('rewrites /terms to /terms/index.html', () => {
    const result = handler(makeEvent('/terms'))
    expect(result).toHaveProperty('uri', '/terms/index.html')
  })

  // ── Passthrough ────────────────────────────────────────────────────

  it('does not rewrite URIs with a file extension', () => {
    for (const uri of [
      '/licenses.json',
      '/favicon-32x32.png',
      '/assets/theme-D7nGu3IP.css',
      '/assets/main-CTDFH_cv.js',
      '/lunumia-logo-horizontal.png',
    ]) {
      const result = handler(makeEvent(uri))
      expect(result).toHaveProperty('uri', uri)
    }
  })
})
