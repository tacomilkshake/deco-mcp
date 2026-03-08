import forge from 'node-forge'
import * as crypto from 'crypto'

interface DecoSession {
  stok: string
  sysauth: string
  aesKey: string
  aesIv: string
  seq: number
  md5Hash: string
}

interface DecoApiResponse {
  error_code: number
  result?: unknown
  data?: string
}

export interface DecoClient {
  getClients(): Promise<ClientInfo[]>
  getDevices(): Promise<DeviceInfo[]>
  getWanStatus(): Promise<unknown>
  getPerformance(): Promise<unknown>
  getWifiStatus(): Promise<unknown>
}

export interface ClientInfo {
  mac: string
  name: string
  ip: string
  connection_type: string
  interface: string
  wire_type: string
  online: boolean
  up_speed: number
  down_speed: number
}

export interface DeviceInfo {
  mac: string
  role: string
  nickname: string
  hardware_ver: string
  software_ver: string
  inet_status: string
  connection_types: string[]
}

function generateAesKeyIv(): { key: string; iv: string } {
  const digits = '0123456789'
  let key = ''
  let iv = ''
  for (let i = 0; i < 16; i++) {
    key += digits[Math.floor(Math.random() * 10)]
    iv += digits[Math.floor(Math.random() * 10)]
  }
  return { key, iv }
}

function rsaEncrypt(data: string, n: string, e: string): string {
  const bigN = new forge.jsbn.BigInteger(n, 16)
  const bigE = new forge.jsbn.BigInteger(e, 16)
  const publicKey = forge.pki.rsa.setPublicKey(bigN, bigE)
  const keyByteLength = Math.ceil(bigN.bitLength() / 8)
  const maxChunkSize = keyByteLength - 11

  const dataBytes = forge.util.encodeUtf8(data)
  const chunks: string[] = []

  for (let i = 0; i < dataBytes.length; i += maxChunkSize) {
    const chunk = dataBytes.substring(i, i + maxChunkSize)
    const encrypted = publicKey.encrypt(chunk, 'RSAES-PKCS1-V1_5')
    chunks.push(forge.util.encode64(encrypted))
  }

  return chunks.join('')
}

function aesEncrypt(data: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8')
  )
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final()
  ])
  return encrypted.toString('base64')
}

function aesDecrypt(data: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8')
  )
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final()
  ])
  return decrypted.toString('utf8')
}

function decodeBase64(s: string): string {
  try {
    return Buffer.from(s, 'base64').toString('utf8')
  } catch {
    return s
  }
}

