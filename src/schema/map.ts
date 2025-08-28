import { z } from 'zod'

import type { GenericSchema } from './generic'

// Table and column schemas reused across variants
const ColumnSchema = z.object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    data: z.record(z.unknown()).nullable().optional(),
})
const TableSchema = z
    .object({
        _id: z.string(),
        name: z.string(),
        columns: z.array(ColumnSchema).optional(),
    })
    .passthrough()

// v1: { base_id?, tables: [...] }
const MetaV1 = z
    .object({
        base_id: z.string().optional(),
        tables: z.array(TableSchema),
    })
    .passthrough()

// v2.1: { base_id?, metadata: { tables: [...] } }
const MetaV21 = z
    .object({
        base_id: z.string().optional(),
        metadata: z
            .object({
                tables: z.array(TableSchema),
            })
            .passthrough(),
    })
    .passthrough()

const SeaTableMetadataUnion = z.union([MetaV1, MetaV21])

export function mapMetadataToGeneric(meta: unknown): GenericSchema {
    const parsed = SeaTableMetadataUnion.parse(meta)
    const tables = (parsed as any).tables ?? (parsed as any).metadata?.tables ?? []
    const baseId = (parsed as any).base_id ?? ''
    return {
        base_id: baseId,
        tables: tables.map((t: z.infer<typeof TableSchema>) => ({
            id: t._id,
            name: t.name,
            columns: (t.columns ?? []).map((c) => ({
                id: c.key,
                name: c.name,
                type: normalizeType(c.type),
                options: c.data ?? undefined,
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
