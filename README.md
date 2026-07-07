# AI Agent Under the Hood

A minimal AI agent demo: what every AI coding agent looks like under the hood — just an LLM, a REST API, and a loop.

## Structure

```
server/          Express + Excalidraw REST API (canvas server)
agent/agent.js   90-line AI agent loop — no frameworks, no MCP, no LangChain
article-ru.md    Russian article (for Habr)
```

## Run

```bash
# 1. Start the canvas server
cd server && npm install && PORT=3000 node index.js

# 2. In another terminal, run the agent
cd agent && LLM_KEY=your_key node agent.js "Draw a flowchart"
```

The agent speaks to your LLM (OpenAI-compatible, set `LLM_URL` and `LLM_MODEL` env vars), the LLM decides which tools to call, and the agent executes them as HTTP requests to the canvas.

Open `http://localhost:3000` to see the canvas in your browser.
