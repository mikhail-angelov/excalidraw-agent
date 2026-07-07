// Shared model — singleton, agent tools use the same state

export const sessions = new Map<string, Map<string, any>>()
export const wsBySession = new Map<string, Set<any>>()

// Session TTL tracking
const sessionLastAccess = new Map<string, number>()
const SESSION_TTL = 1800_000 // 30 minutes

function touchSession(sid: string) {
  sessionLastAccess.set(sid, Date.now())
}

function getOrCreateSession(sid: string): Map<string, any> {
  touchSession(sid)
  if (!sessions.has(sid)) sessions.set(sid, new Map())
  return sessions.get(sid)!
}

// --- Session helpers ---

export function getSessionElements(sid: string): Map<string, any> {
  return getOrCreateSession(sid)
}

export function broadcast(sid: string, msg: any) {
  const data = JSON.stringify(msg)
  const clients = wsBySession.get(sid)
  if (clients) clients.forEach((c: any) => c.readyState === 1 && c.send(data))
}

// --- Snapshot storage ---

const snapshots = new Map<string, Map<string, { name: string; elements: any[]; createdAt: string }>>()

function getSessionSnapshots(sid: string): Map<string, { name: string; elements: any[]; createdAt: string }> {
  if (!snapshots.has(sid)) snapshots.set(sid, new Map())
  return snapshots.get(sid)!
}

// --- Element CRUD ---

export function addElement(sid: string, el: any): any {
  const els = getSessionElements(sid)
  const full = { id: crypto.randomUUID(), ...el }
  if (full.type === 'arrow' || full.type === 'line') resolveArrow(full, els)
  els.set(full.id, full)
  if (full.start?.id) addBoundElement(sid, full.start.id, full.id, 'arrow')
  if (full.end?.id) addBoundElement(sid, full.end.id, full.id, 'arrow')
  return full
}

export function getElement(sid: string, id: string): any | null {
  return getSessionElements(sid).get(id) || null
}

export function updateElement(sid: string, id: string, data: any): any | null {
  const els = getSessionElements(sid)
  const el = els.get(id)
  if (!el) return null
  if (el.locked) return null
  const updated = { ...el, ...data, id }
  els.set(id, updated)
  // Reroute bound arrows when shape position/size changes
  if (data.x !== undefined || data.y !== undefined || data.width !== undefined || data.height !== undefined) {
    rerouteBoundArrows(sid, id)
  }
  return updated
}

export function removeElement(sid: string, id: string): boolean {
  const els = getSessionElements(sid)
  if (!els.has(id)) return false
  const el = els.get(id)
  if (el?.locked) return false
  if (el?.start?.id) removeBoundElement(sid, el.start.id, id)
  if (el?.end?.id) removeBoundElement(sid, el.end.id, id)
  els.delete(id)
  return true
}

export function batchAddElements(sid: string, elements: any[]): any[] {
  const els = getSessionElements(sid)
  // Two-pass: 1) create all elements, 2) resolve arrows with full map
  const created = elements.map((el: any) => {
    const full = { id: crypto.randomUUID(), ...el }
    els.set(full.id, full)
    return full
  })
  for (const el of created) {
    if (el.type === 'arrow' || el.type === 'line') {
      resolveArrow(el, els)
      if (el.start?.id) addBoundElement(sid, el.start.id, el.id, 'arrow')
      if (el.end?.id) addBoundElement(sid, el.end.id, el.id, 'arrow')
    }
  }
  return created
}

export function clearSession(sid: string): number {
  const els = getSessionElements(sid)
  const count = els.size
  els.clear()
  getSessionSnapshots(sid).clear()
  broadcast(sid, { type: 'canvas_cleared' })
  return count
}

export function duplicateElement(sid: string, id: string): any | null {
  const els = getSessionElements(sid)
  const el = els.get(id)
  if (!el) return null
  const dup = { ...el, id: crypto.randomUUID(), x: (el.x || 0) + 30, y: (el.y || 0) + 30 }
  dup.text = dup.text ? `${dup.text} (copy)` : dup.text
  delete dup.start; delete dup.end
  delete dup.boundElements; delete dup.startBinding; delete dup.endBinding
  els.set(dup.id, dup)
  return dup
}

// --- Query ---

export function queryElements(sid: string, filter: { type?: string; ids?: string[]; bbox?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number } }): any[] {
  const els = [...getSessionElements(sid).values()]
  return els.filter(el => {
    if (filter.type && el.type !== filter.type) return false
    if (filter.ids && !filter.ids.includes(el.id)) return false
    if (filter.bbox) {
      const b = filter.bbox
      if (b.xMin !== undefined && el.x < b.xMin) return false
      if (b.xMax !== undefined && el.x > b.xMax) return false
      if (b.yMin !== undefined && el.y < b.yMin) return false
      if (b.yMax !== undefined && el.y > b.yMax) return false
    }
    return true
  })
}

// --- Group / Ungroup ---

