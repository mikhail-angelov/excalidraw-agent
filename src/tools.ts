import {
  getSessionElements, addElement, getElement, updateElement, removeElement,
  batchAddElements, clearSession, duplicateElement, queryElements,
  groupElements, ungroupElements, lockElements, unlockElements,
  alignElements, distributeElements, snapshotScene, restoreSnapshot,
  setViewport, DIAGRAM_DESIGN_GUIDE, getResource
} from './model.js'

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'create_element',
    description: 'Create a new Excalidraw element. For arrows, use startElementId/endElementId to bind to shapes.',
    parameters: {
      type: 'object',
      properties: {
        type: { enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text', 'line', 'freedraw'] },
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        text: { type: 'string' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        strokeStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
        fontSize: { type: 'number' },
        fontFamily: { type: 'string' },
        roughness: { type: 'number' },
        opacity: { type: 'number' },
        fillStyle: { type: 'string' },
        startElementId: { type: 'string' },
        endElementId: { type: 'string' },
        endArrowhead: { type: 'string', enum: ['arrow', 'bar', 'dot', 'triangle'] },
        startArrowhead: { type: 'string', enum: ['arrow', 'bar', 'dot', 'triangle'] },
        locked: { type: 'boolean' },
      },
      required: ['type', 'x', 'y']
    }
  },
  {
    name: 'batch_create_elements',
    description: 'Create multiple elements at once. Use for entire diagrams. Assign IDs to reference in arrows.',
    parameters: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text', 'line', 'freedraw'] },
              x: { type: 'number' }, y: { type: 'number' },
              width: { type: 'number' }, height: { type: 'number' },
              text: { type: 'string' },
              backgroundColor: { type: 'string' },
              strokeColor: { type: 'string' },
              strokeWidth: { type: 'number' },
              fontSize: { type: 'number' },
              startElementId: { type: 'string' },
              endElementId: { type: 'string' },
            },
            required: ['type', 'x', 'y']
          }
        }
      },
      required: ['elements']
    }
  },
  {
    name: 'get_element',
    description: 'Get a single element by ID',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
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
        strokeColor: { type: 'string' },
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        fontSize: { type: 'number' },
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
    name: 'query_elements',
    description: 'Query elements by type or bounding box',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text', 'line', 'freedraw'] },
        ids: { type: 'array', items: { type: 'string' } },
        bbox: {
          type: 'object',
          properties: {
            xMin: { type: 'number' }, xMax: { type: 'number' },
            yMin: { type: 'number' }, yMax: { type: 'number' }
          }
        }
      }
    }
  },
  {
    name: 'duplicate_elements',
    description: 'Duplicate an element (copy with offset)',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'get_scene',
    description: 'Get a text description of everything on the canvas',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'clear_canvas',
    description: 'Remove all elements from the canvas',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'group_elements',
    description: 'Group multiple elements together',
    parameters: { type: 'object', properties: { elementIds: { type: 'array', items: { type: 'string' } } }, required: ['elementIds'] }
  },
  {
    name: 'ungroup_elements',
    description: 'Ungroup a group of elements',
    parameters: { type: 'object', properties: { groupId: { type: 'string' } }, required: ['groupId'] }
  },
  {
    name: 'align_elements',
    description: 'Align elements (left, center, right, top, middle, bottom)',
    parameters: {
      type: 'object',
      properties: {
        elementIds: { type: 'array', items: { type: 'string' } },
        alignment: { type: 'string', enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] }
      },
      required: ['elementIds', 'alignment']
    }
  },
  {
    name: 'distribute_elements',
    description: 'Distribute elements evenly (horizontal, vertical)',
    parameters: {
      type: 'object',
      properties: {
        elementIds: { type: 'array', items: { type: 'string' } },
        direction: { type: 'string', enum: ['horizontal', 'vertical'] }
      },
      required: ['elementIds', 'direction']
    }
  },
  {
    name: 'lock_elements',
    description: 'Lock elements to prevent modification',
    parameters: { type: 'object', properties: { elementIds: { type: 'array', items: { type: 'string' } } }, required: ['elementIds'] }
  },
  {
    name: 'unlock_elements',
    description: 'Unlock elements',
    parameters: { type: 'object', properties: { elementIds: { type: 'array', items: { type: 'string' } } }, required: ['elementIds'] }
  },
  {
    name: 'snapshot_scene',
    description: 'Save a named snapshot of the current canvas state',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
  },
  {
    name: 'restore_snapshot',
    description: 'Restore the canvas to a named snapshot',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
  },
  {
    name: 'set_viewport',
    description: 'Control the canvas viewport (zoom, scroll, center)',
    parameters: {
      type: 'object',
      properties: {
        scrollToContent: { type: 'boolean' },
        scrollToElementId: { type: 'string' },
        zoom: { type: 'number' },
        offsetX: { type: 'number' },
        offsetY: { type: 'number' }
      }
    }
  },
  {
    name: 'read_diagram_guide',
    description: 'Get the design guide (colors, sizing, layout patterns, anti-patterns)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_resource',
    description: 'Get canvas resources (scene, elements, theme)',
    parameters: { type: 'object', properties: { resource: { type: 'string', enum: ['scene', 'elements', 'theme'] } }, required: ['resource'] }
  },
  {
    name: 'done',
    description: 'Call this when the diagram is complete',
    parameters: { type: 'object', properties: {} }
  }
]

export function runTool(name: string, args: Record<string, any>, sessionId: string): any {
  switch (name) {
    case 'create_element':
      return addElement(sessionId, args)

    case 'batch_create':
    case 'batch_create_elements':
      return batchAddElements(sessionId, args.elements || [])

    case 'get_element':
      return getElement(sessionId, args.id)

    case 'update_element':
      return updateElement(sessionId, args.id, args)

    case 'delete_element':
      return removeElement(sessionId, args.id)

    case 'query_elements':
      return queryElements(sessionId, args)

    case 'duplicate_elements':
      return duplicateElement(sessionId, args.id)

    case 'get_scene': {
      const els = [...getSessionElements(sessionId).values()]
      return els.length === 0
        ? 'Canvas is empty'
        : els.map((e: any) => `[${e.type}] "${e.text || ''}" at (${e.x}, ${e.y})`).join('\n')
    }

    case 'clear_canvas':
      return clearSession(sessionId)

    case 'group_elements':
      return groupElements(sessionId, args.elementIds)

    case 'ungroup_elements':
      return ungroupElements(sessionId, args.groupId)

    case 'align_elements':
      return alignElements(sessionId, args.elementIds, args.alignment)

    case 'distribute_elements':
      return distributeElements(sessionId, args.elementIds, args.direction)

    case 'lock_elements':
      return lockElements(sessionId, args.elementIds)

    case 'unlock_elements':
      return unlockElements(sessionId, args.elementIds)

    case 'snapshot_scene':
      return snapshotScene(sessionId, args.name)

    case 'restore_snapshot':
      return restoreSnapshot(sessionId, args.name)

    case 'set_viewport':
      return setViewport(sessionId, args)

    case 'read_diagram_guide':
      return DIAGRAM_DESIGN_GUIDE

    case 'get_resource':
      return getResource(sessionId, args.resource)

    case 'done':
      return { done: true }

    default:
      return `Unknown tool: ${name}`
  }
}
