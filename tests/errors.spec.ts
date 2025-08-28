import { describe, expect, it } from 'vitest'
import type { AxiosError } from 'axios'
import { toCodedAxiosError } from '../src/errors.js'

function fakeAxiosError(status?: number): AxiosError {
  return {
    name: 'AxiosError',
    message: 'x',
    config: {},
    isAxiosError: true,
    toJSON: () => ({}),
    response: status ? { status } as any : undefined,
  } as AxiosError
}

describe('toCodedAxiosError', () => {
  it('maps 401 to ERR_AUTH_EXPIRED', () => {
    const e = toCodedAxiosError(fakeAxiosError(401), 'op')
    expect(e.code).toBe('ERR_AUTH_EXPIRED')
  })
  it('maps 408 to ERR_TIMEOUT', () => {
    const e = toCodedAxiosError(fakeAxiosError(408), 'op')
    expect(e.code).toBe('ERR_TIMEOUT')
  })
  it('maps 429 to ERR_RATE_LIMITED', () => {
    const e = toCodedAxiosError(fakeAxiosError(429), 'op')
    expect(e.code).toBe('ERR_RATE_LIMITED')
  })
  it('maps 500 to ERR_SERVER', () => {
    const e = toCodedAxiosError(fakeAxiosError(500), 'op')
    expect(e.code).toBe('ERR_SERVER')
  })
  it('maps 400 to ERR_BAD_REQUEST', () => {
    const e = toCodedAxiosError(fakeAxiosError(400), 'op')
    expect(e.code).toBe('ERR_BAD_REQUEST')
  })
})
