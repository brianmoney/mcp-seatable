import { getEnv } from '../src/config/env.js'
import { TokenManager } from '../src/seatable/tokenManager.js'
import axios from 'axios'

async function main() {
  try {
    const env = getEnv()

    // Raw probe: call app-access-token with API-Token to see status/body (no secrets printed)
    try {
      const url = `${env.SEATABLE_SERVER_URL.replace(/\/$/, '')}/api/v2.1/dtable/app-access-token/?exp=1h`
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${env.SEATABLE_API_TOKEN}` }, validateStatus: () => true })
      console.log('[probe] app-access-token status', res.status, typeof res.data === 'string' ? res.data.slice(0, 120) : res.data)
    } catch (e: any) {
      console.error('[probe] app-access-token request error', e?.message)
    }

    const tm = new TokenManager({
      serverUrl: env.SEATABLE_SERVER_URL,
      apiToken: env.SEATABLE_API_TOKEN,
      baseUuid: env.SEATABLE_BASE_UUID,
      timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? 20000),
    })

    const token = await tm.getToken()
    const preview = `${token.slice(0, 6)}…${token.slice(-4)}`
    console.log('[probe] token exchange OK', {
      server: env.SEATABLE_SERVER_URL,
      base: env.SEATABLE_BASE_UUID,
      token_length: token.length,
      token_preview: preview,
    })

    // Validate metadata with Bearer on both v1 and v2.1
    const v1 = axios.create({
      baseURL: `${env.SEATABLE_SERVER_URL.replace(/\/$/, '')}/dtable-server/api/v1/dtables/${env.SEATABLE_BASE_UUID}`,
      timeout: Number(process.env.HTTP_TIMEOUT_MS ?? 20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    })

    const r1 = await v1.get('/metadata')
    if (r1.status >= 200 && r1.status < 300) {
      console.log('[probe] metadata (v1) OK', { tables: Array.isArray(r1.data?.tables) ? r1.data.tables.length : undefined })
    } else {
      console.error('[probe] metadata (v1) FAILED', r1.status, typeof r1.data === 'string' ? r1.data.slice(0, 200) : r1.data)
    }

    const v21 = axios.create({
      baseURL: `${env.SEATABLE_SERVER_URL.replace(/\/$/, '')}/api/v2.1/dtables/${env.SEATABLE_BASE_UUID}`,
      timeout: Number(process.env.HTTP_TIMEOUT_MS ?? 20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    })

    const r21 = await v21.get('/metadata')
    if (r21.status >= 200 && r21.status < 300) {
      console.log('[probe] metadata (v2.1) OK', { ok: !!r21.data })
    } else {
      console.error('[probe] metadata (v2.1) FAILED', r21.status, typeof r21.data === 'string' ? r21.data.slice(0, 200) : r21.data)
    }

    // API Gateway v2 probe
    const gw = axios.create({
      baseURL: `${env.SEATABLE_SERVER_URL.replace(/\/$/, '')}/api-gateway/api/v2/dtables/${env.SEATABLE_BASE_UUID}`,
      timeout: Number(process.env.HTTP_TIMEOUT_MS ?? 20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    })

    const rgwMeta = await gw.get('/metadata')
    if (rgwMeta.status >= 200 && rgwMeta.status < 300) {
      console.log('[probe] metadata (gateway v2) OK', { tables: Array.isArray(rgwMeta.data?.tables) ? rgwMeta.data.tables.length : undefined })
    } else {
      console.error('[probe] metadata (gateway v2) FAILED', rgwMeta.status, typeof rgwMeta.data === 'string' ? rgwMeta.data.slice(0, 200) : rgwMeta.data)
    }

    const rgwTables = await gw.get('/metadata/tables')
    if (rgwTables.status >= 200 && rgwTables.status < 300) {
      console.log('[probe] metadata/tables (gateway v2) OK', { tables: Array.isArray(rgwTables.data?.tables) ? rgwTables.data.tables.length : undefined })
    } else {
      console.error('[probe] metadata/tables (gateway v2) FAILED', rgwTables.status, typeof rgwTables.data === 'string' ? rgwTables.data.slice(0, 200) : rgwTables.data)
    }
  } catch (err: any) {
    console.error('[probe] token exchange FAILED', err?.message)
    if (err?.response) {
      console.error('status', err.response.status)
      console.error('data', err.response.data)
    }
  }
}

main()
