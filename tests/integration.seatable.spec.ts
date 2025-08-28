import { beforeAll, describe, expect, it } from 'vitest'

import { getEnv } from '../src/config/env.js'
import { registerAppendRows } from '../src/mcp/tools/appendRows.js'
import { registerDeleteRows } from '../src/mcp/tools/deleteRow.js'
import { registerGetRow } from '../src/mcp/tools/getRow.js'
import { registerListRows } from '../src/mcp/tools/listRows.js'
import { registerManageTables } from '../src/mcp/tools/manageTables.js'

const runIntegration = process.env.SEATABLE_IT === 'true'
const d = runIntegration ? describe : describe.skip

beforeAll(() => {
  // Expect .env to be populated by user
})

type ToolHandler = (args: unknown) => Promise<any>

d('SeaTable Integration (real API)', () => {
  it('create table, append/list/update/get/delete rows, then delete table', async () => {
    const tools = new Map<string, ToolHandler>()
    const fakeServer = {
      registerTool: (id: string, _def: any, handler: ToolHandler) => tools.set(id, handler),
    } as any

    const env = getEnv()

    // Register tools using the real client in server.ts by passing through registrars here.
    // We don't build the real McpServer to avoid stdio transport.
    // Each registrar expects { client, env } which server.ts would normally construct.
    // To reuse client construction, we import server builder dependencies here is complex, so
    // we rely on registrars calling client via closures created in server.ts. Instead, we will
    // directly import client-less registrars is fine because registrars receive a client from us.
    // We emulate server.ts client construction by new'ing the client-specific class here.
    const { SeaTableClient } = await import('../src/seatable/client.js')
    const client = new SeaTableClient()

    registerManageTables(fakeServer, { client: client as any, env })
    registerAppendRows(fakeServer, { client: client as any, env })
    registerListRows(fakeServer, { client: client as any, env })
    registerGetRow(fakeServer, { client: client as any, env })
    registerDeleteRows(fakeServer, { client: client as any, env })

    const table = `IT_${Date.now()}`

    // create table
    let res = await tools.get('manage_tables')!({ operations: [{ action: 'create', name: table }] })
    const created = JSON.parse(res.content[0].text)
    expect(created.results[0].result.name).toBe(table)

    try {
      // append
      res = await tools.get('append_rows')!({ table, rows: [{ Title: 'Hello' }, { Title: 'World' }], allow_create_columns: true })
      const appended = JSON.parse(res.content[0].text)
      expect(appended.rows.length).toBe(2)

      // list
      res = await tools.get('list_rows')!({ table, page: 1, page_size: 10 })
      const listed = JSON.parse(res.content[0].text)
      expect(listed.rows.length).toBeGreaterThanOrEqual(2)

      const first = listed.rows[0]

      // update
      const { registerUpdateRows } = await import('../src/mcp/tools/updateRow.js')
      registerUpdateRows(fakeServer, { client: client as any, env })
      res = await tools.get('update_rows')!({ table, updates: [{ row_id: first._id, values: { Done: true } }], allow_create_columns: true })
      const updated = JSON.parse(res.content[0].text)
      expect(updated.rows[0].Done).toBe(true)

      // get
      res = await tools.get('get_row')!({ table, rowId: first._id })
      const got = JSON.parse(res.content[0].text)
      expect(got._id).toBe(first._id)

      // delete
      res = await tools.get('delete_rows')!({ table, row_ids: [first._id] })
      const deleted = JSON.parse(res.content[0].text)
      expect(deleted.results[0].success).toBe(true)
    } finally {
      // drop table
      const drop = await tools.get('manage_tables')!({ operations: [{ action: 'delete', name: table }] })
      const delRes = JSON.parse(drop.content[0].text)
      expect(delRes.results[0].result.success).toBe(true)
    }
  }, 60000)
})
