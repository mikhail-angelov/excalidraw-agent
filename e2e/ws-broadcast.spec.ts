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

test('WebSocket receives element_created broadcast', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { 'Cookie': 'mcp_sid=ws-test' } })
  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))
  while (messages.length < 1 || messages[0].type !== 'initial_elements') await new Promise(r => setTimeout(r, 50))

  model.addElement(SID, { type: 'rectangle', x: 100, y: 100, width: 200, height: 80, text: 'CEO' })
  while (!messages.find((m: any) => m.type === 'element_created'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'element_created').element.text).toBe('CEO')
  ws.close()
})

test('WebSocket receives batch_created and element_updated', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { 'Cookie': 'mcp_sid=ws-test' } })
  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))
  while (messages.length < 1 || messages[0].type !== 'initial_elements') await new Promise(r => setTimeout(r, 50))

  model.batchAddElements(SID, [
    { id: 'a', type: 'rectangle', x: 50, y: 50, width: 120, height: 60, text: 'A' },
    { id: 'b', type: 'rectangle', x: 250, y: 50, width: 120, height: 60, text: 'B' },
  ])
  while (!messages.find((m: any) => m.type === 'batch_created'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'batch_created').elements.length).toBe(2)

  model.updateElement(SID, 'a', { text: 'Updated A' })
  while (!messages.find((m: any) => m.type === 'element_updated'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'element_updated').element.text).toBe('Updated A')
  ws.close()
})

test('WebSocket receives delete and clear events', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { 'Cookie': 'mcp_sid=ws-test' } })
  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))
  while (messages.length < 1 || messages[0].type !== 'initial_elements') await new Promise(r => setTimeout(r, 50))

  const el = model.addElement(SID, { type: 'rectangle', x: 10, y: 10 })
  while (!messages.find((m: any) => m.type === 'element_created'))
    await new Promise(r => setTimeout(r, 50))

  model.removeElement(SID, el.id)
  while (!messages.find((m: any) => m.type === 'element_deleted'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'element_deleted').id).toBe(el.id)

  model.clearSession(SID)
  while (!messages.find((m: any) => m.type === 'canvas_cleared'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'canvas_cleared')).toBeTruthy()
  ws.close()
})
