import { z } from 'zod'

import { ToolRegistrar } from './types.js'
import { mapMetadataToGeneric } from '../../schema/map.js'
import { validateRowsAgainstSchema } from '../../schema/validate.js'

const InputShape = {
    table: z.string(),
    rows: z.array(z.record(z.any())),
    allow_create_columns: z.boolean().optional(),
} as const

export const registerAppendRows: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'append_rows',
        {
            title: 'Append Rows',
            description: 'Batch insert rows. Rejects unknown columns unless allow_create_columns=true',
            inputSchema: InputShape,
        },
        async (args: unknown) => {
            const parsed = z.object(InputShape).parse(args)
            const metadata = await client.getMetadata()
            const generic = mapMetadataToGeneric(metadata)
            validateRowsAgainstSchema(generic, parsed.table, parsed.rows, {
                allowCreateColumns: parsed.allow_create_columns ?? false,
            })
            // Insert rows one by one for now (can batch later)
            const results = [] as any[]
            for (const row of parsed.rows) {
                const res = await client.addRow(parsed.table, row)
                results.push(res)
            }
            return { content: [{ type: 'text', text: JSON.stringify({ rows: results }) }] }
        }
    )
}
