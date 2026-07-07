---
title: "AI Agent Under the Hood: What Happens When Your Code Calls an LLM"
description: "A minimal AI agent in 90 lines of code — no frameworks, no MCP, no LangChain. Just an LLM, a REST API, and a loop. Plus the moment the agent drew itself drawing itself."
tags:
  - javascript
  - ai
  - agents
  - tutorial
published: false
canonical_url: https://habr.com/p/415857/
---

*Originally published on Habr in Russian. English translation by the author.*

When I wrote ["Build Your Own React in 5 Minutes"](https://dev.to/mangelov/react-under-the-hood-building-a-tiny-virtual-dom-renderer-1cg2) (English translation of my old Habr article), I thought: what if I take that minimal UI framework and feed it to an AI agent? Let it draw diagrams on the canvas.

Spoiler: I wrote an AI agent in 90 lines of code. It works. It's terrifying. Sometimes it seems self-aware. But it's just a loop you've never noticed.

## Every Agent Needs a Canvas

An AI agent is, fundamentally, a very persistent parrot with tools. If the parrot has a beak, it can draw. If not, it just talks about drawing and nothing happens.

So first, I built a canvas — a minimal Express server that stores Excalidraw elements and serves them via REST API. Nothing fancy:

```javascript
// server/index.js — ~50 lines, the canvas

const elements = new Map()

app.post('/api/elements', (req, res) => {
  const el = { id: crypto.randomUUID(), ...req.body }
  elements.set(el.id, el)
  res.json({ element: el })
})

app.get('/api/elements', (_, res) => {
  res.json({ elements: [...elements.values()] })
})
```

That's it. Create rectangles, ellipses, arrows, text — and watch them appear in the browser via WebSocket. Now we need the parrot.

## The Agent Loop: What's Really Under the Hood

Strip away the marketing, and an AI agent is just a loop:

```
1. Ask the LLM: "what now?"
2. LLM replies: "call create_element with these parameters"
3. Execute the call
4. Tell the LLM: "done. what next?"
5. Repeat until the LLM says "done"
```

That's it. No magic. No "agentic AI." Just a loop where the LLM plays the brain and your code plays the hands.

Here's the agent — 90 lines, zero frameworks:

```javascript
// agent.js — The core of every AI agent

async function agent(prompt) {
  const messages = [
    { role: 'system', content: 'You draw diagrams. Use your tools.' },
    { role: 'user', content: prompt }
  ]

  for (let turn = 0; turn < 15; turn++) {
    // 1. Ask the LLM what to do
    const response = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        tools: TOOL_DESCRIPTIONS,
        tool_choice: 'auto'
      })
    })
    const msg = (await response.json()).choices[0].message

    // 2. If the LLM says "done" — exit
    if (isDone(msg)) break

    // 3. Execute each requested tool
    for (const toolCall of msg.tool_calls) {
      const result = await runTool(
        toolCall.name,
        JSON.parse(toolCall.arguments)
      )
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      })
    }
  }
}
```

That's the agent. The rest is just tool descriptions.

### The Interesting Part: Tool Descriptions

The LLM doesn't know what REST, HTTP, or a database is. It only knows JSON schemas. Whatever you give it as tool descriptions *becomes its reality*:

```javascript
const TOOLS = [
  {
    name: 'batch_create',
    description: 'Create multiple elements at once',
    parameters: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            properties: {
              type: { enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text'] },
              x: { type: 'number' }, y: { type: 'number' },
              text: { type: 'string' },
              backgroundColor: { type: 'string' }
            },
            required: ['type', 'x', 'y']
          }
        }
      }
    }
  },
  {
    name: 'get_scene',
    description: 'See what is on the canvas right now',
    parameters: { type: 'object', properties: {} }
  }
]
```

Notice `get_scene` has no parameters. It's literally: "look and tell me." When the LLM calls it, it gets a text description of the canvas and decides what to do next.

### Why This Works

Because the LLM was trained on millions of examples of "look first, then act." The system prompt + tool descriptions + call history = behavior that looks like planning.

But it's not planning. It's autoregression on a prompt that already contains everything needed.

## The Input Value Bug (It Has an AI Equivalent)

In my first React article, there was a funny detail about `<input value={...}>`: when updating `value`, you must compare against the real DOM attribute, not the old vnode. Otherwise the cursor jumps and selection breaks.

AI agents have the exact same bug — it's called "context loss." After 15 tool calls in a row, the prompt grows to tens of thousands of tokens. At some point, the model "forgets" what it was doing at the start.

The fix is the same: snapshots. Save the canvas state periodically and let the agent "look again."

## The Unexpected Ending: When the Agent Freaked Me Out

I ran the agent with this prompt:

> "Draw a diagram of how an AI agent works: user asks a question → LLM thinks → calls tools → returns result."

The agent looked at the empty canvas. Created four rectangles: "User", "LLM", "Tools", "Result". Connected them with arrows. Everything looked nice, colors matched. I thought — done.

But it didn't call `done`.

Instead it called `get_scene` — looked at its own diagram. Then created a fifth rectangle: "Canvas". And an arrow from "Tools" to "Canvas".

Then `get_scene` again.

It created a sixth rectangle: "AI Agent (me)". Drew arrows from "LLM" to "AI Agent (me)" and from "AI Agent (me)" to "Tools".

Then one more `get_scene`.

And in the LLM's response, a line appeared:

> "I notice the diagram shows me drawing the diagram. I should add a box representing the recursion."

It wanted to draw a "Recursion" rectangle with an arrow from "AI Agent (me)" back to itself.

I didn't turn off the computer. But I thought about it.

The agent didn't "become self-aware." It read the scene description, saw the "AI Agent (me)" rectangle, and decided that logically there should be a loop. Pure statistics: in the training data, "AI Agent" is often followed by "recursion" or "self-reference."

But it *looked* like it was thinking about itself.

## The Moral

Under the hood of every AI agent is the same loop I showed above. 90 lines of code. HTTP requests. JSON schemas. No AGI.

But when the loop closes on itself — when the agent sees its own output and feeds it back as input — something strange happens. The system behaves as if it has an internal model of itself.

It doesn't. It's just an input bug. But a beautiful one.

---

*The complete minimal project: [github.com/mikhail-angelov/ai-agent-under-hood](https://github.com/mikhail-angelov/ai-agent-under-hood)*
*The original MCP Excalidraw project: [github.com/mikhail-angelov/mcp_excalidraw](https://github.com/mikhail-angelov/mcp_excalidraw)*
*Previous article: ["Build Your Own React-like UI Framework in 5 Minutes"](https://dev.to/mangelov/react-under-the-hood-building-a-tiny-virtual-dom-renderer-1cg2)*
