import { z } from 'zod'

import { ToolRegistrar } from './types.js'
import { mapMetadataToGeneric } from '../../schema/map.js'
import { validateRowsAgainstSchema } from '../../schema/validate.js'

const UpdateItem = z.object({
    row_id: z.string(),
    values: z.record(z.any()),
})

const InputShape = {
    table: z.string(),
    updates: z.array(UpdateItem),
    allow_create_columns: z.boolean().optional(),
} as const

const Input = z.object(InputShape)

export const registerUpdateRows: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'update_rows',
        {
            title: 'Update Rows',
            description: 'Batch update rows. Rejects unknown columns unless allow_create_columns=true',
            inputSchema: InputShape,
        },
        async (args: unknown) => {
            const { table, updates, allow_create_columns } = Input.parse(args)
            const metadata = await client.getMetadata()
            const generic = mapMetadataToGeneric(metadata)
            // Validate against schema
            validateRowsAgainstSchema(
                generic,
                table,
                updates.map((u) => u.values),
                { allowCreateColumns: allow_create_columns ?? false }
            )

            const results = [] as any[]
            for (const u of updates) {
                const updated = await client.updateRow(table, u.row_id, u.values)
                results.push(updated)
            }
            return { content: [{ type: 'text', text: JSON.stringify({ rows: results }) }] }
        }
    )
}
