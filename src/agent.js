// agent.js — Minimal AI Agent: prompt → LLM → tools → done
// This is what every AI agent looks like under the hood.
// No frameworks. No MCP. No LangChain. Just the loop.

const API = 'http://localhost:3000/api'
const LLM_URL = process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions'
const LLM_KEY = process.env.LLM_KEY || process.env.OPENAI_API_KEY
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o'

// === Tool descriptors injected into every LLM call ===
const TOOLS = [
  {
    name: 'create_element',
    description: 'Create an element on the canvas',
    parameters: {
      type: 'object',
      properties: {
        type: { enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text'] },
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        text: { type: 'string' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        fontSize: { type: 'number' },
        startElementId: { type: 'string', description: 'For arrows: bind start to this element ID' },
        endElementId: { type: 'string', description: 'For arrows: bind end to this element ID' }
      },
      required: ['type', 'x', 'y']
    }
  },
  {
    name: 'batch_create',
    description: 'Create multiple elements at once (use for entire diagrams)',
    parameters: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text'] },
              x: { type: 'number' }, y: { type: 'number' },
              width: { type: 'number' }, height: { type: 'number' },
              text: { type: 'string' },
              backgroundColor: { type: 'string' },
              strokeColor: { type: 'string' },
              startElementId: { type: 'string' },
              endElementId: { type: 'string' }
            },
            required: ['type', 'x', 'y']
          }
        }
      },
      required: ['elements']
    }
  },
  {
    name: 'update_element',
    description: 'Update an existing element',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        backgroundColor: { type: 'string' },
        x: { type: 'number' }, y: { type: 'number' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_element',
    description: 'Delete an element by ID',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'clear_canvas',
    description: 'Remove all elements from the canvas',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_scene',
    description: 'Get a description of everything currently on the canvas',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'done',
    description: 'Call this when the diagram is complete and you have nothing more to do',
    parameters: { type: 'object', properties: {} }
  }
]

// === Tool implementations — each one just calls the REST API ===
async function runTool(name, args) {
  switch (name) {
    case 'create_element':
      return (await fetch(`${API}/elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })).json()
    case 'batch_create':
      return (await fetch(`${API}/elements/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elements: args.elements }) })).json()
    case 'update_element':
      return (await fetch(`${API}/elements/${args.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })).json()
    case 'delete_element':
      return (await fetch(`${API}/elements/${args.id}`, { method: 'DELETE' })).json()
    case 'clear_canvas':
      return (await fetch(`${API}/elements`, { method: 'DELETE' })).json()
    case 'get_scene':
      const res = await fetch(`${API}/elements`)
      const data = await res.json()
      return data.elements.length === 0
        ? 'Canvas is empty'
        : data.elements.map(e => `[${e.type}] "${e.text || ''}" at (${e.x}, ${e.y})`).join('\n')
    default:
      return `Unknown tool: ${name}`
  }
}

// === The agent loop ===
async function agent(prompt) {
  const messages = [
    { role: 'system', content: `You are a diagram-drawing AI.
You have tools to create and modify a visual canvas.
Use get_scene first to see what's there, then draw.
Use batch_create for multi-element diagrams.
Call done when the diagram is finished. Be creative and have fun.` },
    { role: 'user', content: prompt }
  ]

  for (let turn = 0; turn < 15; turn++) {
    // 1. Call the LLM
    const llm = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, messages, tools: TOOLS.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })), tool_choice: 'auto' })
    })
    const llmResponse = await llm.json()
    if (llmResponse.error) { console.error('LLM Error:', llmResponse.error); return }
    const { choices } = llmResponse
    const msg = choices[0].message
    messages.push(msg)

    // 2. If LLM says done — we're finished
    if (msg.content) console.log(`\n🤖 ${msg.content}`)
    if (msg.tool_calls?.[0]?.function?.name === 'done') {
      console.log('\n✅ Diagram complete!')
      return
    }

    // 3. Execute each tool and feed results back
    for (const tc of (msg.tool_calls || [])) {
      const args = JSON.parse(tc.function.arguments)
      console.log(`  🛠 ${tc.function.name}(${JSON.stringify(args)})`)
      const result = await runTool(tc.function.name, args)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }
  console.log('\n⚠️ Max turns reached')
}

// Run
const prompt = process.argv[2] || 'Draw a simple flowchart showing how an AI agent works: user asks a question → LLM thinks → calls tools → returns result'
agent(prompt).catch(console.error)
