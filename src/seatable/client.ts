import axios, { AxiosError, AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import Bottleneck from 'bottleneck'
import { z } from 'zod'

import { getEnv } from '../config/env.js'
import { toCodedAxiosError } from '../errors.js'
import { TokenManager } from './tokenManager.js'
import { ListRowsResponse, SeaTableRow, SeaTableTable } from './types.js'
import { logAxiosError } from './utils.js'

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
    private readonly externalHttp: AxiosInstance
    private readonly limiter: Bottleneck

    constructor() {
        const env = getEnv()
        const serverUrl = env.SEATABLE_SERVER_URL.replace(/\/$/, '')
        const tm = new TokenManager({
            serverUrl: serverUrl,
            apiToken: env.SEATABLE_API_TOKEN,
            baseUuid: env.SEATABLE_BASE_UUID,
            timeoutMs: Number(env.HTTP_TIMEOUT_MS ?? 20000),
        })
        this.http = axios.create({
            baseURL: `${serverUrl}/dtable-server/api/v1/dtables/${env.SEATABLE_BASE_UUID}`,
            timeout: Number(env.HTTP_TIMEOUT_MS ?? 20000),
            headers: {
                'Content-Type': 'application/json',
            },
        })

        // API-Gateway v2 for management endpoints (tables, columns, files)
        this.gatewayHttp = axios.create({
            baseURL: `${serverUrl}/api-gateway/api/v2/dtables/${env.SEATABLE_BASE_UUID}`,
            timeout: Number(env.HTTP_TIMEOUT_MS ?? 20000),
            headers: {
                'Content-Type': 'application/json',
            },
        })

        // External API v2.1 as additional fallback (commonly exposed on SaaS)
        this.externalHttp = axios.create({
            baseURL: `${serverUrl}/api/v2.1/dtables/${env.SEATABLE_BASE_UUID}`,
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

        // Inject Base-Token (Bearer) for all surfaces
        const addBearer = async (config: any) => {
            const token = await tm.getToken()
            config.headers = config.headers || {}
            ;(config.headers as any).Authorization = `Bearer ${token}`
            return addMeta(config)
        }
        this.http.interceptors.request.use(addBearer)
        this.gatewayHttp.interceptors.request.use(addBearer)
        this.externalHttp.interceptors.request.use(addBearer)

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
        axiosRetry(this.externalHttp, retryConfig)

        // On 401, force refresh token once and retry
        const onAuthError = async (error: AxiosError) => {
            if (error.response?.status === 401) {
                try {
                    const cfg = error.config!
                    await tm.forceRefresh()
                    const t = await tm.getToken()
                    cfg.headers = cfg.headers || {}
                    ;(cfg.headers as any).Authorization = `Bearer ${t}`
                    // re-dispatch on the same instance
                    const url = cfg.baseURL || ''
                    if (url.includes('/api-gateway/')) return this.gatewayHttp.request(cfg)
                    if (url.includes('/api/v2.1/')) return this.externalHttp.request(cfg)
                    return this.http.request(cfg)
                } catch (_) {
                    return Promise.reject(toCodedAxiosError(error, 'auth'))
                }
            }
            return Promise.reject(error)
        }
        this.http.interceptors.response.use((r) => r, onAuthError)
        this.gatewayHttp.interceptors.response.use((r) => r, onAuthError)
        this.externalHttp.interceptors.response.use((r) => r, onAuthError)
    }

    private shouldFallback(error: unknown): boolean {
        const err = error as AxiosError
        // Fallback if no response (network/route missing) or 404 Not Found
        return !err.response || err.response.status === 404
    }

    private isOpTypeInvalid(error: unknown): boolean {
        const err = error as AxiosError
        const status = err.response?.status
        const msg = typeof err.response?.data === 'string' ? err.response?.data : (err.response?.data as any)?.message
        return status === 400 && /op_type invalid/i.test(String(msg))
    }

    private extractTablesFromMetadata(data: any): SeaTableTable[] {
        const tables = (data && (data.tables || data?.metadata?.tables)) || []
        return Array.isArray(tables) ? (tables as SeaTableTable[]) : []
    }

    // --- Tables ---
    async createTable(tableName: string, columns?: Array<Record<string, unknown>>): Promise<{ name: string }> {
        try {
            const res = await this.limiter.schedule(() =>
                this.gatewayHttp.post('/tables/', { table_name: tableName, columns })
            )
            return (res as any).data
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() =>
                        this.http.post('/tables/', { table_name: tableName, columns })
                    )
                    return (res as any).data
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() =>
                                this.externalHttp.post('/tables/', { table_name: tableName, columns })
                            )
                            return (res as any).data
                        } catch (err3) {
                            logAxiosError(err3, 'createTable')
                            throw toCodedAxiosError(err3, 'createTable')
                        }
                    }
                    logAxiosError(err2, 'createTable')
                    throw toCodedAxiosError(err2, 'createTable')
                }
            }
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
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() =>
                        this.http.put('/tables/', { table_name: from, new_table_name: to })
                    )
                    return (res as any).data
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() =>
                                this.externalHttp.put('/tables/', { table_name: from, new_table_name: to })
                            )
                            return (res as any).data
                        } catch (err3) {
                            logAxiosError(err3, 'renameTable')
                            throw toCodedAxiosError(err3, 'renameTable')
                        }
                    }
                    logAxiosError(err2, 'renameTable')
                    throw toCodedAxiosError(err2, 'renameTable')
                }
            }
            logAxiosError(error, 'renameTable')
            throw toCodedAxiosError(error, 'renameTable')
        }
    }

    async deleteTable(name: string): Promise<{ success: boolean }> {
        try {
            await this.limiter.schedule(() => this.gatewayHttp.delete('/tables/', { data: { table_name: name } }))
            return { success: true }
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    await this.limiter.schedule(() => this.http.delete('/tables/', { data: { table_name: name } }))
                    return { success: true }
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            await this.limiter.schedule(() =>
                                this.externalHttp.delete('/tables/', { data: { table_name: name } })
                            )
                            return { success: true }
                        } catch (err3) {
                            logAxiosError(err3, 'deleteTable')
                            throw toCodedAxiosError(err3, 'deleteTable')
                        }
                    }
                    logAxiosError(err2, 'deleteTable')
                    throw toCodedAxiosError(err2, 'deleteTable')
                }
            }
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
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() =>
                        this.http.post('/columns/', { table_name: table, ...column })
                    )
                    return (res as any).data
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() =>
                                this.externalHttp.post('/columns/', { table_name: table, ...column })
                            )
                            return (res as any).data
                        } catch (err3) {
                            logAxiosError(err3, 'createColumn')
                            throw toCodedAxiosError(err3, 'createColumn')
                        }
                    }
                    logAxiosError(err2, 'createColumn')
                    throw toCodedAxiosError(err2, 'createColumn')
                }
            }
            logAxiosError(error, 'createColumn')
            throw toCodedAxiosError(error, 'createColumn')
        }
    }

    async updateColumn(table: string, columnName: string, patch: Record<string, unknown>) {
        const base = { table_name: table, column_name: columnName }
        const candidates: Record<string, unknown>[] = []

        // Normalize a few common shapes for select options updates
        const hasOptionsTopLevel = Object.prototype.hasOwnProperty.call(patch, 'options')
        const hasData = Object.prototype.hasOwnProperty.call(patch, 'data')
        const hasColumnType = Object.prototype.hasOwnProperty.call(patch, 'column_type')
        const hasNewName = Object.prototype.hasOwnProperty.call(patch, 'new_column_name')

        if (hasOptionsTopLevel) {
            const options = (patch as any).options
            candidates.push({ ...base, op_type: 'set_column_options', data: { options } })
            candidates.push({ ...base, op_type: 'set_options', data: { options } })
            candidates.push({ ...base, op_type: 'set_column_data', data: options })
            candidates.push({ ...base, op_type: 'set_column_data', data: { options } })
            candidates.push({ ...base, op_type: 'modify', data: { options } })
            candidates.push({ ...base, op_type: 'update_column', data: { options } })
            // legacy alias 'choices'
            candidates.push({ ...base, op_type: 'modify', data: { choices: options?.options ?? options } })
        }

        if (hasData) {
            const data = (patch as any).data
            candidates.push({ ...base, op_type: 'set_column_options', data })
            candidates.push({ ...base, op_type: 'set_options', data })
            candidates.push({ ...base, op_type: 'set_column_data', data })
            candidates.push({ ...base, op_type: 'modify', data })
            candidates.push({ ...base, op_type: 'update_column', data })
        }

        if (hasColumnType) {
            const column_type = (patch as any).column_type
            candidates.push({ ...base, op_type: 'set_column_type', column_type })
            candidates.push({ ...base, op_type: 'modify', column_type })
            candidates.push({ ...base, op_type: 'update_column', column_type })
        }

        if (hasNewName) {
            const new_column_name = (patch as any).new_column_name
            candidates.push({ ...base, op_type: 'rename', new_column_name })
            candidates.push({ ...base, op_type: 'modify', new_column_name })
            candidates.push({ ...base, op_type: 'update_column', new_column_name })
        }

        if (candidates.length === 0) {
            candidates.push({ ...base, ...patch })
        }

        const tryBodies = async (inst: AxiosInstance) => {
            let lastErr: any
            for (const body of candidates) {
                try {
                    const res = await this.limiter.schedule(() => inst.put('/columns/', body))
                    return (res as any).data
                } catch (e) {
                    lastErr = e
                    const err = e as AxiosError
                    const status = err.response?.status
                    const msg = typeof err.response?.data === 'string' ? err.response?.data : (err.response?.data as any)?.message
                    if (status === 400 && /op_type invalid/i.test(String(msg))) {
                        // try next candidate
                        continue
                    }
                    // non-op_type error: rethrow to handle fallback logic
                    throw e
                }
            }
            // exhausted candidates; throw last error
            throw lastErr
        }

        try {
            return await tryBodies(this.gatewayHttp)
        } catch (error) {
            if (this.shouldFallback(error) || this.isOpTypeInvalid(error)) {
                try {
                    return await tryBodies(this.http)
                } catch (err2) {
                    if (this.shouldFallback(err2) || this.isOpTypeInvalid(err2)) {
                        try {
                            return await tryBodies(this.externalHttp)
                        } catch (err3) {
                            logAxiosError(err3, 'updateColumn')
                            throw toCodedAxiosError(err3, 'updateColumn')
                        }
                    }
                    logAxiosError(err2, 'updateColumn')
                    throw toCodedAxiosError(err2, 'updateColumn')
                }
            }
            logAxiosError(error, 'updateColumn')
            throw toCodedAxiosError(error, 'updateColumn')
        }
    }

    // --- Metadata and Rows (prefer API-Gateway v2) ---
    async listTables(): Promise<SeaTableTable[]> {
        try {
            // Prefer gateway list tables endpoint
            const res = await this.limiter.schedule(() => this.gatewayHttp.get('/tables/'))
            const data: any = (res as any).data
            if (Array.isArray(data)) return data as SeaTableTable[]
            if (Array.isArray(data?.tables)) return data.tables as SeaTableTable[]
            // fallback: try gateway metadata shape
            const meta = await this.limiter.schedule(() => this.gatewayHttp.get('/metadata'))
            return this.extractTablesFromMetadata((meta as any).data)
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.get('/tables/'))
                    const data: any = (res as any).data
                    if (Array.isArray(data)) return data as SeaTableTable[]
                    if (Array.isArray(data?.tables)) return data.tables as SeaTableTable[]
                    const meta = await this.limiter.schedule(() => this.externalHttp.get('/metadata'))
                    return this.extractTablesFromMetadata((meta as any).data)
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.get('/metadata/tables'))
                            return ((res as any).data.tables as SeaTableTable[]) || []
                        } catch (err3) {
                            logAxiosError(err3, 'listTables')
                            throw toCodedAxiosError(err3, 'listTables')
                        }
                    }
                    logAxiosError(err2, 'listTables')
                    throw toCodedAxiosError(err2, 'listTables')
                }
            }
            logAxiosError(error, 'listTables')
            throw toCodedAxiosError(error, 'listTables')
        }
    }

    async getMetadata(): Promise<any> {
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.get('/metadata'))
            return (res as any).data
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.get('/metadata'))
                    return (res as any).data
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.get('/metadata'))
                            return (res as any).data
                        } catch (err3) {
                            logAxiosError(err3, 'getMetadata')
                            throw toCodedAxiosError(err3, 'getMetadata')
                        }
                    }
                    logAxiosError(err2, 'getMetadata')
                    throw toCodedAxiosError(err2, 'getMetadata')
                }
            }
            logAxiosError(error, 'getMetadata')
            throw toCodedAxiosError(error, 'getMetadata')
        }
    }

    async listRows(query: ListRowsQuery): Promise<ListRowsResponse> {
        const parsed = ListRowsQuerySchema.parse(query)
        const params = { ...parsed, table_name: parsed.table }
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.get('/rows/', { params }))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.get('/rows/', { params }))
                    return (res as any).data as ListRowsResponse
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.get('/rows/', { params }))
                            return (res as any).data as ListRowsResponse
                        } catch (err3) {
                            logAxiosError(err3, 'listRows')
                            throw toCodedAxiosError(err3, 'listRows')
                        }
                    }
                    logAxiosError(err2, 'listRows')
                    throw toCodedAxiosError(err2, 'listRows')
                }
            }
            logAxiosError(error, 'listRows')
            throw toCodedAxiosError(error, 'listRows')
        }
    }

    async getRow(table: string, rowId: string): Promise<SeaTableRow> {
        const params = { table_name: table }
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.get(`/rows/${rowId}/`, { params }))
            return (res as any).data as SeaTableRow
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.get(`/rows/${rowId}/`, { params }))
                    return (res as any).data as SeaTableRow
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.get(`/rows/${rowId}/`, { params: { table, table_name: table } }))
                            return (res as any).data as SeaTableRow
                        } catch (err3) {
                            logAxiosError(err3, 'getRow')
                            throw toCodedAxiosError(err3, 'getRow')
                        }
                    }
                    logAxiosError(err2, 'getRow')
                    throw toCodedAxiosError(err2, 'getRow')
                }
            }
            logAxiosError(error, 'getRow')
            throw toCodedAxiosError(error, 'getRow')
        }
    }

    async addRow(table: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        const body = { table_name: table, row }
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.post('/rows/', body))
            return (res as any).data as SeaTableRow
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.post('/rows/', body))
                    return (res as any).data as SeaTableRow
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.post('/rows/', body))
                            return (res as any).data as SeaTableRow
                        } catch (err3) {
                            logAxiosError(err3, 'addRow')
                            throw toCodedAxiosError(err3, 'addRow')
                        }
                    }
                    logAxiosError(err2, 'addRow')
                    throw toCodedAxiosError(err2, 'addRow')
                }
            }
            logAxiosError(error, 'addRow')
            throw toCodedAxiosError(error, 'addRow')
        }
    }

    async updateRow(table: string, rowId: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        const bodyV1 = { table_name: table, row_id: rowId, row }
        const bodyV2 = { table_name: table, row }
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.put(`/rows/${rowId}/`, bodyV2))
            return (res as any).data as SeaTableRow
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.put(`/rows/${rowId}/`, bodyV2))
                    return (res as any).data as SeaTableRow
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.put(`/rows/`, bodyV1))
                            return (res as any).data as SeaTableRow
                        } catch (err3) {
                            logAxiosError(err3, 'updateRow')
                            throw toCodedAxiosError(err3, 'updateRow')
                        }
                    }
                    logAxiosError(err2, 'updateRow')
                    throw toCodedAxiosError(err2, 'updateRow')
                }
            }
            logAxiosError(error, 'updateRow')
            throw toCodedAxiosError(error, 'updateRow')
        }
    }

    async deleteRow(table: string, rowId: string): Promise<{ success: boolean }> {
        const dataV1 = { table_name: table, row_id: rowId }
        const dataV2 = { table_name: table }
        try {
            await this.limiter.schedule(() => this.gatewayHttp.delete(`/rows/${rowId}/`, { data: dataV2 }))
            return { success: true }
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    await this.limiter.schedule(() => this.externalHttp.delete(`/rows/${rowId}/`, { data: dataV2 }))
                    return { success: true }
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            await this.limiter.schedule(() => this.http.delete(`/rows/`, { data: dataV1 }))
                            return { success: true }
                        } catch (err3) {
                            logAxiosError(err3, 'deleteRow')
                            throw toCodedAxiosError(err3, 'deleteRow')
                        }
                    }
                    logAxiosError(err2, 'deleteRow')
                    throw toCodedAxiosError(err2, 'deleteRow')
                }
            }
            logAxiosError(error, 'deleteRow')
            throw toCodedAxiosError(error, 'deleteRow')
        }
    }

    async searchRows(table: string, query: Record<string, unknown>): Promise<ListRowsResponse> {
        const body = { table, table_name: table, filter: query }
        try {
            const res = await this.limiter.schedule(() => this.gatewayHttp.post('/rows/filter', body))
            return (res as any).data as ListRowsResponse
        } catch (error) {
            if (this.shouldFallback(error)) {
                try {
                    const res = await this.limiter.schedule(() => this.externalHttp.post('/rows/filter', body))
                    return (res as any).data as ListRowsResponse
                } catch (err2) {
                    if (this.shouldFallback(err2)) {
                        try {
                            const res = await this.limiter.schedule(() => this.http.post('/rows/filter', body))
                            return (res as any).data as ListRowsResponse
                        } catch (err3) {
                            logAxiosError(err3, 'searchRows')
                            throw toCodedAxiosError(err3, 'searchRows')
                        }
                    }
                    logAxiosError(err2, 'searchRows')
                    throw toCodedAxiosError(err2, 'searchRows')
                }
            }
            logAxiosError(error, 'searchRows')
            throw toCodedAxiosError(error, 'searchRows')
        }
    }
}
