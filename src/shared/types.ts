export type ParsedEvent =
  | { type: 'agent_message'; text: string }
  | { type: 'thought'; status: 'loading' | 'ready'; text: string }
  | { type: 'tool_call_start'; toolName: string; args?: string }
  | { type: 'tool_call_output'; output: string }
  | { type: 'tool_call_end'; status: 'completed' | 'failed' }
  | { type: 'permission_request'; action: string; context: string };
