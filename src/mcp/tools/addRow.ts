import { z } from 'zod'

import { ToolRegistrar } from './types.js'

const InputShape = { table: z.string(), row: z.record(z.any()) } as const
const Input = z.object(InputShape)

export const registerAddRow: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'addRow',
        {
            title: 'Add Row',
            description: 'Add a new row',
            inputSchema: InputShape
        },
        async (args: unknown) => {
            const { table, row } = Input.parse(args)
            const created = await client.addRow(table, row)
            return { content: [{ type: 'text', text: JSON.stringify(created) }] }
        }
    )
}
