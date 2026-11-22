import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for lunumia-prod-landing-www-redirect CloudFront function.
//
// The source under test is `infra/aws/cloudfront-landing-www-redirect.js`.
// ---------------------------------------------------------------------------

function loadHandler(): (event: {
  request: {
    uri: string
    method: string
    querystring: Record<string, { value: string; multiValue?: Array<{ value: string }> }>
    headers: Record<string, { value: string }>
  }
}) =>
  | { uri: string }
  | {
      statusCode: number
      statusDescription: string
      headers: Record<string, { value: string }>
    } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const source = require('node:fs').readFileSync(
    `${process.cwd()}/infra/aws/cloudfront-landing-www-redirect.js`,
    'utf8',
  )
  return eval(`(function() { ${source}; return handler; })()`)
}

function makeEvent(
  uri: string,
  host: string = 'lunumia.com',
  querystring: Record<string, { value: string; multiValue?: Array<{ value: string }> }> = {},
) {
  return {
    request: {
      uri,
      method: 'GET',
      querystring,
      headers: {
        host: { value: host },
      },
    },
  }
}

describe('lunumia-prod-landing-www-redirect CloudFront function', () => {
  const handler = loadHandler()

  describe('WWW Redirection', () => {
    it('redirects www.lunumia.com root to https://lunumia.com/ with 301', () => {
      const result = handler(makeEvent('/', 'www.lunumia.com'))
      expect(result).toHaveProperty('statusCode', 301)
      expect(result).toHaveProperty('headers.location.value', 'https://lunumia.com/')
    })

    it('preserves paths and query parameters on www redirect', () => {
      const result = handler(
        makeEvent('/path-check', 'www.lunumia.com', {
          source: { value: 'github-actions' },
          ref: { value: '123' },
        }),
      )
      expect(result).toHaveProperty('statusCode', 301)
      expect(result).toHaveProperty(
        'headers.location.value',
        'https://lunumia.com/path-check?source=github-actions&ref=123',
      )
    })

    it('handles query parameters with multiValue', () => {
      const result = handler(
        makeEvent('/filter', 'www.lunumia.com', {
          tag: {
            value: 'a',
            multiValue: [{ value: 'a' }, { value: 'b' }],
          },
        }),
      )
      expect(result).toHaveProperty('statusCode', 301)
      expect(result).toHaveProperty(
        'headers.location.value',
        'https://lunumia.com/filter?tag=a&tag=b',
      )
    })
  })

  describe('Clean URL S3 OAC Rewrites for Apex Host', () => {
    it('rewrites trailing slash URIs to index.html', () => {
      const result = handler(makeEvent('/third-party-licenses/', 'lunumia.com'))
      expect(result).toHaveProperty('uri', '/third-party-licenses/index.html')
    })

    it('rewrites root / to /index.html', () => {
      const result = handler(makeEvent('/', 'lunumia.com'))
      expect(result).toHaveProperty('uri', '/index.html')
    })

    it('rewrites clean paths without extension to /index.html', () => {
      const result = handler(makeEvent('/third-party-licenses', 'lunumia.com'))
      expect(result).toHaveProperty('uri', '/third-party-licenses/index.html')
    })

    it('rewrites /terms to /terms/index.html', () => {
      const result = handler(makeEvent('/terms', 'lunumia.com'))
      expect(result).toHaveProperty('uri', '/terms/index.html')
    })

    it('does not rewrite requests for files with extensions', () => {
      for (const file of [
        '/licenses.json',
        '/favicon-32x32.png',
        '/assets/theme-D7nGu3IP.css',
        '/lunumia-logo-horizontal.png',
      ]) {
        const result = handler(makeEvent(file, 'lunumia.com'))
        expect(result).toHaveProperty('uri', file)
      }
    })
  })
})
