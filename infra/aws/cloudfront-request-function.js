// Compiled from infra/aws/cloudfront-request-function.ts — do not edit by hand.
// CloudFront Functions viewer-request handler  (Landing distribution)
//
// Responsibilities executed in order:
//   1. Block hidden-file / dot-path probes       → synthetic 404
//   2. Block /api/* and /server-info probes       → synthetic 404
//   3. Rewrite clean-URL directories to index.html so S3+OAC serves
//      sub-page routes (e.g. /third-party-licenses → /third-party-licenses/index.html)

function handler(event) {
  var request = event.request
  var uri = request.uri

  // 1. Block hidden / dot-path probes
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

  // 2. Block /api/* and /server-info probes
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

  // 3. Sub-directory index.html rewrite
  if (uri.endsWith('/')) {
    request.uri += 'index.html'
  } else if (!uri.includes('.')) {
    request.uri += '/index.html'
  }

  return request
}
