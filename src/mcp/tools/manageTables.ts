import { z } from 'zod'
import { ToolRegistrar } from './types.js'

const Column = z.object({ name: z.string(), type: z.string(), options: z.record(z.any()).optional() })
const OperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string(), columns: z.array(Column).optional() }),
  z.object({ action: z.literal('rename'), from: z.string(), to: z.string() }),
  z.object({ action: z.literal('delete'), name: z.string() })
])

const InputShape = {
  operations: z.array(OperationSchema)
} as const

export const registerManageTables: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    'manage_tables',
    {
      title: 'Manage Tables',
      description: 'Create, rename, or delete tables in SeaTable',
      inputSchema: InputShape,
    },
    async (args: unknown) => {
      const { operations } = z.object(InputShape).parse(args)
      const results: any[] = []
      for (const op of operations) {
        if (op.action === 'create') {
          const res = await client.createTable(op.name, op.columns || [])
          results.push({ action: 'create', result: res })
        } else if (op.action === 'rename') {
          const res = await client.renameTable(op.from, op.to)
          results.push({ action: 'rename', result: res })
        } else if (op.action === 'delete') {
          const res = await client.deleteTable(op.name)
          results.push({ action: 'delete', result: res })
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ results }) }] }
    }
  )
}