export async function createDecoClient(
  host: string,
  password: string,
  username: string = 'admin'
): Promise<DecoClient> {
  let session: DecoSession | null = null

  async function postForm(url: string, params: string): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    })
    const text = await response.text()
    console.log(`[DEBUG] POST ${url.replace(host, '')} status=${response.status} body=${text.substring(0, 500)}`)
    return JSON.parse(text)
  }

  async function authenticate(): Promise<void> {
    const keysUrl = `${host}/cgi-bin/luci/;stok=/login?form=keys`
    const keysResp = await postForm(keysUrl, 'operation=read') as DecoApiResponse
    if (keysResp.error_code !== 0) {
      throw new Error(`Failed to get RSA keys: error_code=${keysResp.error_code}`)
    }
    const keysResult = keysResp.result as { password: string[] }
    const [pwdN, pwdE] = keysResult.password
    if (!pwdN || !pwdE) throw new Error('Missing password RSA keys')

    const authUrl = `${host}/cgi-bin/luci/;stok=/login?form=auth`
    const authResp = await postForm(authUrl, 'operation=read') as DecoApiResponse
    if (authResp.error_code !== 0) {
      throw new Error(`Failed to get auth keys: error_code=${authResp.error_code}`)
    }
    const authResult = authResp.result as { key: string[]; seq: number }
    const [authN, authE] = authResult.key
    if (!authN || !authE) throw new Error('Missing auth RSA keys')
    const seq = authResult.seq

    const encryptedPassword = rsaEncrypt(password, pwdN, pwdE)
    const { key: aesKey, iv: aesIv } = generateAesKeyIv()

    const loginData = JSON.stringify({
      operation: 'login',
      params: {
        password: encryptedPassword
      }
    })

    const encryptedData = aesEncrypt(loginData, aesKey, aesIv)
    const md5Hash = crypto.createHash('md5').update(`${username}${password}`).digest('hex')
    const signData = `k=${aesKey}&i=${aesIv}&h=${md5Hash}&s=${seq + encryptedData.length}`
    const sign = rsaEncrypt(signData, authN, authE)

    const loginUrl = `${host}/cgi-bin/luci/;stok=/login?form=login`
    const loginResp = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `sign=${encodeURIComponent(sign)}&data=${encodeURIComponent(encryptedData)}`
    })

    const setCookie = loginResp.headers.get('set-cookie') ?? ''
    const sysauthMatch = setCookie.match(/sysauth=([^;]+)/)
    const sysauth = sysauthMatch?.[1] ?? ''

    const loginText = await loginResp.text()
    console.log(`[DEBUG] Login status=${loginResp.status} cookie=${setCookie.substring(0, 80)} body=${loginText.substring(0, 500)}`)
    const loginJson = JSON.parse(loginText) as DecoApiResponse
    if (loginJson.error_code !== 0) {
      throw new Error(`Login failed: error_code=${loginJson.error_code}`)
    }

    const loginResult = loginJson.result as { stok: string }
    const decryptedData = loginJson.data
      ? JSON.parse(aesDecrypt(loginJson.data, aesKey, aesIv)) as { result: { stok: string } }
      : null

    const stok = loginResult?.stok ?? decryptedData?.result?.stok ?? ''
    if (!stok) throw new Error('No stok token received')

    session = { stok, sysauth, aesKey, aesIv, seq, md5Hash }
  }

  async function request(path: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!session) await authenticate()
    if (!session) throw new Error('Not authenticated')

    const data = JSON.stringify(payload)
    const encryptedData = aesEncrypt(data, session.aesKey, session.aesIv)
    const keysUrl = `${host}/cgi-bin/luci/;stok=/login?form=auth`
    const authResp = await postForm(keysUrl, 'operation=read') as DecoApiResponse
    const authResult = authResp.result as { key: string[]; seq: number }
    const [authN, authE] = authResult.key
    if (!authN || !authE) throw new Error('Missing auth RSA keys')
    session.seq = authResult.seq

    const signDataUpdated = `h=${session.md5Hash}&s=${session.seq + encryptedData.length}`
    const sign = rsaEncrypt(signDataUpdated, authN, authE)

    const url = `${host}/cgi-bin/luci/;stok=${session.stok}/${path}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `sysauth=${session.sysauth}`
      },
      body: `sign=${encodeURIComponent(sign)}&data=${encodeURIComponent(encryptedData)}`
    })

    const respText = await resp.text()
    console.log(`[DEBUG] Request ${path} status=${resp.status} body=${respText.substring(0, 500)}`)
    const json = JSON.parse(respText) as DecoApiResponse

    if (json.error_code === -5) {
      session = null
      return request(path, payload)
    }

    if (json.error_code !== 0) {
      throw new Error(`API error on ${path}: error_code=${json.error_code}`)
    }

    if (json.data) {
      if (!session) throw new Error('Session lost during decryption')
      const decrypted = aesDecrypt(json.data, session.aesKey, session.aesIv)
      return JSON.parse(decrypted)
    }

    return json.result
  }

  async function ensureSession(): Promise<void> {
    if (!session) await authenticate()
  }

  return {
    async getClients(): Promise<ClientInfo[]> {
      await ensureSession()
      const resp = await request('admin/client?form=client_list', {
        operation: 'read',
        params: { device_mac: 'default' }
      }) as { result: { client_list: Array<Record<string, unknown>> } } | { client_list: Array<Record<string, unknown>> }

      const data = 'result' in resp ? resp.result : resp
      const clients = data.client_list ?? []

      return clients.map((c) => ({
        mac: String(c['mac'] ?? ''),
        name: decodeBase64(String(c['name'] ?? '')),
        ip: String(c['ip'] ?? ''),
        connection_type: String(c['connection_type'] ?? ''),
        interface: String(c['interface'] ?? ''),
        wire_type: String(c['wire_type'] ?? ''),
        online: Boolean(c['online']),
        up_speed: Number(c['up_speed'] ?? 0),
        down_speed: Number(c['down_speed'] ?? 0)
      }))
    },

    async getDevices(): Promise<DeviceInfo[]> {
      await ensureSession()
      const resp = await request('admin/device?form=device_list', {
        operation: 'read'
      }) as { result: { device_list: Array<Record<string, unknown>> } } | { device_list: Array<Record<string, unknown>> }

      const data = 'result' in resp ? resp.result : resp
      const devices = data.device_list ?? []

      return devices.map((d) => ({
        mac: String(d['mac'] ?? ''),
        role: String(d['role'] ?? ''),
        nickname: d['custom_nickname']
          ? decodeBase64(String(d['custom_nickname']))
          : decodeBase64(String(d['nickname'] ?? '')),
        hardware_ver: String(d['hardware_ver'] ?? ''),
        software_ver: String(d['software_ver'] ?? ''),
        inet_status: String(d['inet_status'] ?? ''),
        connection_types: Array.isArray(d['connection_type'])
          ? (d['connection_type'] as string[])
          : []
      }))
    },

    async getWanStatus(): Promise<unknown> {
      await ensureSession()
      return request('admin/network?form=wan_ipv4', { operation: 'read' })
    },

    async getPerformance(): Promise<unknown> {
      await ensureSession()
      return request('admin/network?form=performance', { operation: 'read' })
    },

    async getWifiStatus(): Promise<unknown> {
      await ensureSession()
      return request('admin/wireless?form=wlan', { operation: 'read' })
    }
  }
}
