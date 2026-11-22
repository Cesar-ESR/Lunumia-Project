// ---------------------------------------------------------------------------
// CloudFront Functions viewer-request handler
// Function: lunumia-prod-landing-www-redirect
//
// AWS CloudFront Functions run `cloudfront-js-2.0` (ES 5.1 subset).
// This TypeScript source is the authoritative implementation; the sibling
// `.js` file is the compiled output for AWS CloudFront.
//
// Responsibilities executed in order:
//   1. Canonical host redirection:
//      Redirect requests from `www.lunumia.com` to `https://lunumia.com` (HTTP 301)
//      preserving the exact path and query string.
//   2. Clean URL subfolder rewrite:
//      For requests on `lunumia.com`, rewrite directory paths to append `index.html`
//      so that Amazon S3 (with private OAC) correctly resolves subfolder index pages
//      (e.g., `/third-party-licenses/` -> `/third-party-licenses/index.html`
//       and `/third-party-licenses` -> `/third-party-licenses/index.html`).
// ---------------------------------------------------------------------------

interface CloudFrontFunctionsEvent {
  readonly request: CloudFrontRequest
}

interface CloudFrontQueryParam {
  readonly value: string
  readonly multiValue?: ReadonlyArray<{ readonly value: string }>
}

interface CloudFrontRequest {
  uri: string
  readonly method: string
  readonly querystring: Readonly<Record<string, CloudFrontQueryParam>>
  readonly headers: Readonly<
    Record<string, { readonly value: string; readonly multiValue?: ReadonlyArray<{ readonly value: string }> }>
  >
}

interface CloudFrontResponse {
  readonly statusCode: number
  readonly statusDescription: string
  readonly headers: Readonly<
    Record<string, { readonly value: string }>
  >
}

function buildQueryString(
  querystring: Readonly<Record<string, CloudFrontQueryParam>>,
): string {
  const keys = Object.keys(querystring)
  if (keys.length === 0) {
    return ''
  }

  const parts: string[] = []
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const param = querystring[key]
    if (!param) continue

    if (param.multiValue && param.multiValue.length > 0) {
      for (let j = 0; j < param.multiValue.length; j++) {
        const item = param.multiValue[j]
        if (item) {
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.value))
        }
      }
    } else if (param.value !== undefined) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(param.value))
    }
  }

  return parts.length > 0 ? '?' + parts.join('&') : ''
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(
  event: CloudFrontFunctionsEvent,
): CloudFrontRequest | CloudFrontResponse {
  const request = event.request
  const headers = request.headers
  const host = headers.host ? headers.host.value : ''

  // 1. Redirect www.lunumia.com to apex canonical https://lunumia.com
  if (host === 'www.lunumia.com') {
    const qs = buildQueryString(request.querystring)
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://lunumia.com' + request.uri + qs },
        'cache-control': { value: 'public, max-age=86400' },
      },
    }
  }

  // 2. Rewrite directory clean-URLs to index.html for S3 OAC resolution
  const uri = request.uri
  if (uri.endsWith('/')) {
    request.uri += 'index.html'
  } else if (!uri.includes('.')) {
    request.uri += '/index.html'
  }

  return request
}
