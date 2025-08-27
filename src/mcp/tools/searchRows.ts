import { z } from 'zod'

import { ToolRegistrar } from './types.js'

const InputShape = {
    table: z.string(),
    query: z.record(z.any()),
} as const

export const registerSearchRows: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'searchRows',
        {
            title: 'Search Rows',
            description: 'Search rows with a filter object',
            inputSchema: InputShape,
        },
        async (args: unknown) => {
            const parsed = z.object(InputShape).parse(args)
            const res = await client.searchRows(parsed.table, parsed.query)
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )
}
