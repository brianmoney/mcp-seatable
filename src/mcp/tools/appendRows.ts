import { z } from 'zod'

import { mapMetadataToGeneric } from '../../schema/map.js'
import { validateRowsAgainstSchema } from '../../schema/validate.js'
import { ToolRegistrar } from './types.js'

const InputShape = {
    table: z.string(),
    rows: z.array(z.record(z.any())),
    allow_create_columns: z.boolean().optional(),
} as const

function inferTypeFromValues(values: any[]): string {
    if (values.some((v) => typeof v === 'boolean')) return 'checkbox'
    if (values.some((v) => typeof v === 'number')) return 'number'
    return 'text'
}

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
            const { unknownColumns } = validateRowsAgainstSchema(generic, parsed.table, parsed.rows, {
                allowCreateColumns: parsed.allow_create_columns ?? false,
            })

            if (parsed.allow_create_columns && unknownColumns.length) {
                for (const col of unknownColumns) {
                    const sampleVals = parsed.rows.map((r) => r[col]).filter((v) => v !== undefined)
                    const inferred = inferTypeFromValues(sampleVals)
                    await client.createColumn(parsed.table, { column_name: col, column_type: inferred })
                }
            }
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
