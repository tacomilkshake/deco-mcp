import type { DecoClient } from '../../src/deco.js'

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
}

export interface ToolSchema {
  type: 'object'
  properties: Record<string, ToolParameter>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolSchema
  execute: (client: DecoClient, args: Record<string, unknown>) => Promise<unknown>
}

export const decoTools: ToolDefinition[] = [
  {
    name: 'clients_list',
    description: 'List all connected clients on the Deco mesh network. Returns array of {mac, name, ip, connection_type, interface, wire_type, online, up_speed, down_speed}. Names are decoded from base64.',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (client) => client.getClients()
  },
  {
    name: 'devices_list',
    description: 'List all Deco mesh nodes. Returns array of {mac, role, nickname, hardware_ver, software_ver, inet_status, connection_types}. Nicknames are decoded from base64.',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (client) => client.getDevices()
  },
  {
    name: 'network_status',
    description: 'Get WAN/LAN network status and CPU/memory performance. Combines wan_ipv4 and performance endpoints.',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (client) => {
      const [wan, performance] = await Promise.all([
        client.getWanStatus(),
        client.getPerformance()
      ])
      return { wan, performance }
    }
  },
  {
    name: 'wifi_status',
    description: 'Get WiFi band configuration including which bands are enabled for host, guest, and IoT networks.',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (client) => client.getWifiStatus()
  }
]

export function getTool(name: string): ToolDefinition | undefined {
  return decoTools.find(t => t.name === name)
}

export function toMcpTools(): Array<{
  name: string
  description: string
  inputSchema: ToolSchema
}> {
  return decoTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters
  }))
}
