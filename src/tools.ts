export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

const API = 'http://localhost:3000/api'

const TOOLS: ToolDefinition[] = [
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

async function runTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'create_element':
      return (await fetch(`${API}/elements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      })).json()

    case 'batch_create':
      return (await fetch(`${API}/elements/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: args.elements })
      })).json()

    case 'update_element':
      return (await fetch(`${API}/elements/${args.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      })).json()

    case 'delete_element':
      return (await fetch(`${API}/elements/${args.id}`, { method: 'DELETE' })).json()

    case 'clear_canvas':
      return (await fetch(`${API}/elements`, { method: 'DELETE' })).json()

    case 'get_scene':
      const res = await fetch(`${API}/elements`)
      const data = await res.json()
      return data.elements.length === 0
        ? 'Canvas is empty'
        : data.elements.map((e: any) => `[${e.type}] "${e.text || ''}" at (${e.x}, ${e.y})`).join('\n')

    default:
      return `Unknown tool: ${name}`
  }
}

export { TOOLS, runTool }
