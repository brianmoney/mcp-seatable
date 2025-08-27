import axios, { AxiosError, AxiosInstance } from 'axios'

export type TokenInfo = {
    token: string
    expiresAt: number // epoch ms
}

export class TokenManager {
    private readonly http: AxiosInstance
    private readonly serverUrl: string
    private readonly apiToken: string
    private readonly baseUuid: string
    private current?: TokenInfo
    private refreshing?: Promise<string>

    constructor(opts: { serverUrl: string; apiToken: string; baseUuid: string; timeoutMs?: number }) {
        this.serverUrl = opts.serverUrl.replace(/\/$/, '')
        this.apiToken = opts.apiToken
        this.baseUuid = opts.baseUuid
        this.http = axios.create({ timeout: opts.timeoutMs ?? 15000 })
    }

    private isExpired(): boolean {
        if (!this.current) return true
        return Date.now() >= this.current.expiresAt
    }

    async getToken(): Promise<string> {
        if (!this.isExpired()) return this.current!.token
        return this.refresh()
    }

    async forceRefresh(): Promise<string> {
        return this.refresh(true)
    }

    private async refresh(force = false): Promise<string> {
        if (this.refreshing && !force) return this.refreshing
        this.refreshing = this.fetchNewToken()
        try {
            const t = await this.refreshing
            return t
        } finally {
            this.refreshing = undefined
        }
    }

    private async fetchNewToken(): Promise<string> {
        const url = `${this.serverUrl}/api/v2.1/dtables/${this.baseUuid}/access-token/`
        try {
            const res = await this.http.get(url, {
                headers: { Authorization: `Token ${this.apiToken}` },
            })
            const data: any = res.data || {}
            const token: string = data.access_token || data.token || ''
            // Try to infer expiry from various possible fields; default to 1 hour
            const now = Date.now()
            let expiresAt = now + 60 * 60 * 1000
            const seconds = data.expires_in ?? data.expire_in ?? data.ttl ?? data.exp
            if (typeof seconds === 'number') {
                expiresAt = now + seconds * 1000
            } else if (typeof data.expires_at === 'string') {
                const ts = Date.parse(data.expires_at)
                if (!Number.isNaN(ts)) expiresAt = ts
            }
            // Add a small safety margin to avoid edge expirations
            expiresAt -= 60 * 1000
            if (!token) throw new Error('Token exchange response missing access token')
            this.current = { token, expiresAt }
            return token
        } catch (err) {
            const e = err as AxiosError
            const status = e.response?.status
            const msg = `Failed to exchange base token (${status ?? 'no-status'})`
            throw new Error(msg)
        }
    }
}