export function groupElements(sid: string, elementIds: string[]): any[] {
  const els = getSessionElements(sid)
  const groupId = crypto.randomUUID()
  const grouped: any[] = []
  for (const id of elementIds) {
    const el = els.get(id)
    if (!el) continue
    el.groupIds = [...(el.groupIds || []), groupId]
    grouped.push(el)
  }
  return grouped
}

export function ungroupElements(sid: string, groupId: string): any[] {
  const els = getSessionElements(sid)
  const ungrouped: any[] = []
  for (const el of els.values()) {
    if (el.groupIds?.includes(groupId)) {
      el.groupIds = el.groupIds.filter((g: string) => g !== groupId)
      ungrouped.push(el)
    }
  }
  return ungrouped
}

// --- Lock / Unlock ---

export function lockElements(sid: string, elementIds: string[]): boolean {
  const els = getSessionElements(sid)
  for (const id of elementIds) { const el = els.get(id); if (el) el.locked = true }
  return true
}

export function unlockElements(sid: string, elementIds: string[]): boolean {
  const els = getSessionElements(sid)
  for (const id of elementIds) { const el = els.get(id); if (el) el.locked = false }
  return true
}

// --- Align / Distribute ---

export function alignElements(sid: string, elementIds: string[], alignment: string): boolean {
  const els = getSessionElements(sid)
  const targets = elementIds.map(id => els.get(id)).filter(Boolean)
  if (targets.length < 2) return false

  const left = Math.min(...targets.map((e: any) => e.x))
  const right = Math.max(...targets.map((e: any) => e.x + (e.width || 0)))
  const top = Math.min(...targets.map((e: any) => e.y))
  const bottom = Math.max(...targets.map((e: any) => e.y + (e.height || 0)))
  const centerX = left + (right - left) / 2
  const centerY = top + (bottom - top) / 2

  for (const el of targets) {
    const w = el.width || 0; const h = el.height || 0
    switch (alignment) {
      case 'left': el.x = left; break
      case 'center': el.x = centerX - w / 2; break
      case 'right': el.x = right - w; break
      case 'top': el.y = top; break
      case 'middle': el.y = centerY - h / 2; break
      case 'bottom': el.y = bottom - h; break
    }
  }
  return true
}

export function distributeElements(sid: string, elementIds: string[], direction: string): boolean {
  const els = getSessionElements(sid)
  const targets = elementIds.map(id => els.get(id)).filter(Boolean).sort((a: any, b: any) =>
    direction === 'horizontal' ? a.x - b.x : a.y - b.y
  )
  if (targets.length < 2) return false
  const totalSize = targets.reduce((s: number, e: any) => s + (direction === 'horizontal' ? (e.width || 0) : (e.height || 0)), 0)
  const first = targets[0]; const last = targets[targets.length - 1]
  const span = direction === 'horizontal' ? (last.x + (last.width || 0)) - first.x : (last.y + (last.height || 0)) - first.y
  const gap = (span - totalSize) / (targets.length - 1)
  let pos = direction === 'horizontal' ? first.x : first.y
  for (const el of targets) {
    if (direction === 'horizontal') el.x = pos; else el.y = pos
    pos += (direction === 'horizontal' ? (el.width || 0) : (el.height || 0)) + gap
  }
  return true
}

// --- Snapshot ---

export function snapshotScene(sid: string, name: string): boolean {
  const snap = getSessionSnapshots(sid)
  snap.set(name, { name, elements: [...getSessionElements(sid).values()].map(e => JSON.parse(JSON.stringify(e))), createdAt: new Date().toISOString() })
  return true
}

export function restoreSnapshot(sid: string, name: string): boolean {
  const snap = getSessionSnapshots(sid).get(name)
  if (!snap) return false
  const els = getSessionElements(sid)
  els.clear()
  for (const el of snap.elements) els.set(el.id, JSON.parse(JSON.stringify(el)))
  broadcast(sid, { type: 'canvas_cleared' })
  return true
}

// --- Viewport ---

export function setViewport(sid: string, viewport: { scrollToContent?: boolean; scrollToElementId?: string; zoom?: number; offsetX?: number; offsetY?: number }): string {
  broadcast(sid, { type: 'set_viewport', ...viewport })
  return 'Viewport updated'
}

// --- Bound elements tracking ---

function addBoundElement(sid: string, targetId: string, boundId: string, boundType: string) {
  const el = getSessionElements(sid).get(targetId)
  if (!el) return
  if (!el.boundElements) el.boundElements = []
  if (!el.boundElements.some((b: any) => b.id === boundId))
    el.boundElements.push({ id: boundId, type: boundType })
}

function removeBoundElement(sid: string, targetId: string, boundId: string) {
  const el = getSessionElements(sid).get(targetId)
  if (!el?.boundElements) return
  el.boundElements = el.boundElements.filter((b: any) => b.id !== boundId)
}

// --- Arrow binding ---

