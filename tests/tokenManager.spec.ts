import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

import { TokenManager } from '../src/seatable/tokenManager.js'

const serverUrl = 'http://localhost'
const apiToken = 'api-token'
const baseUuid = 'base-uuid'

describe('TokenManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('exchanges and returns a base token (app-access-token)', async () => {
    const get = vi.fn().mockResolvedValue({ data: { access_token: 'base-token', expires_in: 3600 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as any)

    const tm = new TokenManager({ serverUrl, apiToken, baseUuid })
    const token = await tm.getToken()
    expect(token).toBe('base-token')
    expect(get).toHaveBeenCalled()
  })

  it('reuses cached token until expiry', async () => {
    const get = vi.fn().mockResolvedValue({ data: { access_token: 'once', expires_in: 3600 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as any)

    const tm = new TokenManager({ serverUrl, apiToken, baseUuid })
    const a = await tm.getToken()
    const b = await tm.getToken()
    expect(a).toBe('once')
    expect(b).toBe('once')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('throws a shaped error on exchange failure', async () => {
    const get = vi.fn().mockRejectedValue({ response: { status: 500 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as any)

    const tm = new TokenManager({ serverUrl, apiToken, baseUuid })
    await expect(tm.getToken()).rejects.toThrow('Failed to fetch app-access-token')
  })
})
