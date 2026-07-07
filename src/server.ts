import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { agent } from './agent.js'
import { wsBySession, getSessionElements, clearSession, broadcast } from './model.js'

const PORT = process.env.PORT || 3000
const AGENT_TOKEN = process.env.AGENT_TOKEN || ''
const isProduction = process.env.NODE_ENV === 'production'
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

// Rate limiter state
const agentCalls = new Map<string, { count: number; resetAt: number }>()
const MAX_AGENT_CALLS = parseInt(process.env.MAX_AGENT_CALLS || '20', 10)
const RATE_WINDOW = 60_000 // 1 minute
const MAX_PROMPT_LENGTH = parseInt(process.env.MAX_PROMPT_LENGTH || '2000', 10)

// CORS — same-origin by default, whitelist via env
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

function sessionId(req: any): string {
  return req.cookies?.mcp_sid || req.headers['x-session-id'] as string || 'default'
}

function checkRateLimit(sid: string): boolean {
  const now = Date.now()
  const entry = agentCalls.get(sid)
  if (!entry || now > entry.resetAt) {
    agentCalls.set(sid, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= MAX_AGENT_CALLS) return false
  entry.count++
  return true
}

// WebSocket — sends initial_elements per session
wss.on('connection', (ws: any, req: any) => {
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/mcp_sid=([^;]+)/)
  const sid = match ? match[1] : (req.headers['x-session-id'] as string || 'default')
  if (!wsBySession.has(sid)) wsBySession.set(sid, new Set())
  wsBySession.get(sid)!.add(ws)
  ws.send(JSON.stringify({ type: 'initial_elements', elements: [...getSessionElements(sid).values()] }))
  ws.on('close', () => {
    wsBySession.get(sid)?.delete(ws)
    if (wsBySession.get(sid)?.size === 0) wsBySession.delete(sid)
  })
})

// Session cookie — secure for production
app.use((req, res, next) => {
  if (!req.cookies?.mcp_sid) {
    const sid = crypto.randomUUID()
    res.cookie('mcp_sid', sid, {
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    })
  }
  next()
})

// API
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/clear', (req, res) => {
  res.json({ cleared: clearSession(sessionId(req)) })
})

app.post('/api/agent', async (req, res) => {
  // AGENT_TOKEN guard
  if (AGENT_TOKEN) {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token as string
    if (token !== AGENT_TOKEN) return void res.status(401).json({ error: 'unauthorized' })
  }

  const { prompt } = req.body
  if (!prompt) return void res.status(400).json({ error: 'prompt required' })
  if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
    return void res.status(400).json({ error: `prompt too long (max ${MAX_PROMPT_LENGTH})` })
  }

  const sid = sessionId(req)
  if (!checkRateLimit(sid)) return void res.status(429).json({ error: 'rate limit exceeded' })

  try {
    const result = await agent(prompt, sid)
    // Broadcast updated scene to browser after agent completes
    broadcast(sid, {
      type: 'scene_updated',
      elements: [...getSessionElements(sid).values()],
    })
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static UI
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(path.join(__dirname, '../dist/ui')))

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/ui', 'index.html'))
})

server.listen(Number(PORT), () => console.log(`Canvas on http://localhost:${PORT}`))
