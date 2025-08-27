import { AxiosError } from 'axios'

import { logger } from '../logger.js'

export function isRateLimited(error: unknown): boolean {
    const err = error as AxiosError
    return (err.response?.status || 0) === 429
}

export function logAxiosError(error: unknown, op: string) {
    const err = error as AxiosError
    logger.error({ op, status: err.response?.status, data: err.response?.data }, 'SeaTable API request failed')
}

export interface PaginationOpts {
    pageSize?: number
    maxPages?: number
}