export function resolveArrow(arrow: any, allElements: Map<string, any>) {
  const startId = arrow.startElementId || arrow.start?.id
  const endId = arrow.endElementId || arrow.end?.id
  const startEl = startId ? allElements.get(startId) : null
  const endEl = endId ? allElements.get(endId) : null
  const GAP = 8

  const sc = startEl ? center(startEl) : { x: arrow.x, y: arrow.y }
  const ec = endEl ? center(endEl) : { x: arrow.x + 100, y: arrow.y + 30 }

  const startPt = startEl ? edgePoint(startEl, ec.x, ec.y, GAP) : sc
  const endPt = endEl ? edgePoint(endEl, sc.x, sc.y, GAP) : ec

  arrow.x = startPt.x
  arrow.y = startPt.y
  arrow.points = [[0, 0], [endPt.x - startPt.x, endPt.y - startPt.y]]
  arrow.start = { id: startId }
  arrow.end = { id: endId }
  arrow.startBinding = startEl ? { elementId: startId, focus: 0, gap: 8 } : undefined
  arrow.endBinding = endEl ? { elementId: endId, focus: 0, gap: 8 } : undefined
}

function center(el: any) {
  return { x: el.x + (el.width || 100) / 2, y: el.y + (el.height || 60) / 2 }
}

function edgePoint(el: any, targetX: number, targetY: number, gap: number): { x: number; y: number } {
  const cx = el.x + (el.width || 100) / 2, cy = el.y + (el.height || 60) / 2
  const dx = targetX - cx, dy = targetY - cy

  if (el.type === 'diamond') {
    const hw = (el.width || 100) / 2, hh = (el.height || 60) / 2
    const absSum = Math.abs(dx) / hw + Math.abs(dy) / hh
    const scale = absSum > 0 ? 1 / absSum : 1
    return { x: cx + dx * scale + (dx > 0 ? gap : -gap), y: cy + dy * scale + (dy > 0 ? gap : -gap) }
  }
  if (el.type === 'ellipse') {
    const a = (el.width || 100) / 2, b = (el.height || 60) / 2
    const angle = Math.atan2(dy, dx)
    return { x: cx + a * Math.cos(angle) + (dx > 0 ? gap : -gap), y: cy + b * Math.sin(angle) + (dy > 0 ? gap : -gap) }
  }
  // Rectangle
  const hw = (el.width || 100) / 2, hh = (el.height || 60) / 2
  const absDx = Math.abs(dx), absDy = Math.abs(dy)
  let scale: number
  if (absDx === 0 && absDy === 0) scale = 0
  else if (absDx * hh > absDy * hw) scale = hw / absDx
  else scale = hh / absDy
  return { x: cx + dx * scale + (dx > 0 ? gap : -gap), y: cy + dy * scale + (dy > 0 ? gap : -gap) }
}

// --- Design guide ---

export const DIAGRAM_DESIGN_GUIDE = `# Excalidraw Diagram Design Guide

## Color Palette
| Name | Hex | Use |
|------|-----|-----|
| Black | #1e1e1e | Default text & borders |
| Red | #e03131 | Errors, warnings |
| Green | #2f9e44 | Success |
| Blue | #1971c2 | Primary |
| Purple | #9c36b5 | Services |
| Orange | #e8590c | Async/events |
| Cyan | #0c8599 | Databases |

## Fill Colors (pastel)
Light Red #ffc9c9, Light Green #b2f2bb, Light Blue #a5d8ff, Light Purple #eebefa, Light Orange #ffd8a8, Light Cyan #99e9f2

## Sizing
- Min shape: 120x60px
- Font: body >=16, title >=20, label >=14
- Arrow min length: 80px
- Spacing: 40-80px between shapes

## Anti-Patterns
1. Overlapping elements
2. Cramped spacing (<40px)
3. Tiny fonts (<14px)
4. No arrow binding (always use startElementId/endElementId)
5. Too many colors (limit to 3-4 fills)`

// --- Resource ---

export function getResource(sid: string, resource: string): any {
  switch (resource) {
    case 'scene': return { elements: [...getSessionElements(sid).values()] }
    case 'elements': return [...getSessionElements(sid).values()]
    case 'theme': return { theme: 'light' }
    default: return null
  }
}

// --- Re-route bound arrows ---

export function rerouteBoundArrows(sid: string, movedId: string): any[] {
  const els = getSessionElements(sid)
  const moved = els.get(movedId)
  if (!moved) return []
  const updated: any[] = []
  for (const el of els.values()) {
    if ((el.type === 'arrow' || el.type === 'line') && (el.start?.id === movedId || el.end?.id === movedId)) {
      resolveArrow(el, els)
      updated.push(el)
    }
  }
  return updated
}

// --- Session cleanup ---

const CLEANUP_INTERVAL = 300_000 // 5 minutes

function cleanupStaleSessions() {
  const now = Date.now()
  for (const [sid, lastAccess] of sessionLastAccess) {
    if (now - lastAccess > SESSION_TTL) {
      sessions.delete(sid)
      wsBySession.delete(sid)
      sessionLastAccess.delete(sid)
      snapshots.delete(sid)
      console.log(`Session ${sid} cleaned up (TTL expired)`)
    }
  }
}

setInterval(cleanupStaleSessions, CLEANUP_INTERVAL)

