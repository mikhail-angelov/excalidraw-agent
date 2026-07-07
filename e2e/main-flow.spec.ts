import { test, expect } from '@playwright/test'
import { execSync, spawn } from 'child_process'
import { setTimeout } from 'timers/promises'

// Start the canvas server before all tests
let serverProcess: any

test.beforeAll(async () => {
  serverProcess = spawn('node', ['src/server.ts'], {
    env: { ...process.env, PORT: '3000' },
    stdio: 'pipe'
  })
  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:3000/health')
      if (res.ok) break
    } catch {}
    await setTimeout(500)
  }
})

test.afterAll(() => {
  if (serverProcess) serverProcess.kill()
})

// Clean canvas before each test
test.beforeEach(async () => {
  await fetch('http://localhost:3000/api/elements', { method: 'DELETE' })
})

test('canvas loads in browser', async ({ page }) => {
  await page.goto('/')
  // The Excalidraw canvas should render
  await expect(page.locator('canvas, .excalidraw, .canvas-container').first()).toBeVisible({ timeout: 10000 })
  await expect(page.locator('text=Excalidraw').or(page.locator('h1')).first()).toBeVisible()
})

test('REST API creates and reads elements', async () => {
  const createRes = await fetch('http://localhost:3000/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'Hello' })
  })
  expect(createRes.ok).toBe(true)
  const created = await createRes.json()
  expect(created.element.id).toBeTruthy()
  expect(created.element.type).toBe('rectangle')

  const listRes = await fetch('http://localhost:3000/api/elements')
  const list = await listRes.json()
  expect(list.count).toBe(1)
  expect(list.elements[0].text).toBe('Hello')
})

test('REST API batch creates elements', async () => {
  const res = await fetch('http://localhost:3000/api/elements/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      elements: [
        { type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'Box A' },
        { type: 'rectangle', x: 200, y: 10, width: 100, height: 60, text: 'Box B' },
      ]
    })
  })
  expect(res.ok).toBe(true)
  const data = await res.json()
  expect(data.count).toBe(2)
})

test('REST API creates arrow with binding', async () => {
  // Create two boxes first
  await fetch('http://localhost:3000/api/elements/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      elements: [
        { id: 'box1', type: 'rectangle', x: 50, y: 50, width: 120, height: 60, text: 'A' },
        { id: 'box2', type: 'rectangle', x: 250, y: 50, width: 120, height: 60, text: 'B' },
      ]
    })
  })

  // Create arrow between them
  const arrowRes = await fetch('http://localhost:3000/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'arrow', startElementId: 'box1', endElementId: 'box2' })
  })
  expect(arrowRes.ok).toBe(true)
  const arrow = (await arrowRes.json()).element
  expect(arrow.start).toBeDefined()
  expect(arrow.start.id).toBe('box1')
  expect(arrow.end.id).toBe('box2')
  expect(arrow.points).toBeDefined()
  expect(arrow.points.length).toBe(2)
})

test('REST API updates element', async () => {
  const { element } = await (await fetch('http://localhost:3000/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'text', x: 10, y: 10, text: 'Old' })
  })).json()

  const updateRes = await fetch(`http://localhost:3000/api/elements/${element.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'New' })
  })
  expect(updateRes.ok).toBe(true)
  const updated = (await updateRes.json()).element
  expect(updated.text).toBe('New')
})

test('REST API deletes element', async () => {
  const { element } = await (await fetch('http://localhost:3000/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  })).json()

  const delRes = await fetch(`http://localhost:3000/api/elements/${element.id}`, { method: 'DELETE' })
  expect(delRes.ok).toBe(true)

  const list = await (await fetch('http://localhost:3000/api/elements')).json()
  expect(list.count).toBe(0)
})

test('REST API clears canvas', async () => {
  await fetch('http://localhost:3000/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  })

  const clearRes = await fetch('http://localhost:3000/api/elements', { method: 'DELETE' })
  expect(clearRes.ok).toBe(true)
  const data = await clearRes.json()
  expect(data.cleared).toBe(1)
})

test('bbox filter works', async () => {
  await fetch('http://localhost:3000/api/elements/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      elements: [
        { type: 'rectangle', x: 10, y: 10, width: 50, height: 50 },
        { type: 'rectangle', x: 200, y: 200, width: 50, height: 50 },
      ]
    })
  })

  const res = await fetch('http://localhost:3000/api/elements?x_min=0&x_max=100&y_min=0&y_max=100')
  const data = await res.json()
  expect(data.count).toBe(1)
})

test('health endpoint works', async () => {
  const res = await fetch('http://localhost:3000/health')
  expect(res.ok).toBe(true)
  const data = await res.json()
  expect(data.status).toBe('ok')
})
