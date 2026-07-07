import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { agent } from './agent.js'
import { wsBySession, getSessionElements, clearSession } from './model.js'

const PORT = process.env.PORT || 3000
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())

function sessionId(req: any): string {
  // Cookie takes priority, then header, then default
  return req.cookies?.mcp_sid || req.headers['x-session-id'] as string || 'default'
}

// WebSocket per session — reads cookie from upgrade request
wss.on('connection', (ws: any, req: any) => {
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/mcp_sid=([^;]+)/)
  const sid = match ? match[1] : 'default'

  if (!wsBySession.has(sid)) wsBySession.set(sid, new Set())
  wsBySession.get(sid)!.add(ws)
  ws.send(JSON.stringify({ type: 'initial_elements', elements: [...getSessionElements(sid).values()] }))
  ws.on('close', () => {
    wsBySession.get(sid)?.delete(ws)
    if (wsBySession.get(sid)?.size === 0) wsBySession.delete(sid)
  })
})

// Set session cookie before anything
app.use((req, res, next) => {
  if (!req.cookies?.mcp_sid) {
    const sid = crypto.randomUUID().slice(0, 8)
    res.cookie('mcp_sid', sid, { maxAge: 86400000, httpOnly: false, sameSite: 'lax' })
  }
  next()
})

// User-facing API
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/clear', (req, res) => {
  res.json({ cleared: clearSession(sessionId(req)) })
})

app.post('/api/agent', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return void res.status(400).json({ error: 'prompt required' })
  const sid = sessionId(req)
  try {
    const result = await agent(prompt, sid)
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
