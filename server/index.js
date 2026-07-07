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

// In-memory canvas state (one global session for simplicity)
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

// REST API — the only interface the agent needs
app.get('/api/elements', (_, res) =>
  res.json({ elements: [...elements.values()], count: elements.size })
)

app.post('/api/elements', (req, res) => {
  const el = { id: crypto.randomUUID(), ...req.body }
  elements.set(el.id, el)
  broadcast({ type: 'element_created', element: el })
  res.json({ element: el })
})

app.put('/api/elements/:id', (req, res) => {
  const el = elements.get(req.params.id)
  if (!el) return res.status(404).json({ error: 'not found' })
  const updated = { ...el, ...req.body, id: el.id }
  elements.set(el.id, updated)
  broadcast({ type: 'element_updated', element: updated })
  res.json({ element: updated })
})

app.delete('/api/elements/:id', (req, res) => {
  if (!elements.has(req.params.id))
    return res.status(404).json({ error: 'not found' })
  elements.delete(req.params.id)
  broadcast({ type: 'element_deleted', id: req.params.id })
  res.json({ success: true })
})

app.post('/api/elements/batch', (req, res) => {
  const created = (req.body.elements || []).map(el => {
    const full = { id: crypto.randomUUID(), ...el }
    elements.set(full.id, full)
    return full
  })
  broadcast({ type: 'batch_created', elements: created })
  res.json({ elements: created, count: created.length })
})

app.delete('/api/elements', (_, res) => {
  const count = elements.size
  elements.clear()
  broadcast({ type: 'canvas_cleared' })
  res.json({ cleared: count })
})

server.listen(PORT, () => console.log(`Canvas server on http://localhost:${PORT}`))
