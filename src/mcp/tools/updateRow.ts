import { z } from 'zod'

import { ToolRegistrar } from './types.js'

const InputShape = { table: z.string(), rowId: z.string(), row: z.record(z.any()) } as const
const Input = z.object(InputShape)

export const registerUpdateRow: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'updateRow',
        {
            title: 'Update Row',
            description: 'Update an existing row',
            inputSchema: InputShape,
        },
        async (args: unknown) => {
            const { table, rowId, row } = Input.parse(args)
            const updated = await client.updateRow(table, rowId, row)
            return { content: [{ type: 'text', text: JSON.stringify(updated) }] }
        }
    )
}
