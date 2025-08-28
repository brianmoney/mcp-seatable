import { describe, expect, it, beforeAll, vi } from 'vitest'

beforeAll(() => {
    process.env.SEATABLE_SERVER_URL = 'http://localhost'
    process.env.SEATABLE_API_TOKEN = 'test-token'
    process.env.SEATABLE_BASE_UUID = 'test-base'
})

import { SeaTableClient } from '../src/seatable/client'

// Basic shape tests for the client. These are lightweight and do not hit a real API.
describe('SeaTableClient', () => {
    it('constructs', () => {
        const client = new SeaTableClient()
        expect(client).toBeTruthy()
    })

    it('uses a Base-Token (Bearer) for all surfaces', async () => {
        const { TokenManager } = await import('../src/seatable/tokenManager')
        const spy = vi.spyOn(TokenManager.prototype as any, 'getToken').mockResolvedValue('base-token')

        const client = new SeaTableClient() as any
        const mkErr = async (p: Promise<any>) => p.catch((e: any) => e)
        const e1 = await mkErr(client.http.get('/metadata'))
        const e2 = await mkErr(client.gatewayHttp.get('/tables/'))
        const e3 = await mkErr(client.externalHttp.get('/metadata'))
        expect(spy).toHaveBeenCalled()
        expect(e1?.config?.headers?.Authorization).toBe('Bearer base-token')
        expect(e2?.config?.headers?.Authorization).toBe('Bearer base-token')
        expect(e3?.config?.headers?.Authorization).toBe('Bearer base-token')
    })
})
