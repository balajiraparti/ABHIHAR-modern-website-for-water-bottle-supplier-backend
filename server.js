import http from 'http'
import { createHmac, timingSafeEqual, randomBytes, pbkdf2Sync } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = value.replace(/^"|"$/g, '')
  })
}

loadEnv()

const PORT = Number(process.env.PORT || 5174)
const JWT_SECRET = process.env.JWT_SECRET || ''
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'freegptmail1@gmail.com').toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || '1234'
const DB_NAME = process.env.DB_NAME || 'abhihar'

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,

})

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(input) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

function sign(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function createJwt(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = { ...payload, iat: now, exp: now + ttlSeconds, iss: 'abhihar-auth' }
  const headerEnc = base64UrlEncode(JSON.stringify(header))
  const payloadEnc = base64UrlEncode(JSON.stringify(body))
  const signature = sign(`${headerEnc}.${payloadEnc}`, secret)
  return { token: `${headerEnc}.${payloadEnc}.${signature}`, payload: body }
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function verifyJwt(token, secret) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerEnc, payloadEnc, signature] = parts
  const expected = sign(`${headerEnc}.${payloadEnc}`, secret)
  const sigA = Buffer.from(signature)
  const sigB = Buffer.from(expected)
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) return null
  const payload = JSON.parse(base64UrlDecode(payloadEnc))
  if (!payload?.exp) return null
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) return null
  return payload
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function send(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

function getToken(req) {
  const auth = req.headers.authorization || ''
  const [type, token] = auth.split(' ')
  if (type !== 'Bearer') return null
  return token
}

function parseItems(value) {
  if (Array.isArray(value)) return value
  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString('utf8'))
    } catch {
      return []
    }
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return []
    }
  }
  if (value && typeof value === 'object') {
    return Array.isArray(value) ? value : []
  }
  return []
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true })
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!JWT_SECRET) return send(res, 500, { error: 'JWT secret not configured' })
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    if (!email || !password) return send(res, 400, { error: 'Email and password required' })
    try {
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const [rows] = await pool.query('select id from users where email = ?', [email])
        let userId = rows?.[0]?.id
        if (!userId) {
          const salt = randomBytes(16).toString('hex')
          const hash = hashPassword(password, salt)
          const [result] = await pool.query(
            'insert into users (email, role, password_hash, password_salt) values (?, ?, ?, ?)',
            [email, 'admin', hash, salt]
          )
          userId = result.insertId
        } else {
          await pool.query('update users set role = ? where id = ?', ['admin', userId])
        }
        const { token, payload } = createJwt({ uid: userId, email, role: 'admin' }, JWT_SECRET)
        return send(res, 200, { token, user: { email: payload.email, role: payload.role, iat: payload.iat, exp: payload.exp } })
      }

      const [rows] = await pool.query('select id, email, role, password_hash, password_salt from users where email = ?', [email])
      const user = rows?.[0]
      if (!user) return send(res, 401, { error: 'Invalid credentials' })
      const computed = hashPassword(password, user.password_salt)
      if (computed !== user.password_hash) return send(res, 401, { error: 'Invalid credentials' })
      const role = user.role || 'user'
      const { token, payload } = createJwt({ uid: user.id, email, role }, JWT_SECRET)
      return send(res, 200, { token, user: { email: payload.email, role: payload.role, iat: payload.iat, exp: payload.exp } })
    } catch (e) {
      console.error('Login error', e)
      return send(res, 500, { error: 'Login failed' })
    }
  }

  if (url.pathname === '/api/signup' && req.method === 'POST') {
    if (!JWT_SECRET) return send(res, 500, { error: 'JWT secret not configured' })
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    if (!email || !password) return send(res, 400, { error: 'Email and password required' })
    if (password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' })
    const salt = randomBytes(16).toString('hex')
    const hash = hashPassword(password, salt)
    const role = email === ADMIN_EMAIL ? 'admin' : 'user'
    try {
      const [result] = await pool.query(
        'insert into users (email, role, password_hash, password_salt) values (?, ?, ?, ?)',
        [email, role, hash, salt]
      )
      const userId = result.insertId
      const { token, payload } = createJwt({ uid: userId, email, role }, JWT_SECRET)
      return send(res, 201, { token, user: { email: payload.email, role: payload.role, iat: payload.iat, exp: payload.exp } })
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Email already registered' })
      console.error('Signup error', e)
      return send(res, 500, { error: 'Sign up failed' })
    }
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    if (!JWT_SECRET) return send(res, 500, { error: 'JWT secret not configured' })
    const token = getToken(req)
    const payload = verifyJwt(token, JWT_SECRET)
    if (!payload) return send(res, 401, { error: 'Unauthorized' })
    return send(res, 200, { user: { email: payload.email, role: payload.role, iat: payload.iat, exp: payload.exp } })
  }

  if (url.pathname === '/api/orders') {
    if (!JWT_SECRET) return send(res, 500, { error: 'JWT secret not configured' })
    const token = getToken(req)
    const payload = verifyJwt(token, JWT_SECRET)
    if (!payload) return send(res, 401, { error: 'Unauthorized' })

    if (req.method === 'GET') {
      try {
        if (payload.role === 'admin') {
          const [rows] = await pool.query('select * from orders order by created_at desc')
          const orders = (rows || []).map((row) => ({ ...row, items: parseItems(row.items) }))
          return send(res, 200, { orders })
        }
        const [rows] = await pool.query('select * from orders where user_id = ? order by created_at desc', [payload.uid])
        const orders = (rows || []).map((row) => ({ ...row, items: parseItems(row.items) }))
        return send(res, 200, { orders })
      } catch (e) {
        console.error('Load orders error', e)
        return send(res, 500, { error: 'Failed to load orders' })
      }
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      const items = Array.isArray(body.items) ? body.items : null
      const total = Number(body.total)
      if (!items || !Number.isFinite(total)) {
        return send(res, 400, { error: 'Invalid order payload' })
      }
      try {
        const [result] = await pool.query(
          'insert into orders (user_id, email, items, total) values (?, ?, ?, ?)',
          [payload.uid, payload.email, JSON.stringify(items), total]
        )
        const [rows] = await pool.query('select * from orders where id = ?', [result.insertId])
        const order = rows?.[0] ? { ...rows[0], items: parseItems(rows[0].items) } : null
        return send(res, 201, { order })
      } catch (e) {
        console.error('Create order error', e)
        return send(res, 500, { error: 'Failed to create order' })
      }
    }
  }

  if (url.pathname.startsWith('/api/orders/') && req.method === 'DELETE') {
    if (!JWT_SECRET) return send(res, 500, { error: 'JWT secret not configured' })
    const token = getToken(req)
    const payload = verifyJwt(token, JWT_SECRET)
    if (!payload) return send(res, 401, { error: 'Unauthorized' })
    if (payload.role !== 'admin') return send(res, 403, { error: 'Forbidden' })
    const orderId = Number(url.pathname.split('/').pop())
    if (!Number.isFinite(orderId)) return send(res, 400, { error: 'Invalid order id' })
    try {
      await pool.query('delete from orders where id = ?', [orderId])
      return send(res, 200, { ok: true })
    } catch (e) {
      console.error('Delete order error', e)
      return send(res, 500, { error: 'Failed to delete order' })
    }
  }

  return send(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`)
})
