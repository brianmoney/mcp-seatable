import { describe, expect, it, beforeAll } from 'vitest'

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
})
