import type { UIMessage } from 'ai'

/**
 * Chat persistence helpers — Sprint 6.
 *
 * Mirrors the util shape from `nuxt-ui-templates/chat` + AIR-Bot's
 * `server/utils/chats.ts`. Cosmo doesn't carry AIR-Bot's legacy
 * `{ role, content }` back-compat path because cosmo never shipped a chat
 * surface that wrote that shape.
 *
 * Schema: `public.chats` (migration 008) stores the full UIMessage[] as
 * `messages jsonb`. The id-diff on message persistence (see
 * `server/api/chats/[id].post.ts`) is the load-bearing detail: full
 * overwrites duplicate parts when the AI SDK re-emits.
 */

type ChatRole = 'user' | 'assistant' | 'system'

type JsonValue
  = | string
    | number
    | boolean
    | null
    | { [key: string]: JsonValue | undefined }
    | JsonValue[]

export interface Chat {
  id: string
  title: string
  userId: string
  orgId: string | null
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatSummary {
  id: string
  title: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant' || value === 'system'
}

export function createTextMessage(role: ChatRole, text: string, id?: string): UIMessage {
  return {
    id: (id ?? crypto.randomUUID()) as UIMessage['id'],
    role,
    parts: [{ type: 'text', text }]
  } as UIMessage
}

export function extractTextFromParts(parts: UIMessage['parts'] | unknown): string {
  if (!Array.isArray(parts)) return ''

  return parts
    .filter((part): part is { type: 'text', text: string } => {
      return isRecord(part) && part.type === 'text' && typeof part.text === 'string'
    })
    .map(part => part.text)
    .join('\n\n')
    .trim()
}

function normalizeMessage(message: unknown): UIMessage | null {
  if (!isRecord(message) || !isChatRole(message.role)) return null
  if (!Array.isArray(message.parts)) return null

  const id = typeof message.id === 'string' ? message.id : crypto.randomUUID()

  return {
    ...message,
    id,
    role: message.role,
    parts: message.parts
  } as UIMessage
}

export function normalizeMessages(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) return []
  return messages
    .map(normalizeMessage)
    .filter((message): message is UIMessage => message !== null)
}

export function serializeMessages(messages: UIMessage[]): JsonValue[] {
  return normalizeMessages(messages) as unknown as JsonValue[]
}
