import { z } from 'zod'

import { ToolRegistrar } from './types.js'

const InputShape = {
    table: z.string(),
    row_ids: z.array(z.string()),
} as const

export const registerDeleteRows: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'delete_rows',
        {
            title: 'Delete Rows',
            description: 'Delete rows by ID from a table',
            inputSchema: InputShape,
        },
        async (args: unknown) => {
            const { table, row_ids } = z.object(InputShape).parse(args)
            const results = [] as any[]
            for (const id of row_ids) {
                const res = await client.deleteRow(table, id)
                results.push({ row_id: id, ...res })
            }
            return { content: [{ type: 'text', text: JSON.stringify({ results }) }] }
        }
    )
}
