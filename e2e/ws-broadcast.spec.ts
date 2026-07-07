import { test, expect } from '@playwright/test'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'

let model: any
let server: any
let wss: any
const PORT = 3097
const SID = 'ws-test'

test.beforeAll(async () => {
  model = await import('../src/model.ts')
  const app = (await import('express')).default()
  server = createServer(app)
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws: any, req: any) => {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/mcp_sid=([^;]+)/)
    const sid = match ? match[1] : 'default'
    if (!model.wsBySession.has(sid)) model.wsBySession.set(sid, new Set())
    model.wsBySession.get(sid)!.add(ws)
    ws.send(JSON.stringify({ type: 'initial_elements', elements: [...model.getSessionElements(sid).values()] }))
    ws.on('close', () => {
      model.wsBySession.get(sid)?.delete(ws)
      if (model.wsBySession.get(sid)?.size === 0) model.wsBySession.delete(sid)
    })
  })

  await new Promise<void>(r => server.listen(PORT, r))
})

test.beforeEach(() => model.clearSession(SID))
test.afterAll(() => { server?.close(); wss?.close() })

test('WebSocket receives initial_elements on connect', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { 'Cookie': 'mcp_sid=ws-test' } })
  const msg = await new Promise<any>((resolve) => {
    ws.on('message', (data: Buffer) => resolve(JSON.parse(data.toString())))
  })
  expect(msg.type).toBe('initial_elements')
  expect(msg.elements).toEqual([])
  ws.close()
})

test('WebSocket receives canvas_cleared', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { 'Cookie': 'mcp_sid=ws-test' } })
  await new Promise<void>(r => ws.on('open', r))

  // Clear the session — broadcasts canvas_cleared
  model.clearSession(SID)
  const msg = await new Promise<any>((resolve) => {
    ws.on('message', (data: Buffer) => {
      const parsed = JSON.parse(data.toString())
      if (parsed.type === 'canvas_cleared') resolve(parsed)
    })
  })
  expect(msg.type).toBe('canvas_cleared')
  ws.close()
})

test('model operations work without WS broadcasts', async () => {
  // Elements are stored in model; UI loads them via initial_elements on WS connect
  const el = model.addElement(SID, { type: 'rectangle', x: 100, y: 100, width: 200, height: 80, text: 'CEO' })
  expect(el.type).toBe('rectangle')
  expect(el.text).toBe('CEO')

  const got = model.getElement(SID, el.id)
  expect(got.id).toBe(el.id)

  model.updateElement(SID, el.id, { text: 'Updated' })
  expect(model.getElement(SID, el.id).text).toBe('Updated')

  model.removeElement(SID, el.id)
  expect(model.getElement(SID, el.id)).toBeNull()
})
