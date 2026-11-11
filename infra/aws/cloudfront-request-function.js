function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 1. Bloquear archivos y directorios ocultos (ej. /.git, /.env, /.svn, etc.)
    if (/^\/\..*/.test(uri)) {
        return {
            statusCode: 404,
            statusDescription: 'Not Found',
            headers: {
                'content-type': { value: 'text/plain; charset=utf-8' },
                'cache-control': { value: 'no-cache, no-store, must-revalidate' }
            },
            body: {
                encoding: 'text',
                data: '404 Not Found'
            }
        };
    }

    // 2. Bloquear endpoints inexistentes bajo /api/* o sondas como /server-info
    if (/^\/api(\/.*)?$/.test(uri) || /^\/server-info(\/.*)?$/.test(uri)) {
        return {
            statusCode: 404,
            statusDescription: 'Not Found',
            headers: {
                'content-type': { value: 'application/json' },
                'cache-control': { value: 'no-cache, no-store, must-revalidate' }
            },
            body: {
                encoding: 'text',
                data: JSON.stringify({ error: 'Not Found', status: 404 })
            }
        };
    }

    return request;
}
