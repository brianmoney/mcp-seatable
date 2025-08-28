import { z } from 'zod'

import { makeError } from '../errors.js'
import type { GenericSchema } from './generic.js'

export const ValidateOptionsSchema = z.object({
    allowCreateColumns: z.boolean().default(false),
})
export type ValidateOptions = z.infer<typeof ValidateOptionsSchema>

export function validateRowsAgainstSchema(
    schema: GenericSchema,
    tableName: string,
    rows: Array<Record<string, unknown>>,
    opts?: Partial<ValidateOptions>
): { rows: Array<Record<string, unknown>>; unknownColumns: string[] } {
    const options = ValidateOptionsSchema.parse({ allowCreateColumns: false, ...(opts || {}) })
    const table = schema.tables.find((t) => t.name === tableName)
    if (!table) {
        throw makeError('ERR_SCHEMA_UNKNOWN_TABLE', 'ERR_SCHEMA_UNKNOWN_TABLE', { tableName })
    }
    const allowed = new Set(table.columns.map((c) => c.name))
    const unknown = new Set<string>()

    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!allowed.has(key)) unknown.add(key)
        }
    }

    const unknownColumns = Array.from(unknown)
    if (unknownColumns.length && !options.allowCreateColumns) {
        throw makeError('ERR_SCHEMA_UNKNOWN_COLUMN', `Unknown columns: ${unknownColumns.join(', ')}`, {
            tableName,
            unknownColumns,
        })
    }

    return { rows, unknownColumns }
}
