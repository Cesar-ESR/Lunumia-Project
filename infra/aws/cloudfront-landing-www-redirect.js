// Compiled from infra/aws/cloudfront-landing-www-redirect.ts — do not edit by hand.
// CloudFront Functions viewer-request handler
// Function: lunumia-prod-landing-www-redirect
//
// Responsibilities executed in order:
//   1. Canonical host redirection: www.lunumia.com -> https://lunumia.com (301)
//   2. Clean URL subfolder rewrite: S3 OAC index.html resolution

function buildQueryString(querystring) {
  var keys = Object.keys(querystring)
  if (keys.length === 0) {
    return ''
  }

  var parts = []
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var param = querystring[key]
    if (!param) continue

    if (param.multiValue && param.multiValue.length > 0) {
      for (var j = 0; j < param.multiValue.length; j++) {
        parts.push(
          encodeURIComponent(key) +
            '=' +
            encodeURIComponent(param.multiValue[j].value),
        )
      }
    } else if (param.value !== undefined) {
      parts.push(
        encodeURIComponent(key) + '=' + encodeURIComponent(param.value),
      )
    }
  }

  return parts.length > 0 ? '?' + parts.join('&') : ''
}

function handler(event) {
  var request = event.request
  var headers = request.headers
  var host = headers.host ? headers.host.value : ''

  // 1. Redirect www.lunumia.com to apex canonical https://lunumia.com
  if (host === 'www.lunumia.com') {
    var qs = buildQueryString(request.querystring)
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
  var uri = request.uri
  if (uri.endsWith('/')) {
    request.uri += 'index.html'
  } else if (!uri.includes('.')) {
    request.uri += '/index.html'
  }

  return request
}
