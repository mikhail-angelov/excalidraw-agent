import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'

const PORT = process.env.PORT || 3000
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// In-memory state
const elements = new Map<string, any>()
const wsClients = new Set<any>()

wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.send(JSON.stringify({ type: 'init', elements: [...elements.values()] }))
  ws.on('close', () => wsClients.delete(ws))
})

function broadcast(msg: any) {
  const data = JSON.stringify(msg)
  wsClients.forEach(c => c.readyState === 1 && c.send(data))
}

// GET /api/elements — list all (+ optional bbox filter)
app.get('/api/elements', (req, res) => {
  let result = [...elements.values()]

  const { x_min, x_max, y_min, y_max } = req.query as Record<string, string | undefined>
  if (x_min || x_max || y_min || y_max) {
    const xMin = x_min ? Number(x_min) : -Infinity
    const xMax = x_max ? Number(x_max) : Infinity
    const yMin = y_min ? Number(y_min) : -Infinity
    const yMax = y_max ? Number(y_max) : Infinity
    result = result.filter((el: any) =>
      el.x >= xMin && el.x <= xMax &&
      el.y >= yMin && el.y <= yMax
    )
  }

  res.json({ elements: result, count: result.length })
})

// POST /api/elements — create
app.post('/api/elements', (req, res) => {
  const el: any = { id: crypto.randomUUID(), ...req.body }

  if (el.type === 'arrow' || el.type === 'line') {
    resolveArrow(el, elements)
  }

  elements.set(el.id, el)
  broadcast({ type: 'element_created', element: el })
  res.json({ element: el })
})

// PUT /api/elements/:id — update
app.put('/api/elements/:id', (req, res) => {
  const el = elements.get(req.params.id)
  if (!el) return void res.status(404).json({ error: 'not found' })
  const updated = { ...el, ...req.body, id: el.id }
  elements.set(el.id, updated)
  broadcast({ type: 'element_updated', element: updated })
  res.json({ element: updated })
})

// DELETE /api/elements/:id
app.delete('/api/elements/:id', (req, res) => {
  if (!elements.has(req.params.id))
    return void res.status(404).json({ error: 'not found' })
  elements.delete(req.params.id)
  broadcast({ type: 'element_deleted', id: req.params.id })
  res.json({ success: true })
})

// POST /api/elements/batch — batch create
app.post('/api/elements/batch', (req, res) => {
  const created = (req.body.elements || []).map((el: any) => {
    const full = { id: crypto.randomUUID(), ...el }
    if (full.type === 'arrow' || full.type === 'line') {
      resolveArrow(full, elements)
    }
    elements.set(full.id, full)
    return full
  })
  broadcast({ type: 'batch_created', elements: created })
  res.json({ elements: created, count: created.length })
})

// DELETE /api/elements — clear all
app.delete('/api/elements', (_req, res) => {
  const count = elements.size
  elements.clear()
  broadcast({ type: 'canvas_cleared' })
  res.json({ cleared: count })
})

// GET /api/health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', elements: elements.size })
})

// Serve static frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const staticDir = path.join(__dirname, '../dist/ui')
app.use(express.static(staticDir))
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'))
})

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
