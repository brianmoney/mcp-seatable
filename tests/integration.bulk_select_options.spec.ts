import { beforeAll, describe, expect, it } from 'vitest'

import { getEnv } from '../src/config/env.js'
import { registerManageTables } from '../src/mcp/tools/manageTables.js'
import { registerManageColumns } from '../src/mcp/tools/manageColumns.js'
import { registerBulkSetSelectOptions } from '../src/mcp/tools/bulkSetSelectOptions.js'

const runIntegration = process.env.SEATABLE_IT === 'true'
const d = runIntegration ? describe : describe.skip

beforeAll(() => {
  // Expect .env to be populated by user
})

type ToolHandler = (args: unknown) => Promise<any>

d('SeaTable Integration (bulk select options)', () => {
  it('create table, create select columns, bulk set options, then delete table', async () => {
    const tools = new Map<string, ToolHandler>()
    const fakeServer = {
      registerTool: (id: string, _def: any, handler: ToolHandler) => tools.set(id, handler),
    } as any

    const env = getEnv()
    const { SeaTableClient } = await import('../src/seatable/client.js')
    const client = new SeaTableClient()

    registerManageTables(fakeServer, { client: client as any, env })
    registerManageColumns(fakeServer, { client: client as any, env })
    registerBulkSetSelectOptions(fakeServer, { client: client as any, env })

    const table = `IT_SEL_${Date.now()}`

    // create table
    let res = await tools.get('manage_tables')!({ operations: [{ action: 'create', name: table }] })
    const created = JSON.parse(res.content[0].text)
    expect(created.results[0].result.name).toBe(table)

    try {
      // create two select columns
      res = await tools.get('manage_columns')!({ table, operations: [
        { action: 'create', create: { name: 'Status', type: 'single_select' } },
        { action: 'create', create: { name: 'Tags', type: 'multi_select' } },
      ] })
      const afterCreate = JSON.parse(res.content[0].text)
      expect(afterCreate.schema.columns.find((c: any) => c.name === 'Status')).toBeTruthy()
      expect(afterCreate.schema.columns.find((c: any) => c.name === 'Tags')).toBeTruthy()

      // bulk set options
      res = await tools.get('bulk_set_select_options')!({
        table,
        updates: [
          { column: 'Status', options: [ { name: 'Open' }, { name: 'Closed' } ] },
          { column: 'Tags', options: [ { name: 'Red' }, { name: 'Blue' }, { name: 'Green' } ] },
        ],
      })
      const updated = JSON.parse(res.content[0].text)
      const statusCol = updated.schema.columns.find((c: any) => c.name === 'Status')
      const tagsCol = updated.schema.columns.find((c: any) => c.name === 'Tags')
      expect(statusCol.options?.options?.length).toBeGreaterThanOrEqual(2)
      expect(tagsCol.options?.options?.length).toBeGreaterThanOrEqual(3)
    } finally {
      const drop = await tools.get('manage_tables')!({ operations: [{ action: 'delete', name: table }] })
      const delRes = JSON.parse(drop.content[0].text)
      expect(delRes.results[0].result.success).toBe(true)
    }
  }, 60000)
})
