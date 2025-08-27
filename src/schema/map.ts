import { z } from 'zod'

import type { GenericSchema } from './generic'

// Very lightweight mapper assuming SeaTable metadata shape provides tables and columns
const SeaTableMetadataSchema = z.object({
    base_id: z.string().optional(),
    tables: z.array(
        z.object({
            _id: z.string(),
            name: z.string(),
            columns: z.array(
                z.object({
                    key: z.string(),
                    name: z.string(),
                    type: z.string(),
                    data: z.record(z.unknown()).optional(),
                })
            ).optional(),
        })
    ),
})

export function mapMetadataToGeneric(meta: unknown): GenericSchema {
    const parsed = SeaTableMetadataSchema.parse(meta)
    return {
        base_id: parsed.base_id ?? '',
        tables: parsed.tables.map((t) => ({
            id: t._id,
            name: t.name,
            columns: (t.columns ?? []).map((c) => ({
                id: c.key,
                name: c.name,
                // naive mapping; refine as needed
                type: normalizeType(c.type),
                options: c.data,
            })),
        })),
    }
}

function normalizeType(t: string): any {
    const m: Record<string, string> = {
        text: 'text',
        long_text: 'long_text',
        number: 'number',
        checkbox: 'checkbox',
        date: 'date',
        datetime: 'datetime',
        single_select: 'single_select',
        multiple_select: 'multi_select',
        link: 'link',
        file: 'attachment',
        image: 'attachment',
        url: 'url',
        email: 'email',
        phone: 'phone',
        formula: 'formula',
    }
    return (m[t] as any) ?? 'text'
}
