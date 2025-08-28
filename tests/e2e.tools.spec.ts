import { beforeAll, describe, expect, it } from 'vitest'

import { MockSeaTableClient } from '../src/seatable/mockClient.js'
import { registerAppendRows } from '../src/mcp/tools/appendRows.js'
import { registerListRows } from '../src/mcp/tools/listRows.js'
import { registerUpdateRows } from '../src/mcp/tools/updateRow.js'
import { registerDeleteRows } from '../src/mcp/tools/deleteRow.js'
import { getEnv } from '../src/config/env.js'

beforeAll(() => {
  process.env.SEATABLE_SERVER_URL = 'http://localhost'
  process.env.SEATABLE_API_TOKEN = 'test-token'
  process.env.SEATABLE_BASE_UUID = 'test-base'
})

type ToolHandler = (args: unknown) => Promise<any>

describe('E2E Tools with mock', () => {
  it('append_rows then list_rows then update_rows and delete_rows', async () => {
    const tools = new Map<string, ToolHandler>()
    const fakeServer = {
      registerTool: (_id: string, _def: any, handler: ToolHandler) => {
        tools.set(_id, handler)
      },
    } as any

    const client = new MockSeaTableClient() as any
    const env = getEnv()

    registerAppendRows(fakeServer, { client, env })
    registerListRows(fakeServer, { client, env })
    registerUpdateRows(fakeServer, { client, env })
    registerDeleteRows(fakeServer, { client, env })

    const table = 'Table1'

    // append_rows (allow creating columns Title)
    let res = await tools.get('append_rows')!({ table, rows: [{ Title: 'A' }, { Title: 'B' }], allow_create_columns: true })
    const appended = JSON.parse(res.content[0].text)
    expect(appended.rows.length).toBe(2)

    // list_rows
    res = await tools.get('list_rows')!({ table, page: 1, page_size: 10 })
    const listed = JSON.parse(res.content[0].text)
    expect(listed.rows.length).toBeGreaterThanOrEqual(2)

    const firstId = listed.rows[0]._id

    // update_rows (allow creating column Done)
    res = await tools.get('update_rows')!({ table, updates: [{ row_id: firstId, values: { Done: true } }], allow_create_columns: true })
    const updated = JSON.parse(res.content[0].text)
    expect(updated.rows[0].Done).toBe(true)

    // delete_rows
    res = await tools.get('delete_rows')!({ table, row_ids: [firstId] })
    const deleted = JSON.parse(res.content[0].text)
    expect(deleted.results[0].success).toBe(true)
  })
})
