import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runTool, TOOLS } from './tools'

const LLM_URL = process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions'
const LLM_KEY = process.env.LLM_KEY || process.env.OPENAI_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o'
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || '60000', 10)
const MAX_TURNS = 15

const SYSTEM = `You are a diagram-drawing AI.
You have tools to create and modify a visual canvas.
Use get_scene first to see what's there, then draw.
Use batch_create for multi-element diagrams.
Call done when the diagram is finished. Be creative and have fun.`

/** The agent: the model calls tools, the results go back to it, until it calls done. */
export async function agent(prompt: string, sessionId = 'default'): Promise<{ turns: number; log: string[] }> {
  const log: string[] = []
  const chat: any[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]
  let turn = 0
  try {
    for (turn = 0; turn < MAX_TURNS; turn++) {
      const msg = await llm(chat)
      chat.push(msg)
      if (msg.content) log.push(`🤖 ${msg.content}`)
      if (isDone(msg)) break
      for (const call of msg.tool_calls ?? []) {
        chat.push(run(call, sessionId, log))
      }
    }
    if (turn === MAX_TURNS) log.push('⚠️ Max turns reached')
  } catch (err) {
    log.push(`⚠️ ${(err as Error).message}`)
  }
  return { turns: turn, log }
}

/** One request to the model with the chat so far and the tools; its reply message. */
async function llm(chat: any[]): Promise<any> {
  const response = await fetch(LLM_URL, {
    signal: AbortSignal.timeout(LLM_TIMEOUT),
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: chat,
      tools: TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: 'auto',
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 500)}`)
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`LLM returned non-JSON response: ${text.slice(0, 200)}`)
  }
  if (body.error) throw new Error(`LLM Error: ${body.error.message || JSON.stringify(body.error)}`)
  const msg = body.choices?.[0]?.message
  if (!msg) throw new Error('Unexpected LLM response format')
  return msg
}

/** Runs one tool call; its result as the message the model reads next (every call must get one). */
function run(call: any, sessionId: string, log: string[]): any {
  const name = call.function.name
  let args: any
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    log.push(`⚠️ Invalid JSON args for ${name}`)
    return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'invalid JSON arguments' }) }
  }
  log.push(`  🛠 ${name}(${JSON.stringify(args)})`)
  return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(runTool(name, args, sessionId)) }
}

/** Finished: the model called done, or answered without calling any tool. */
function isDone(msg: any): boolean {
  return !msg.tool_calls?.length || msg.tool_calls[0].function.name === 'done'
}
