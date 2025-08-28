import { AxiosError } from 'axios'

import { logger } from '../logger.js'

export function isRateLimited(error: unknown): boolean {
    const err = error as AxiosError
    return (err.response?.status || 0) === 429
}

export function logAxiosError(error: unknown, op: string) {
    const err = error as AxiosError
    const cfg: any = err.config || {}
    const meta = cfg.metadata || {}
    const started = meta.startedAt as number | undefined
    const duration = started ? Date.now() - started : undefined
    logger.error(
        {
            op,
            method: cfg.method,
            url: cfg.url,
            status: err.response?.status,
            data: err.response?.data,
            request_id: meta.requestId,
            duration_ms: duration,
        },
        'SeaTable API request failed'
    )
}

export interface PaginationOpts {
    pageSize?: number
    maxPages?: number
}
