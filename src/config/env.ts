import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv()

const EnvSchema = z.object({
    SEATABLE_SERVER_URL: z.string().url(),
    SEATABLE_API_TOKEN: z.string().min(1),
    SEATABLE_BASE_UUID: z.string().min(1),
    SEATABLE_TABLE_NAME: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    HTTP_TIMEOUT_MS: z
        .string()
        .optional()
        .transform((v) => (v ? Number(v) : undefined))
        .pipe(z.number().int().positive().optional()),
})

export type Env = z.infer<typeof EnvSchema>

export function getEnv(): Env {
    const parsed = EnvSchema.safeParse(process.env)
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
        throw new Error(`Invalid environment configuration:\n${issues}`)
    }
    return parsed.data
}
