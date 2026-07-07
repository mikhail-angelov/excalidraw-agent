import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import { setTimeout } from 'timers/promises'

const BASE = 'http://localhost:3000'
const SID = { 'X-Session-Id': 'test-session' }
const JSON_H = { 'Content-Type': 'application/json', ...SID }

let serverProcess: any

test.beforeAll(async () => {
  serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    env: { ...process.env, PORT: '3000' },
    stdio: 'pipe',
    shell: true
  })
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) break
    } catch {}
    await setTimeout(500)
  }
})

test.afterAll(() => {
  if (serverProcess) serverProcess.kill()
})

test.beforeEach(async () => {
  await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })
})

test('canvas loads in browser', async ({ page }) => {
  await page.goto('/')
  // Page renders without an error
  await expect(page.locator('body')).not.toHaveText(/Error|404|Cannot GET/, { timeout: 10000 })
})

test('REST API creates and reads elements', async () => {
  const res = await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'Hello' })
  })
  expect(res.ok).toBe(true)
  const el = (await res.json()).element
  expect(el.id).toBeTruthy()

  const list = await (await fetch(`${BASE}/api/elements`, { headers: SID })).json()
  expect(list.count).toBe(1)
  expect(list.elements[0].text).toBe('Hello')
})

test('REST API batch creates elements', async () => {
  const res = await fetch(`${BASE}/api/elements/batch`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ elements: [
      { type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'A' },
      { type: 'rectangle', x: 200, y: 10, width: 100, height: 60, text: 'B' },
    ]})
  })
  expect((await res.json()).count).toBe(2)
})

test('creates arrow with binding', async () => {
  await fetch(`${BASE}/api/elements/batch`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ elements: [
      { id: 'box1', type: 'rectangle', x: 50, y: 50, width: 120, height: 60, text: 'A' },
      { id: 'box2', type: 'rectangle', x: 250, y: 50, width: 120, height: 60, text: 'B' },
    ]})
  })

  const arrow = (await (await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'arrow', startElementId: 'box1', endElementId: 'box2' })
  })).json()).element
  expect(arrow.start.id).toBe('box1')
  expect(arrow.end.id).toBe('box2')
  expect(arrow.points.length).toBe(2)
})

test('updates element', async () => {
  const { element } = await (await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'text', x: 10, y: 10, text: 'Old' })
  })).json()

  const updated = (await (await fetch(`${BASE}/api/elements/${element.id}`, {
    method: 'PUT', headers: JSON_H,
    body: JSON.stringify({ text: 'New' })
  })).json()).element
  expect(updated.text).toBe('New')
})

test('deletes element', async () => {
  const { element } = await (await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  })).json()

  const del = await fetch(`${BASE}/api/elements/${element.id}`, { method: 'DELETE', headers: SID })
  expect(del.ok).toBe(true)

  const list = await (await fetch(`${BASE}/api/elements`, { headers: SID })).json()
  expect(list.count).toBe(0)
})

test('clears canvas', async () => {
  await fetch(`${BASE}/api/elements`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  })
  const data = await (await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })).json()
  expect(data.cleared).toBe(1)
})

test('bbox filter works', async () => {
  await fetch(`${BASE}/api/elements/batch`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({ elements: [
      { type: 'rectangle', x: 10, y: 10, width: 50, height: 50 },
      { type: 'rectangle', x: 200, y: 200, width: 50, height: 50 },
    ]})
  })
  const data = await (await fetch(`${BASE}/api/elements?x_min=0&x_max=100&y_min=0&y_max=100`, { headers: SID })).json()
  expect(data.count).toBe(1)
})

test('health endpoint works', async () => {
  const res = await fetch(`${BASE}/health`)
  expect((await res.json()).status).toBe('ok')
})

test('POST /api/agent returns error without prompt', async () => {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST', headers: JSON_H,
    body: JSON.stringify({})
  })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('prompt required')
})
