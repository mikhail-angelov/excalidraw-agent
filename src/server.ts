import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { agent } from './agent.js'
import { sessions, wsBySession, getSessionElements, broadcast, addElement, updateElement, removeElement, batchAddElements, clearSession } from './model.js'

const PORT = process.env.PORT || 3000
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json({ limit: '10mb' }))

function sessionId(req: any): string {
  return req.headers['x-session-id'] as string || 'default'
}

// WebSocket per session
wss.on('connection', (ws: any, req: any) => {
  const sid = sessionId(req)
  if (!wsBySession.has(sid)) wsBySession.set(sid, new Set())
  wsBySession.get(sid)!.add(ws)
  ws.send(JSON.stringify({ type: 'init', elements: [...getSessionElements(sid).values()] }))
  ws.on('close', () => {
    wsBySession.get(sid)?.delete(ws)
    if (wsBySession.get(sid)?.size === 0) wsBySession.delete(sid)
  })
})

// === REST API ===
app.get('/api/elements', (req, res) => {
  const els = getSessionElements(sessionId(req))
  let result = [...els.values()]
  const { x_min, x_max, y_min, y_max } = req.query as any
  if (x_min || x_max || y_min || y_max) {
    const xMin = x_min ? Number(x_min) : -Infinity
    const xMax = x_max ? Number(x_max) : Infinity
    const yMin = y_min ? Number(y_min) : -Infinity
    const yMax = y_max ? Number(y_max) : Infinity
    result = result.filter((el: any) => el.x >= xMin && el.x <= xMax && el.y >= yMin && el.y <= yMax)
  }
  res.json({ elements: result, count: result.length })
})

app.post('/api/elements', (req, res) =>
  res.json({ element: addElement(sessionId(req), req.body) })
)

app.put('/api/elements/:id', (req, res) => {
  const el = updateElement(sessionId(req), req.params.id, req.body)
  if (!el) return void res.status(404).json({ error: 'not found' })
  res.json({ element: el })
})

app.delete('/api/elements/:id', (req, res) => {
  if (!removeElement(sessionId(req), req.params.id))
    return void res.status(404).json({ error: 'not found' })
  res.json({ success: true })
})

app.post('/api/elements/batch', (req, res) => {
  const created = batchAddElements(sessionId(req), req.body.elements || [])
  res.json({ elements: created, count: created.length })
})

// === User-facing API ===
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/clear', (req, res) => {
  res.json({ cleared: clearSession(sessionId(req)) })
})

app.post('/api/agent', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return void res.status(400).json({ error: 'prompt required' })
  try {
    const result = await agent(prompt, sessionId(req))
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static UI
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(path.join(__dirname, '../dist/ui')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../dist/ui', 'index.html')))

server.listen(Number(PORT), () => console.log(`Canvas on http://localhost:${PORT}`))
