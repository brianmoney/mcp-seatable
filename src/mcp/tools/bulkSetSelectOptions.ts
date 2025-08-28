import { z } from 'zod'

import { mapMetadataToGeneric } from '../../schema/map.js'
import { ToolRegistrar } from './types.js'

const SelectOption = z.object({ name: z.string(), color: z.string().optional() })
const ColumnUpdate = z.object({ column: z.string(), options: z.array(SelectOption).min(0) })
const Input = z.object({ table: z.string(), updates: z.array(ColumnUpdate).min(1) })

export const registerBulkSetSelectOptions: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    'bulk_set_select_options',
    {
      title: 'Bulk Set Select Options',
      description: 'Bulk update select options for one or more select columns on a table. Only single_select and multi_select columns are supported.',
      inputSchema: {
        table: z.string(),
        updates: z.array(
          z.object({
            column: z.string(),
            options: z.array(z.object({ name: z.string(), color: z.string().optional() })).min(0),
          })
        ).min(1),
      },
    },
    async (args: unknown) => {
      const { table, updates } = Input.parse(args)

      // Validate column types using current schema
      const metaBefore = await client.getMetadata()
      const genericBefore = mapMetadataToGeneric(metaBefore)
      const tbl = genericBefore.tables.find((t) => t.name === table)
      if (!tbl) throw new Error(`Unknown table: ${table}`)

      const results: any[] = []
      for (const u of updates) {
        const col = tbl.columns.find((c) => c.name === u.column)
        if (!col) throw new Error(`Unknown column: ${u.column}`)
        if (col.type !== 'single_select' && col.type !== 'multi_select') {
          throw new Error(`Column ${u.column} is type ${col.type}, expected single_select or multi_select`)
        }
        // Prefer common shape: data: { options: [...] }; client will try op_type variants and fallbacks
        const res = await client.updateColumn(table, u.column, { data: { options: u.options } })
        results.push({ column: u.column, result: res })
      }

      // Return updated schema snapshot for the table
      const meta = await client.getMetadata()
      const generic = mapMetadataToGeneric(meta)
      const updatedTable = generic.tables.find((t) => t.name === table)

      return { content: [{ type: 'text', text: JSON.stringify({ results, schema: updatedTable }) }] }
    }
  )
}
