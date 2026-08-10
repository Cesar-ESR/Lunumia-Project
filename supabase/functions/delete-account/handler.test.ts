import { describe, expect, it, vi } from 'vitest'
import {
  createDeleteAccountHandler,
  type DeleteAccountDependencies,
} from './handler'

const origin = 'https://lunumia.example'
const userId = '10000000-0000-4000-8000-000000000001'

function dependencies(): DeleteAccountDependencies {
  return {
    allowedOrigins: [origin, 'http://localhost:5173'],
    verifyToken: vi.fn(async (token) =>
      token === 'valid-token' ? { userId } : null,
    ),
    deleteUserData: vi.fn(async () => undefined),
    deleteAuthUser: vi.fn(async () => undefined),
  }
}

function request(token?: string, body: object = {}): Request {
  const headers = new Headers({
    Origin: origin,
    'Content-Type': 'application/json',
  })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new Request('https://functions.example/delete-account', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('delete-account Edge Function', () => {
  it('rechaza solicitudes sin token', async () => {
    const deps = dependencies()
    expect((await createDeleteAccountHandler(deps)(request())).status).toBe(401)
    expect(deps.deleteUserData).not.toHaveBeenCalled()
  })

  it('rechaza tokens inválidos', async () => {
    const deps = dependencies()
    expect(
      (await createDeleteAccountHandler(deps)(request('invalid'))).status,
    ).toBe(401)
  })

  it('elimina únicamente la cuenta obtenida del token', async () => {
    const deps = dependencies()
    expect(
      (await createDeleteAccountHandler(deps)(request('valid-token'))).status,
    ).toBe(200)
    expect(deps.deleteUserData).toHaveBeenCalledWith(userId)
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(userId)
  })

  it('rechaza un userId arbitrario del body', async () => {
    const deps = dependencies()
    expect(
      (
        await createDeleteAccountHandler(deps)(
          request('valid-token', { userId: 'otro' }),
        )
      ).status,
    ).toBe(400)
    expect(deps.verifyToken).not.toHaveBeenCalled()
  })

  it('no reporta éxito cuando falla la operación administrativa', async () => {
    const deps = dependencies()
    vi.mocked(deps.deleteAuthUser).mockRejectedValue(new Error('admin failure'))
    const response = await createDeleteAccountHandler(deps)(
      request('valid-token'),
    )
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      message: 'No fue posible eliminar la cuenta.',
    })
  })

  it('rechaza orígenes no configurados', async () => {
    const deps = dependencies()
    const foreign = new Request('https://functions.example/delete-account', {
      method: 'POST',
      headers: {
        Origin: 'https://malicioso.example',
        Authorization: 'Bearer valid-token',
      },
    })
    expect((await createDeleteAccountHandler(deps)(foreign)).status).toBe(403)
  })

  it('no elimina la identidad cuando falla la eliminación de datos', async () => {
    const deps = dependencies()
    vi.mocked(deps.deleteUserData).mockRejectedValue(
      new Error('database failure'),
    )
    expect(
      (await createDeleteAccountHandler(deps)(request('valid-token'))).status,
    ).toBe(500)
    expect(deps.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('responde el preflight solo para un origen permitido', async () => {
    const deps = dependencies()
    const preflight = new Request('https://functions.example/delete-account', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    })
    const response = await createDeleteAccountHandler(deps)(preflight)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173',
    )
  })
})
