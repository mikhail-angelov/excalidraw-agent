import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const WS = 'ws://localhost:3000'
const SID = { 'X-Session-Id': 'test-session' }
const JSON_H = { 'Content-Type': 'application/json', ...SID }

test.beforeEach(async () => {
  const ok = await fetch(`${BASE}/health`).then(r => r.ok).catch(() => false)
  if (!ok) throw new Error('Server not available')
  await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })
})

test('WebSocket receives element_created broadcast', async () => {
  // Use dynamic import that resolves to the ws library (not DOM)
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`${WS}`, { headers: { 'X-Session-Id': 'test-session' } })

  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))

  // Wait for init
  while (messages.length < 1) await new Promise(r => setTimeout(r, 50))

  // Create element
  await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'rectangle', x: 100, y: 100, width: 200, height: 80, text: 'CEO' })
  })

  // Wait for element_created
  while (messages.length < 2) await new Promise(r => setTimeout(r, 50))

  const created = messages.find((m: any) => m.type === 'element_created')
  expect(created).toBeTruthy()
  expect(created.element.text).toBe('CEO')

  ws.close()
})

test('WebSocket receives batch_created and element_updated', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`${WS}`, { headers: { 'X-Session-Id': 'test-session' } })

  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))
  while (messages.length < 1) await new Promise(r => setTimeout(r, 50))

  await fetch(`${BASE}/api/elements/batch`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ elements: [
      { id: 'a', type: 'rectangle', x: 50, y: 50, width: 120, height: 60, text: 'A' },
      { id: 'b', type: 'rectangle', x: 250, y: 50, width: 120, height: 60, text: 'B' },
    ]})
  })

  while (!messages.find((m: any) => m.type === 'batch_created'))
    await new Promise(r => setTimeout(r, 50))

  await fetch(`${BASE}/api/elements/a`, {
    method: 'PUT', headers: JSON_H,
    body: JSON.stringify({ text: 'Updated A' })
  })

  while (!messages.find((m: any) => m.type === 'element_updated'))
    await new Promise(r => setTimeout(r, 50))

  expect(messages.find((m: any) => m.type === 'element_updated').element.text).toBe('Updated A')
  ws.close()
})

test('WebSocket receives canvas_cleared and element_deleted', async () => {
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`${WS}`, { headers: { 'X-Session-Id': 'test-session' } })

  const messages: any[] = []
  ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())))
  await new Promise<void>(r => ws.on('open', r))
  while (messages.length < 1) await new Promise(r => setTimeout(r, 50))

  // Create
  const { element } = await (await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  })).json()
  while (!messages.find((m: any) => m.type === 'element_created'))
    await new Promise(r => setTimeout(r, 50))

  // Delete
  await fetch(`${BASE}/api/elements/${element.id}`, { method: 'DELETE', headers: SID })
  while (!messages.find((m: any) => m.type === 'element_deleted'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'element_deleted').id).toBe(element.id)

  // Clear
  await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })
  while (!messages.find((m: any) => m.type === 'canvas_cleared'))
    await new Promise(r => setTimeout(r, 50))
  expect(messages.find((m: any) => m.type === 'canvas_cleared')).toBeTruthy()

  ws.close()
})
