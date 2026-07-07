# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: main-flow.spec.ts >> canvas loads in browser
- Location: e2e/main-flow.spec.ts:34:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('canvas, .excalidraw, .canvas-container').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('canvas, .excalidraw, .canvas-container').first()

```

```yaml
- text: "Error: ENOENT: no such file or directory, stat '/home/ma/excalidraw-agent-pr/dist/ui/index.html'"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import { spawn } from 'child_process'
  3   | import { setTimeout } from 'timers/promises'
  4   | 
  5   | const BASE = 'http://localhost:3000'
  6   | const SID = { 'X-Session-Id': 'test-session' }
  7   | const JSON_H = { 'Content-Type': 'application/json', ...SID }
  8   | 
  9   | let serverProcess: any
  10  | 
  11  | test.beforeAll(async () => {
  12  |   serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
  13  |     env: { ...process.env, PORT: '3000' },
  14  |     stdio: 'pipe',
  15  |     shell: true
  16  |   })
  17  |   for (let i = 0; i < 30; i++) {
  18  |     try {
  19  |       const res = await fetch(`${BASE}/health`)
  20  |       if (res.ok) break
  21  |     } catch {}
  22  |     await setTimeout(500)
  23  |   }
  24  | })
  25  | 
  26  | test.afterAll(() => {
  27  |   if (serverProcess) serverProcess.kill()
  28  | })
  29  | 
  30  | test.beforeEach(async () => {
  31  |   await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })
  32  | })
  33  | 
  34  | test('canvas loads in browser', async ({ page }) => {
  35  |   await page.goto('/')
> 36  |   await expect(page.locator('canvas, .excalidraw, .canvas-container').first()).toBeVisible({ timeout: 10000 })
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  37  |   await expect(page.locator('text=Excalidraw').or(page.locator('h1')).first()).toBeVisible()
  38  | })
  39  | 
  40  | test('REST API creates and reads elements', async () => {
  41  |   const res = await fetch(`${BASE}/api/elements`, {
  42  |     method: 'POST', headers: JSON_H,
  43  |     body: JSON.stringify({ type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'Hello' })
  44  |   })
  45  |   expect(res.ok).toBe(true)
  46  |   const el = (await res.json()).element
  47  |   expect(el.id).toBeTruthy()
  48  | 
  49  |   const list = await (await fetch(`${BASE}/api/elements`, { headers: SID })).json()
  50  |   expect(list.count).toBe(1)
  51  |   expect(list.elements[0].text).toBe('Hello')
  52  | })
  53  | 
  54  | test('REST API batch creates elements', async () => {
  55  |   const res = await fetch(`${BASE}/api/elements/batch`, {
  56  |     method: 'POST', headers: JSON_H,
  57  |     body: JSON.stringify({ elements: [
  58  |       { type: 'rectangle', x: 10, y: 10, width: 100, height: 60, text: 'A' },
  59  |       { type: 'rectangle', x: 200, y: 10, width: 100, height: 60, text: 'B' },
  60  |     ]})
  61  |   })
  62  |   expect((await res.json()).count).toBe(2)
  63  | })
  64  | 
  65  | test('creates arrow with binding', async () => {
  66  |   await fetch(`${BASE}/api/elements/batch`, {
  67  |     method: 'POST', headers: JSON_H,
  68  |     body: JSON.stringify({ elements: [
  69  |       { id: 'box1', type: 'rectangle', x: 50, y: 50, width: 120, height: 60, text: 'A' },
  70  |       { id: 'box2', type: 'rectangle', x: 250, y: 50, width: 120, height: 60, text: 'B' },
  71  |     ]})
  72  |   })
  73  | 
  74  |   const arrow = (await (await fetch(`${BASE}/api/elements`, {
  75  |     method: 'POST', headers: JSON_H,
  76  |     body: JSON.stringify({ type: 'arrow', startElementId: 'box1', endElementId: 'box2' })
  77  |   })).json()).element
  78  |   expect(arrow.start.id).toBe('box1')
  79  |   expect(arrow.end.id).toBe('box2')
  80  |   expect(arrow.points.length).toBe(2)
  81  | })
  82  | 
  83  | test('updates element', async () => {
  84  |   const { element } = await (await fetch(`${BASE}/api/elements`, {
  85  |     method: 'POST', headers: JSON_H,
  86  |     body: JSON.stringify({ type: 'text', x: 10, y: 10, text: 'Old' })
  87  |   })).json()
  88  | 
  89  |   const updated = (await (await fetch(`${BASE}/api/elements/${element.id}`, {
  90  |     method: 'PUT', headers: JSON_H,
  91  |     body: JSON.stringify({ text: 'New' })
  92  |   })).json()).element
  93  |   expect(updated.text).toBe('New')
  94  | })
  95  | 
  96  | test('deletes element', async () => {
  97  |   const { element } = await (await fetch(`${BASE}/api/elements`, {
  98  |     method: 'POST', headers: JSON_H,
  99  |     body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  100 |   })).json()
  101 | 
  102 |   const del = await fetch(`${BASE}/api/elements/${element.id}`, { method: 'DELETE', headers: SID })
  103 |   expect(del.ok).toBe(true)
  104 | 
  105 |   const list = await (await fetch(`${BASE}/api/elements`, { headers: SID })).json()
  106 |   expect(list.count).toBe(0)
  107 | })
  108 | 
  109 | test('clears canvas', async () => {
  110 |   await fetch(`${BASE}/api/elements`, {
  111 |     method: 'POST', headers: JSON_H,
  112 |     body: JSON.stringify({ type: 'rectangle', x: 10, y: 10 })
  113 |   })
  114 |   const data = await (await fetch(`${BASE}/api/clear`, { method: 'POST', headers: SID })).json()
  115 |   expect(data.cleared).toBe(1)
  116 | })
  117 | 
  118 | test('bbox filter works', async () => {
  119 |   await fetch(`${BASE}/api/elements/batch`, {
  120 |     method: 'POST', headers: JSON_H,
  121 |     body: JSON.stringify({ elements: [
  122 |       { type: 'rectangle', x: 10, y: 10, width: 50, height: 50 },
  123 |       { type: 'rectangle', x: 200, y: 200, width: 50, height: 50 },
  124 |     ]})
  125 |   })
  126 |   const data = await (await fetch(`${BASE}/api/elements?x_min=0&x_max=100&y_min=0&y_max=100`, { headers: SID })).json()
  127 |   expect(data.count).toBe(1)
  128 | })
  129 | 
  130 | test('health endpoint works', async () => {
  131 |   const res = await fetch(`${BASE}/health`)
  132 |   expect((await res.json()).status).toBe('ok')
  133 | })
  134 | 
  135 | test('POST /api/agent returns error without prompt', async () => {
  136 |   const res = await fetch(`${BASE}/api/agent`, {
```