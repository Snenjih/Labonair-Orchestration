export type ParsedEvent =
  | { type: 'user_message'; text: string }
  | { type: 'agent_message'; text: string }
  | { type: 'thought'; status: 'loading' | 'ready'; text: string }
  | { type: 'tool_call_start'; toolName: string; args?: string }
  | { type: 'tool_call_output'; output: string }
  | { type: 'tool_call_end'; status: 'completed' | 'failed' }
  | { type: 'permission_request'; action: string; context: string; requestId: string }
  | { type: 'session_finished'; inputTokens?: number }
  | { type: 'hook_event'; hookType: string; message: string }
  | { type: 'stats_update'; linesAdded: number; linesRemoved: number };

export type SessionStatus = 'idle' | 'working' | 'permission_required' | 'finished' | 'error';

export interface McpServerEntry {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  url?: string;
  enabled: boolean;
}

export interface BridgeSettings {
  enabled: boolean;
  port: number;
  maxConnections: number;
  connectionTimeoutMinutes: number;
  requireReAuthOnReconnect: boolean;
  readOnlyMode: boolean;
  pushNotificationsEnabled: boolean;
  auditLogEnabled: boolean;
  allowedDeviceIds: string[];
}

export interface ConnectedDevice {
  id: string;
  name: string;
  connectedAt: number;
  lastActivity: number;
  ip: string;
  isReadOnly: boolean;
  pushSubscription?: string;
}

export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  enabled: false,
  port: 8765,
  maxConnections: 5,
  connectionTimeoutMinutes: 30,
  requireReAuthOnReconnect: false,
  readOnlyMode: false,
  pushNotificationsEnabled: true,
  auditLogEnabled: false,
  allowedDeviceIds: [],
};

export interface AgentSettings {
  defaultModel: string;
  defaultEffort: string;
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
  trustedTools: string[];
  mcpServers: McpServerEntry[];
  enabledHooks: string[];
  bridge: BridgeSettings;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultModel: 'claude-sonnet-4-6',
  defaultEffort: 'medium',
  permissionMode: 'default',
  trustedTools: [],
  mcpServers: [],
  enabledHooks: [],
  bridge: { ...DEFAULT_BRIDGE_SETTINGS },
};
