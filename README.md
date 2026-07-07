# Excalidraw Agent

A minimal AI agent that draws diagrams on an Excalidraw canvas — just an LLM, a REST API, and a loop.

> **Based on [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) by yctimlin.**  
> The canvas server, element CRUD, and arrow binding logic are ported from that project — simplified, stripped of MCP/LangChain, and distilled to the core agent loop.

## Why This Exists

The original [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) is a full MCP server with 26 tools, LangChain integration, an AI chat panel, and Docker support. This fork shows what's *under the hood*: an AI agent in ~90 lines of code, no frameworks.

## Structure

```
server/          Express canvas with Excalidraw REST API
agent/agent.js   90-line AI agent loop — pure LLM + HTTP
```

## Run

```bash
# 1. Start the canvas
cd server && npm install && PORT=3000 node index.js

# 2. Run the agent
cd agent && LLM_KEY=your_key node agent.js "Draw a flowchart"
```

The agent speaks to any OpenAI-compatible LLM (`LLM_URL`, `LLM_MODEL`), the LLM decides which tools to call, and the agent executes them as HTTP requests to the canvas.

Open `http://localhost:3000` to see the canvas in your browser.

## Related

- [Original mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) — full MCP server with 26 tools
- [UI framework за 5 минут](https://habr.com/p/415857/) — minimal React-like VDOM (the article that inspired this approach)
