import type { UIMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { appendDemoChatMessages, getDemoChat, setDemoChatTitle } from './demoStore'

/**
 * Chat persistence helpers.
 *
 * Mirrors the util shape from `nuxt-ui-templates/chat` + AIR-Bot's
 * `server/utils/chats.ts`. Cosmo doesn't carry AIR-Bot's legacy
 * `{ role, content }` back-compat path because cosmo never shipped a chat
 * surface that wrote that shape.
 *
 * Schema: `public.chats` (migration 0008) stores the full UIMessage[] as
 * `messages jsonb`. The id-diff on message persistence
 * (`persistChatMessages`) is the load-bearing detail: full overwrites
 * duplicate parts when the AI SDK re-emits.
 *
 * `ChatBackend` is the one seam between demo mode (in-memory `demoStore`)
 * and the live Supabase path so `api/chats/[id].post.ts` has a single
 * persist-and-title flow instead of two forks.
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
  createdAt: string
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

/**
 * Minimal Supabase-client shape the persistence helpers need. Typed loosely
 * on purpose — cosmo has no generated `database.types.ts` (clones do; see
 * `project_bootstrap.md`).
 */
export interface ChatBackend {
  demo: boolean
  supabase?: SupabaseClient
}

/** Live-path client; throws if a caller forgot to attach one outside demo mode. */
function requireBackendClient(backend: ChatBackend): SupabaseClient {
  if (!backend.supabase) throw new Error('[chats] ChatBackend.supabase is required outside demo mode')
  return backend.supabase
}

const TITLE_INSTRUCTIONS = `You are a title generator for a chat:
- Generate a short title based on the first user's message
- The title should be less than 30 characters long
- The title should be a summary of the user's message
- Do not use quotes (' or ") or colons (:) or any other punctuation
- Do not use markdown, just plain text`

/** Cheapest-model title from the first user message; '' on failure. */
export async function generateChatTitle(firstMessage: UIMessage): Promise<string> {
  try {
    const { text } = await generateText({
      model: MODELS.titleGen,
      reasoning: 'minimal',
      instructions: TITLE_INSTRUCTIONS,
      prompt: JSON.stringify(firstMessage)
    })
    return text.trim()
  } catch (err) {
    console.error('[chats] Title generation failed', err)
    return ''
  }
}

export async function persistChatTitle(backend: ChatBackend, id: string, title: string): Promise<void> {
  if (backend.demo) {
    setDemoChatTitle(id, title)
    return
  }
  const { error } = await requireBackendClient(backend).from('chats').update({ title }).eq('id', id)
  if (error) console.error(`[chats] Failed to persist title for ${id}`, error)
}

/**
 * Merge the stream's messages into the stored history by id (against the
 * latest row, not the request snapshot): existing ids take the response's
 * version (an edited user message keeps its id — Sprint 5 edit flow), new
 * ids are appended. Never a blind overwrite: the SDK can re-emit existing
 * parts and that would duplicate them.
 */
export function mergeMessagesById(stored: UIMessage[], responseMessages: UIMessage[]): UIMessage[] {
  const byId = new Map(responseMessages.map(m => [m.id, m]))
  const existingIds = new Set(stored.map(m => m.id))
  return [
    ...stored.map(m => byId.get(m.id) ?? m),
    ...responseMessages.filter(m => !existingIds.has(m.id))
  ]
}

export async function persistChatMessages(backend: ChatBackend, id: string, responseMessages: UIMessage[]): Promise<void> {
  if (responseMessages.length === 0) return

  if (backend.demo) {
    if (getDemoChat(id)) appendDemoChatMessages(id, responseMessages)
    return
  }

  const supabase = requireBackendClient(backend)
  const { data: latest } = await supabase
    .from('chats')
    .select('id, messages')
    .eq('id', id)
    .maybeSingle()
  if (!latest) return

  const stored = normalizeMessages(latest.messages)

  const { error } = await supabase
    .from('chats')
    .update({
      messages: serializeMessages(mergeMessagesById(stored, responseMessages)),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  if (error) console.error(`[chats] Failed to persist messages for ${id}`, error)
}
