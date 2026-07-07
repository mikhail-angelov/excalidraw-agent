// Shared model — both REST API and agent tools modify the same state

export const sessions = new Map<string, Map<string, any>>()
export const wsBySession = new Map<string, Set<any>>()

export function getSessionElements(sid: string): Map<string, any> {
  if (!sessions.has(sid)) sessions.set(sid, new Map())
  return sessions.get(sid)!
}

export function broadcast(sid: string, msg: any) {
  const data = JSON.stringify(msg)
  const clients = wsBySession.get(sid)
  if (clients) clients.forEach((c: any) => c.readyState === 1 && c.send(data))
}

export function addElement(sid: string, el: any): any {
  const els = getSessionElements(sid)
  const full = { id: crypto.randomUUID(), ...el }
  if (full.type === 'arrow' || full.type === 'line') resolveArrow(full, els)
  els.set(full.id, full)
  broadcast(sid, { type: 'element_created', element: full })
  return full
}

export function updateElement(sid: string, id: string, data: any): any | null {
  const els = getSessionElements(sid)
  const el = els.get(id)
  if (!el) return null
  const updated = { ...el, ...data, id }
  els.set(id, updated)
  broadcast(sid, { type: 'element_updated', element: updated })
  return updated
}

export function removeElement(sid: string, id: string): boolean {
  const els = getSessionElements(sid)
  if (!els.has(id)) return false
  els.delete(id)
  broadcast(sid, { type: 'element_deleted', id })
  return true
}

export function batchAddElements(sid: string, elements: any[]): any[] {
  const els = getSessionElements(sid)
  const created = elements.map((el: any) => {
    const full = { id: crypto.randomUUID(), ...el }
    if (full.type === 'arrow' || full.type === 'line') resolveArrow(full, els)
    els.set(full.id, full)
    return full
  })
  broadcast(sid, { type: 'batch_created', elements: created })
  return created
}

export function clearSession(sid: string): number {
  const els = getSessionElements(sid)
  const count = els.size
  els.clear()
  broadcast(sid, { type: 'canvas_cleared' })
  return count
}

// Arrow binding helper
export function resolveArrow(arrow: any, allElements: Map<string, any>) {
  const startId = arrow.startElementId || arrow.start?.id
  const endId = arrow.endElementId || arrow.end?.id
  const startEl = startId ? allElements.get(startId) : null
  const endEl = endId ? allElements.get(endId) : null
  const GAP = 8, defW = 100, defH = 60
  const sc = startEl
    ? { x: startEl.x + (startEl.width || defW) / 2, y: startEl.y + (startEl.height || defH) / 2 }
    : { x: arrow.x, y: arrow.y }
  const ec = endEl
    ? { x: endEl.x + (endEl.width || defW) / 2, y: endEl.y + (endEl.height || defH) / 2 }
    : { x: arrow.x + 120, y: arrow.y }
  const dx = ec.x - sc.x, dy = ec.y - sc.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  arrow.x = sc.x + (dx / dist) * GAP
  arrow.y = sc.y + (dy / dist) * GAP
  arrow.points = [[0, 0], [ec.x - (dx / dist) * GAP - arrow.x, ec.y - (dy / dist) * GAP - arrow.y]]
  arrow.start = { id: startId }
  arrow.end = { id: endId }
}
