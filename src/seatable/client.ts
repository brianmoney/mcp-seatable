import axios, { AxiosError, AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import Bottleneck from 'bottleneck'
import { z } from 'zod'

import { getEnv } from '../config/env.js'
import { ListRowsResponse, SeaTableRow, SeaTableTable } from './types.js'
import { logAxiosError } from './utils.js'
import { TokenManager } from './tokenManager.js'

const ListRowsQuerySchema = z.object({
    table: z.string(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(1000).default(100),
    view: z.string().optional(),
    order_by: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    filter: z.record(z.any()).optional(),
    search: z.string().optional(),
})
export type ListRowsQuery = z.infer<typeof ListRowsQuerySchema>

export class SeaTableClient {
    private readonly http: AxiosInstance
    private readonly limiter: Bottleneck

    constructor() {
        const env = getEnv()
        const tm = new TokenManager({
            serverUrl: env.SEATABLE_SERVER_URL,
            apiToken: env.SEATABLE_API_TOKEN,
            baseUuid: env.SEATABLE_BASE_UUID,
            timeoutMs: Number(env.HTTP_TIMEOUT_MS ?? 20000),
        })
        this.http = axios.create({
            baseURL: `${env.SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${env.SEATABLE_BASE_UUID}`,
            timeout: Number(env.HTTP_TIMEOUT_MS ?? 20000),
            headers: {
                'Content-Type': 'application/json',
            },
        })

        // 5 RPS default (minTime ~ 200ms)
        this.limiter = new Bottleneck({ minTime: 200 })

        // Inject fresh base token per request
        this.http.interceptors.request.use(async (config) => {
            const token = await tm.getToken()
            config.headers = config.headers || {}
                ; (config.headers as any).Authorization = `Token ${token}`
            return config
        })

        axiosRetry(this.http, {
            retries: 3,
            retryDelay: (retryCount, error) => {
                const base = axiosRetry.exponentialDelay(retryCount)
                const jitter = Math.floor(Math.random() * 250)
                return base + jitter
            },
            retryCondition: (error: AxiosError) => {
                const status = error.response?.status
                return [408, 429, 500, 502, 503, 504].includes(status ?? 0)
            },
        })

        // On 401, force refresh token once and retry
        this.http.interceptors.response.use(
            (r) => r,
            async (error: AxiosError) => {
                if (error.response?.status === 401) {
                    try {
                        await tm.forceRefresh()
                        const cfg = error.config!
                        const token = await tm.getToken()
                        cfg.headers = cfg.headers || {}
                            ; (cfg.headers as any).Authorization = `Token ${token}`
                        return this.http.request(cfg)
                    } catch (_) {
                        const e: any = error
                        e.code = 'ERR_AUTH_EXPIRED'
                        return Promise.reject(e)
                    }
                }
                return Promise.reject(error)
            }
        )
    }

    async listTables(): Promise<SeaTableTable[]> {
        try {
            const res = await this.limiter.schedule(() => this.http.get('/metadata/tables'))
            return (res as any).data.tables as SeaTableTable[]
        } catch (error) {
            logAxiosError(error, 'listTables')
            throw error
        }
    }

    async getMetadata(): Promise<any> {
        try {
            const res = await this.limiter.schedule(() => this.http.get('/metadata'))
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'getMetadata')
            throw error
        }
    }

    async listRows(query: ListRowsQuery): Promise<ListRowsResponse> {
        const parsed = ListRowsQuerySchema.parse(query)
        try {
            const res = await this.limiter.schedule(() => this.http.get('/rows/', { params: parsed }))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'listRows')
            throw error
        }
    }

    async getRow(table: string, rowId: string): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.get(`/rows/${rowId}`, { params: { table } }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'getRow')
            throw error
        }
    }

    async addRow(table: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.post('/rows/', { table, row }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'addRow')
            throw error
        }
    }

    async updateRow(table: string, rowId: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.put(`/rows/${rowId}`, { table, row }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'updateRow')
            throw error
        }
    }

    async deleteRow(table: string, rowId: string): Promise<{ success: boolean }> {
        try {
            await this.limiter.schedule(() => this.http.delete(`/rows/${rowId}`, { data: { table } }))
            return { success: true }
        } catch (error) {
            logAxiosError(error, 'deleteRow')
            throw error
        }
    }

    async searchRows(table: string, query: Record<string, unknown>): Promise<ListRowsResponse> {
        try {
            const res = await this.limiter.schedule(() => this.http.post('/rows/filter', { table, filter: query }))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'searchRows')
            throw error
        }
    }
}
