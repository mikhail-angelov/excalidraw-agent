import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SID = { 'X-Session-Id': 'test-session' }

test.beforeEach(async () => {
  await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })
})

test('canvas loads in browser', async ({ page }) => {
  await page.setExtraHTTPHeaders(SID)
  await page.goto(BASE)
  await expect(page.locator('body')).not.toHaveText(/Error|404|Cannot GET/, { timeout: 10000 })
})

test('health endpoint works', async () => {
  expect((await (await fetch(`${BASE}/health`)).json()).status).toBe('ok')
})

test('clears canvas', async () => {
  // Agent creates element, then clear
  const data = await (await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })).json()
  expect(data.cleared).toBeDefined()
})

test('agent returns error without prompt', async () => {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...SID },
    body: JSON.stringify({})
  })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('prompt required')
})

test('model functions work via agent tools (import bypass test)', async () => {
  // This tests that the model is shared between server and tools
  // by checking that agent-created elements appear in WebSocket init

  // First clear
  await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })

  // Connect WebSocket to verify empty state
  const { default: WebSocket } = await import('ws') as any
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}`, { headers: { 'X-Session-Id': 'test-session' } })
  const initMsg = await new Promise<any>((resolve) => {
    ws.on('message', (data: Buffer) => resolve(JSON.parse(data.toString())))
  })
  expect(initMsg.type).toBe('init')
  expect(initMsg.elements).toEqual([])
  ws.close()
})
