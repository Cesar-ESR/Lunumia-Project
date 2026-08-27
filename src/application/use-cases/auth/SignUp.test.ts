import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthClient, AuthResult } from '@application/services/AuthClient'
import { SignUp } from './SignUp'

const verificationRedirect = 'https://app.test/verify-email'
const recoveryRedirect = 'https://app.test/reset-password'
const input = {
  email: ' PERSONA@EXAMPLE.COM ',
  password: '12345678',
  passwordConfirmation: '12345678',
}
const result: AuthResult = {
  user: { id: 'user-id', email: 'persona@example.com' },
  session: null,
  requiresEmailVerification: true,
}

describe('SignUp', () => {
  const requestPasswordReset = vi.fn<AuthClient['requestPasswordReset']>()
  const signUp = vi.fn<AuthClient['signUp']>()
  const authClient = { requestPasswordReset, signUp } as unknown as AuthClient
  const useCase = new SignUp(authClient)

  beforeEach(() => {
    vi.clearAllMocks()
    requestPasswordReset.mockResolvedValue(undefined)
    signUp.mockResolvedValue(result)
  })

  it('valida todo el formulario antes de solicitar recuperación', async () => {
    await expect(
      useCase.execute(
        {
          email: 'persona@example.com',
          password: '123',
          passwordConfirmation: 'diferente',
        },
        verificationRedirect,
        recoveryRedirect,
      ),
    ).rejects.toBeDefined()

    expect(requestPasswordReset).not.toHaveBeenCalled()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('solicita recuperación una vez antes del signup y conserva el resultado ambiguo', async () => {
    await expect(
      useCase.execute(input, verificationRedirect, recoveryRedirect),
    ).resolves.toBe(result)

    expect(requestPasswordReset).toHaveBeenCalledOnce()
    expect(requestPasswordReset).toHaveBeenCalledWith(
      'persona@example.com',
      recoveryRedirect,
    )
    expect(signUp).toHaveBeenCalledOnce()
    expect(signUp).toHaveBeenCalledWith(
      {
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      },
      verificationRedirect,
    )
    expect(requestPasswordReset.mock.invocationCallOrder[0]!).toBeLessThan(
      signUp.mock.invocationCallOrder[0]!,
    )
    expect(result).not.toHaveProperty('accountCreated')
    expect(result).not.toHaveProperty('emailExists')
  })

  it('no ejecuta signup cuando falla la recuperación', async () => {
    const error = new Error('No fue posible completar la autenticación.')
    requestPasswordReset.mockRejectedValue(error)

    await expect(
      useCase.execute(input, verificationRedirect, recoveryRedirect),
    ).rejects.toBe(error)
    expect(requestPasswordReset).toHaveBeenCalledOnce()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('propaga un fallo de signup sin repetir la recuperación', async () => {
    const error = new Error('No fue posible completar la autenticación.')
    signUp.mockRejectedValue(error)

    await expect(
      useCase.execute(input, verificationRedirect, recoveryRedirect),
    ).rejects.toBe(error)
    expect(requestPasswordReset).toHaveBeenCalledOnce()
    expect(signUp).toHaveBeenCalledOnce()
  })
})
