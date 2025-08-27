import { describe, expect, it, beforeAll } from 'vitest'
import { buildServer } from '../src/mcp/server'

beforeAll(() => {
    process.env.SEATABLE_SERVER_URL = 'http://localhost'
    process.env.SEATABLE_API_TOKEN = 'test-token'
    process.env.SEATABLE_BASE_UUID = 'test-base'
})

describe('MCP Tools registration', () => {
    it('buildServer returns a server', () => {
        const srv = buildServer()
        expect(srv).toBeTruthy()
    })
})
