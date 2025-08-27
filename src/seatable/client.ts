import axios, { AxiosError, AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import { z } from 'zod'

import { getEnv } from '../config/env.js'
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

    constructor() {
        const env = getEnv()
        this.http = axios.create({
            baseURL: `${env.SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${env.SEATABLE_BASE_UUID}`,
            timeout: Number(env.HTTP_TIMEOUT_MS ?? 15000),
            headers: {
                Authorization: `Token ${env.SEATABLE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        })

        axiosRetry(this.http, {
            retries: 3,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error: AxiosError) => {
                const status = error.response?.status
                return [408, 429, 500, 502, 503, 504].includes(status ?? 0)
            },
        })
    }

    async listTables(): Promise<SeaTableTable[]> {
        try {
            const res = await this.http.get('/metadata/tables')
            return res.data.tables as SeaTableTable[]
        } catch (error) {
            logAxiosError(error, 'listTables')
            throw error
        }
    }

    async listRows(query: ListRowsQuery): Promise<ListRowsResponse> {
        const parsed = ListRowsQuerySchema.parse(query)
        try {
            const res = await this.http.get('/rows/', { params: parsed })
            return res.data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'listRows')
            throw error
        }
    }

    async getRow(table: string, rowId: string): Promise<SeaTableRow> {
        try {
            const res = await this.http.get(`/rows/${rowId}`, { params: { table } })
            return res.data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'getRow')
            throw error
        }
    }

    async addRow(table: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.http.post('/rows/', { table, row })
            return res.data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'addRow')
            throw error
        }
    }

    async updateRow(table: string, rowId: string, row: Record<string, unknown>): Promise<SeaTableRow> {
        try {
            const res = await this.http.put(`/rows/${rowId}`, { table, row })
            return res.data as SeaTableRow
        } catch (error) {
            logAxiosError(error, 'updateRow')
            throw error
        }
    }

    async deleteRow(table: string, rowId: string): Promise<{ success: boolean }> {
        try {
            await this.http.delete(`/rows/${rowId}`, { data: { table } })
            return { success: true }
        } catch (error) {
            logAxiosError(error, 'deleteRow')
            throw error
        }
    }

    async searchRows(table: string, query: Record<string, unknown>): Promise<ListRowsResponse> {
        try {
            const res = await this.http.post('/rows/filter', { table, filter: query })
            return res.data as ListRowsResponse
        } catch (error) {
            logAxiosError(error, 'searchRows')
            throw error
        }
    }
}
