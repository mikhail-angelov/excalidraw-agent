import { runTool, TOOLS } from './tools.js'

const LLM_URL = process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions'
const LLM_KEY = process.env.LLM_KEY || process.env.OPENAI_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o'
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || '60000', 10)

export async function agent(prompt: string, sessionId = 'default'): Promise<{ turns: number; log: string[] }> {
  const log: string[] = []
  let turn = 0
  const messages: any[] = [
    { role: 'system', content: `You are a diagram-drawing AI.
You have tools to create and modify a visual canvas.
Use get_scene first to see what's there, then draw.
Use batch_create for multi-element diagrams.
Call done when the diagram is finished. Be creative and have fun.` },
    { role: 'user', content: prompt }
  ]

  for (turn = 0; turn < 15; turn++) {
    // HTTP call with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT)
    let response: Response
    try {
      response = await fetch(LLM_URL, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LLM_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages,
          tools: TOOLS.map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters }
          })),
          tool_choice: 'auto' as const
        })
      })
    } finally {
      clearTimeout(timeout)
    }

    // Check HTTP status
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      log.push(`⚠️ LLM HTTP ${response.status}: ${text.slice(0, 500)}`)
      return { turns: turn, log }
    }

    // Safe JSON parse
    let llmResponse: any
    try {
      llmResponse = await response.json()
    } catch {
      const text = await response.text().catch(() => '').then(t => t.slice(0, 200))
      log.push(`⚠️ LLM returned non-JSON response: ${text}`)
      return { turns: turn, log }
    }

    if (llmResponse.error) {
      log.push(`⚠️ LLM Error: ${llmResponse.error.message || JSON.stringify(llmResponse.error)}`)
      return { turns: turn, log }
    }

    const msg = llmResponse.choices?.[0]?.message
    if (!msg) {
      log.push(`⚠️ Unexpected LLM response format`)
      return { turns: turn, log }
    }

    messages.push(msg)
    if (msg.content) log.push(`🤖 ${msg.content}`)
    if (isDone(msg)) return { turns: turn, log }

    for (const tc of (msg.tool_calls || [])) {
      // Safe JSON parse for tool args
      let args: any = {}
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch {
        log.push(`⚠️ Invalid JSON args for ${tc.function.name}`)
        continue
      }
      log.push(`  🛠 ${tc.function.name}(${JSON.stringify(args)})`)
      const result = await runTool(tc.function.name, args, sessionId)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }
  log.push('⚠️ Max turns reached')
  return { turns: turn, log }
}

function isDone(msg: any): boolean {
  if (msg.tool_calls?.[0]?.function?.name === 'done') return true
  return false
}
