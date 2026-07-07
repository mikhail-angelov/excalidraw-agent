import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { agent } from './agent.js'

const PORT = process.env.PORT || 3000
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// === Session isolation ===
const sessions = new Map<string, Map<string, any>>()
const wsBySession = new Map<string, Set<any>>()

function sessionId(req: any): string {
  return req.headers['x-session-id'] as string || 'default'
}

function getElements(sid: string): Map<string, any> {
  if (!sessions.has(sid)) sessions.set(sid, new Map())
  return sessions.get(sid)!
}

function broadcast(sid: string, msg: any) {
  const data = JSON.stringify(msg)
  const clients = wsBySession.get(sid)
  if (clients) clients.forEach((c: any) => c.readyState === 1 && c.send(data))
}

wss.on('connection', (ws: any, req: any) => {
  const sid = req.headers['x-session-id'] as string || 'default'
  if (!wsBySession.has(sid)) wsBySession.set(sid, new Set())
  wsBySession.get(sid)!.add(ws)
  ws.send(JSON.stringify({ type: 'init', elements: [...getElements(sid).values()] }))
  ws.on('close', () => {
    wsBySession.get(sid)?.delete(ws)
    if (wsBySession.get(sid)?.size === 0) wsBySession.delete(sid)
  })
})

// === REST API (internal, used by agent tools) ===
app.get('/api/elements', (req, res) => {
  const els = getElements(sessionId(req))
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

app.post('/api/elements', (req, res) => {
  const els = getElements(sessionId(req))
  const el: any = { id: crypto.randomUUID(), ...req.body }
  if (el.type === 'arrow' || el.type === 'line') resolveArrow(el, els)
  els.set(el.id, el)
  broadcast(sessionId(req), { type: 'element_created', element: el })
  res.json({ element: el })
})

app.put('/api/elements/:id', (req, res) => {
  const els = getElements(sessionId(req))
  const el = els.get(req.params.id)
  if (!el) return void res.status(404).json({ error: 'not found' })
  const updated = { ...el, ...req.body, id: el.id }
  els.set(el.id, updated)
  broadcast(sessionId(req), { type: 'element_updated', element: updated })
  res.json({ element: updated })
})

app.delete('/api/elements/:id', (req, res) => {
  const els = getElements(sessionId(req))
  if (!els.has(req.params.id)) return void res.status(404).json({ error: 'not found' })
  els.delete(req.params.id)
  broadcast(sessionId(req), { type: 'element_deleted', id: req.params.id })
  res.json({ success: true })
})

app.post('/api/elements/batch', (req, res) => {
  const els = getElements(sessionId(req))
  const created = (req.body.elements || []).map((el: any) => {
    const full = { id: crypto.randomUUID(), ...el }
    if (full.type === 'arrow' || full.type === 'line') resolveArrow(full, els)
    els.set(full.id, full)
    return full
  })
  broadcast(sessionId(req), { type: 'batch_created', elements: created })
  res.json({ elements: created, count: created.length })
})

// === User-facing API ===
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/clear', (req, res) => {
  const els = getElements(sessionId(req))
  const count = els.size
  els.clear()
  broadcast(sessionId(req), { type: 'canvas_cleared' })
  res.json({ cleared: count })
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
const staticDir = path.join(__dirname, '../dist/ui')
app.use(express.static(staticDir))
app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')))

server.listen(Number(PORT), () => console.log(`Canvas on http://localhost:${PORT}`))

// Arrow binding
function resolveArrow(arrow: any, allElements: Map<string, any>) {
  const startId = arrow.startElementId || arrow.start?.id
  const endId = arrow.endElementId || arrow.end?.id
  const startEl = startId ? allElements.get(startId) : null
  const endEl = endId ? allElements.get(endId) : null
  const GAP = 8, defW = 100, defH = 60
  const sc = startEl
    ? { x: startEl.x + (startEl.width || defW) / 2, y: startEl.y + (startEl.height || defH) / 2 }
    : { x: arrow.x, y: arrow.y }
  const ec = endEl
    ? { x: endEl.x + (endEl.width || defW) / 2, y: endEl.y + (endEl.height || defH) / 2 }
    : { x: arrow.x + 120, y: arrow.y }
  const dx = ec.x - sc.x, dy = ec.y - sc.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  arrow.x = sc.x + (dx / dist) * GAP
  arrow.y = sc.y + (dy / dist) * GAP
  arrow.points = [[0, 0], [ec.x - (dx / dist) * GAP - arrow.x, ec.y - (dy / dist) * GAP - arrow.y]]
  arrow.start = { id: startId }
  arrow.end = { id: endId }
}
