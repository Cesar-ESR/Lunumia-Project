// ---------------------------------------------------------------------------
// CloudFront Functions viewer-request handler  (Landing distribution)
//
// AWS CloudFront Functions run `cloudfront-js-2.0` (a subset of ES 5.1).
// This TypeScript source is the authoritative implementation; the sibling
// `.js` file is the compiled output that is published to AWS.
//
// Responsibilities executed **in order**:
//   1. Block hidden-file / dot-path probes       → synthetic 404
//   2. Block /api/* and /server-info probes       → synthetic 404
//   3. Rewrite clean-URL directories to index.html so S3+OAC serves
//      sub-page routes (e.g. /third-party-licenses → /third-party-licenses/index.html)
// ---------------------------------------------------------------------------

/** Minimal type for a CloudFront Functions viewer-request event. */
interface CloudFrontFunctionsEvent {
  readonly request: CloudFrontRequest
}

interface CloudFrontRequest {
  uri: string
  readonly method: string
  readonly querystring: Readonly<Record<string, { readonly value: string }>>
  readonly headers: Readonly<Record<string, { readonly value: string }>>
}

interface CloudFrontResponse {
  readonly statusCode: number
  readonly statusDescription: string
  readonly headers: Readonly<
    Record<string, { readonly value: string }>
  >
  readonly body: {
    readonly encoding: 'text'
    readonly data: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(
  event: CloudFrontFunctionsEvent,
): CloudFrontRequest | CloudFrontResponse {
  const request = event.request
  const uri = request.uri

  // ── 1. Block hidden / dot-path probes ────────────────────────────────
  if (/^\/\..*/.test(uri)) {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: {
        'content-type': { value: 'text/plain; charset=utf-8' },
        'cache-control': { value: 'no-cache, no-store, must-revalidate' },
      },
      body: {
        encoding: 'text',
        data: '404 Not Found',
      },
    }
  }

  // ── 2. Block /api/* and /server-info probes ──────────────────────────
  if (/^\/api(\/.*)?$/.test(uri) || /^\/server-info(\/.*)?$/.test(uri)) {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: {
        'content-type': { value: 'application/json' },
        'cache-control': { value: 'no-cache, no-store, must-revalidate' },
      },
      body: {
        encoding: 'text',
        data: JSON.stringify({ error: 'Not Found', status: 404 }),
      },
    }
  }

  // ── 3. Sub-directory index.html rewrite ──────────────────────────────
  // S3 with OAC does not auto-resolve index.html inside sub-folders.
  // A URI ending with `/` gets `index.html` appended.
  // A URI without an extension (no dot in the last segment) is treated
  // as a directory clean-URL and also gets `/index.html` appended.
  if (uri.endsWith('/')) {
    request.uri += 'index.html'
  } else if (!uri.includes('.')) {
    request.uri += '/index.html'
  }

  return request
}
