import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 3000
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// In-memory state
const elements = new Map()
const wsClients = new Set()

wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.send(JSON.stringify({ type: 'init', elements: [...elements.values()] }))
  ws.on('close', () => wsClients.delete(ws))
})

function broadcast(msg) {
  const data = JSON.stringify(msg)
  wsClients.forEach(c => c.readyState === 1 && c.send(data))
}

// GET /api/elements — list all (+ optional bbox filter)
app.get('/api/elements', (req, res) => {
  let result = [...elements.values()]

  // Bounding box filter: ?x_min=&x_max=&y_min=&y_max=
  const { x_min, x_max, y_min, y_max } = req.query
  if (x_min || x_max || y_min || y_max) {
    const xMin = x_min ? Number(x_min) : -Infinity
    const xMax = x_max ? Number(x_max) : Infinity
    const yMin = y_min ? Number(y_min) : -Infinity
    const yMax = y_max ? Number(y_max) : Infinity
    result = result.filter(el =>
      el.x >= xMin && el.x <= xMax &&
      el.y >= yMin && el.y <= yMax
    )
  }

  res.json({ elements: result, count: result.length })
})

// POST /api/elements — create
app.post('/api/elements', (req, res) => {
  const el = { id: crypto.randomUUID(), ...req.body }
  elements.set(el.id, el)
  broadcast({ type: 'element_created', element: el })
  res.json({ element: el })
})

// PUT /api/elements/:id — update
app.put('/api/elements/:id', (req, res) => {
  const el = elements.get(req.params.id)
  if (!el) return res.status(404).json({ error: 'not found' })
  const updated = { ...el, ...req.body, id: el.id }
  elements.set(el.id, updated)
  broadcast({ type: 'element_updated', element: updated })
  res.json({ element: updated })
})

// DELETE /api/elements/:id
app.delete('/api/elements/:id', (req, res) => {
  if (!elements.has(req.params.id))
    return res.status(404).json({ error: 'not found' })
  elements.delete(req.params.id)
  broadcast({ type: 'element_deleted', id: req.params.id })
  res.json({ success: true })
})

// POST /api/elements/batch — batch create
app.post('/api/elements/batch', (req, res) => {
  const created = (req.body.elements || []).map(el => {
    const full = { id: crypto.randomUUID(), ...el }
    elements.set(full.id, full)
    return full
  })
  broadcast({ type: 'batch_created', elements: created })
  res.json({ elements: created, count: created.length })
})

// DELETE /api/elements — clear all
app.delete('/api/elements', (_, res) => {
  const count = elements.size
  elements.clear()
  broadcast({ type: 'canvas_cleared' })
  res.json({ cleared: count })
})

server.listen(PORT, () => console.log(`Canvas on http://localhost:${PORT}`))
