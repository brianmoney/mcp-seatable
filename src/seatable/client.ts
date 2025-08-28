import axios, { AxiosError, AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import Bottleneck from 'bottleneck'
import { z } from 'zod'

import { getEnv } from '../config/env.js'
import { toCodedAxiosError } from '../errors.js'
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
    private readonly gatewayHttp: AxiosInstance
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

        // API-Gateway v2 for management endpoints (tables, columns, files)
        this.gatewayHttp = axios.create({
            baseURL: `${env.SEATABLE_SERVER_URL}/api-gateway/api/v2/dtables/${env.SEATABLE_BASE_UUID}`,
            timeout: Number(env.HTTP_TIMEOUT_MS ?? 20000),
            headers: {
                'Content-Type': 'application/json',
            },
        })

        // 5 RPS default (minTime ~ 200ms)
        this.limiter = new Bottleneck({ minTime: 200 })

        const addMeta = (config: any) => {
            config.metadata = config.metadata || {}
            config.metadata.requestId = config.metadata.requestId || Math.random().toString(36).slice(2)
            config.metadata.startedAt = Date.now()
            return config
        }

        // Inject fresh base token per request (Token) for dtable-server
        this.http.interceptors.request.use(async (config) => {
            const token = await tm.getToken()
            config.headers = config.headers || {}
            ;(config.headers as any).Authorization = `Token ${token}`
            return addMeta(config)
        })
        // Inject fresh base token per request (Bearer) for api-gateway
        this.gatewayHttp.interceptors.request.use(async (config) => {
            const token = await tm.getToken()
            config.headers = config.headers || {}
            ;(config.headers as any).Authorization = `Bearer ${token}`
            return addMeta(config)
        })

        const retryConfig = {
            retries: 3,
            retryDelay: (retryCount: number) => {
                const base = axiosRetry.exponentialDelay(retryCount)
                const jitter = Math.floor(Math.random() * 250)
                return base + jitter
            },
            retryCondition: (error: AxiosError) => {
                const status = error.response?.status
                return [408, 429, 500, 502, 503, 504].includes(status ?? 0)
            },
        }
        axiosRetry(this.http, retryConfig)
        axiosRetry(this.gatewayHttp, retryConfig)

        // On 401, force refresh token once and retry
        const onAuthError = async (error: AxiosError) => {
            if (error.response?.status === 401) {
                try {
                    await tm.forceRefresh()
                    const cfg = error.config!
                    const token = await tm.getToken()
                    cfg.headers = cfg.headers || {}
                    // Decide header based on which instance
                    const isGateway = (cfg.baseURL || '').includes('/api-gateway/')
                        ; (cfg.headers as any).Authorization = `${isGateway ? 'Bearer' : 'Token'} ${token}`
                    return (isGateway ? this.gatewayHttp : this.http).request(cfg)
                } catch (_) {
                    return Promise.reject(toCodedAxiosError(error, 'auth'))
                }
            }
            return Promise.reject(error)
        }
        this.http.interceptors.response.use((r) => r, onAuthError)
        this.gatewayHttp.interceptors.response.use((r) => r, onAuthError)
    }

    // --- Tables ---
    async createTable(tableName: string, columns?: Array<Record<string, unknown>>): Promise<{ name: string }> {
        try {
            const res = await this.limiter.schedule(() =>
                this.gatewayHttp.post('/tables/', { table_name: tableName, columns })
            )
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'createTable')
            throw toCodedAxiosError(error, 'createTable')
        }
    }

    async renameTable(from: string, to: string): Promise<{ name: string }> {
        try {
            const res = await this.limiter.schedule(() =>
                this.gatewayHttp.put('/tables/', { table_name: from, new_table_name: to })
            )
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'renameTable')
            throw toCodedAxiosError(error, 'renameTable')
        }
    }

    async deleteTable(name: string): Promise<{ success: boolean }> {
        try {
            await this.limiter.schedule(() => this.gatewayHttp.delete('/tables/', { data: { table_name: name } }))
            return { success: true }
        } catch (error) {
            logAxiosError(error, 'deleteTable')
            throw toCodedAxiosError(error, 'deleteTable')
        }
    }

    // --- Columns (API-Gateway v2) ---
    async createColumn(table: string, column: Record<string, unknown>) {
        try {
            const res = await this.limiter.schedule(() =>
                this.gatewayHttp.post('/columns/', { table_name: table, ...column })
            )
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'createColumn')
            throw toCodedAxiosError(error, 'createColumn')
        }
    }

    async updateColumn(table: string, columnName: string, patch: Record<string, unknown>) {
        try {
            const res = await this.limiter.schedule(() =>
                this.gatewayHttp.put('/columns/', { table_name: table, column_name: columnName, ...patch })
            )
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'updateColumn')
            throw toCodedAxiosError(error, 'updateColumn')
        }
    }

    async deleteColumn(table: string, columnName: string) {
        try {
            await this.limiter.schedule(() =>
                this.gatewayHttp.delete('/columns/', { data: { table_name: table, column_name: columnName } })
            )
            return { success: true }
        } catch (error) {
            logAxiosError(error, 'deleteColumn')
            throw toCodedAxiosError(error, 'deleteColumn')
        }
    }

    // --- Existing dtable-server row APIs ---
    async listTables(): Promise<SeaTableTable[]> {
        try {
            const res = await this.limiter.schedule(() => this.http.get('/metadata/tables'))
            return (res as any).data.tables as SeaTableTable[]
        } catch (error) {
            logAxiosError(error, 'listTables')
            throw toCodedAxiosError(error, 'listTables')
        }
    }

    async getMetadata(): Promise<any> {
        try {
            const res = await this.limiter.schedule(() => this.http.get('/metadata'))
            return (res as any).data
        } catch (error) {
            logAxiosError(error, 'getMetadata')
            throw toCodedAxiosError(error, 'getMetadata')
        }
    }

    async listRows(query: ListRowsQuery): Promise<ListRowsResponse> {
        const parsed = ListRowsQuerySchema.parse(query)
        try {
            const res = await this.limiter.schedule(() => this.http.get('/rows/', { params: parsed }))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'listRows')
            throw toCodedAxiosError(error, 'listRows')
        }
    }

    async getRow(table: string, rowId: string): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.get(`/rows/${rowId}`, { params: { table } }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'getRow')
            throw toCodedAxiosError(error, 'getRow')
        }
    }

    async addRow(table: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.post('/rows/', { table, row }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'addRow')
            throw toCodedAxiosError(error, 'addRow')
        }
    }

    async updateRow(table: string, rowId: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.limiter.schedule(() => this.http.put(`/rows/${rowId}`, { table, row }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'updateRow')
            throw toCodedAxiosError(error, 'updateRow')
        }
    }

    async deleteRow(table: string, rowId: string): Promise<{ success: boolean }> {
        try {
            await this.limiter.schedule(() => this.http.delete(`/rows/${rowId}`, { data: { table } }))
            return { success: true }
        } catch (error) {
            logAxiosError(error, 'deleteRow')
            throw toCodedAxiosError(error, 'deleteRow')
        }
    }

    async searchRows(table: string, query: Record<string, unknown>): Promise<ListRowsResponse> {
        try {
            const res = await this.limiter.schedule(() => this.http.post('/rows/filter', { table, filter: query }))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'searchRows')
            throw toCodedAxiosError(error, 'searchRows')
        }
    }
}
