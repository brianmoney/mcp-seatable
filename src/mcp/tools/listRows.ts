import { z } from 'zod'

import { ToolRegistrar } from './types.js'

export const ListRowsInput = z.object({
    table: z.string(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(1000).default(100),
    view: z.string().optional(),
    order_by: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    filter: z.record(z.any()).optional(),
    search: z.string().optional(),
})

const InputShape = {
    table: z.string(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(1000).default(100),
    view: z.string().optional(),
    order_by: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    filter: z.record(z.any()).optional(),
    search: z.string().optional(),
} as const

export const registerListRows: ToolRegistrar = (server, { client, env }) => {
    server.registerTool(
        'list_rows',
        {
            title: 'List Rows',
            description: 'List rows from a table with pagination and filters',
            inputSchema: { ...InputShape, table: z.string().default(env.SEATABLE_TABLE_NAME || '') },
        },
        async (args: unknown) => {
            const parsed = ListRowsInput.parse(args)
            const res = await client.listRows(parsed)
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )
}
