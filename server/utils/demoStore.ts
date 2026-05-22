/**
 * In-memory fixtures for cosmo's demo mode (no Supabase configured).
 *
 * Two roles:
 *   1. Static demo data — profile, organization, membership, subscription —
 *      that endpoints return without round-tripping to Postgres.
 *   2. A simple in-memory chat store so the AI Gateway round-trip works:
 *      POST /api/chats creates a row, POST /api/chats/[id] streams a reply
 *      and persists it, GET /api/chats lists the sidebar.
 *
 * Everything lives in module-scoped state. It's reset whenever the dev
 * server restarts — that's fine for a demo, and it sidesteps the need for
 * a SQLite/JSON file we'd otherwise have to gitignore.
 */

import type { UIMessage } from 'ai'
import {
  DEMO_MEMBERSHIP_ID,
  DEMO_ORG_ID,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  DEMO_USER_NAME
} from './runtimeKeys'
import type { Chat, ChatSummary } from './chats'
import { normalizeMessages, serializeMessages } from './chats'

export interface DemoProfile {
  id: string
  display_name: string
  avatar_url: string | null
  timezone: string
  is_employee: boolean
  is_test_user: boolean
  current_focus: string | null
  title: string | null
  skills: string[]
  is_technical: boolean
  ai_context: string | null
  created_at: string
  updated_at: string
}

export interface DemoOrganization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface DemoMembership {
  membershipId: string
  role: 'admin' | 'member'
  organization: DemoOrganization
}

const NOW = new Date('2026-01-01T00:00:00.000Z').toISOString()

export const DEMO_PROFILE: DemoProfile = {
  id: DEMO_USER_ID,
  display_name: DEMO_USER_NAME,
  avatar_url: null,
  timezone: 'America/New_York',
  is_employee: true,
  is_test_user: false,
  current_focus: 'Exploring the cosmo demo',
  title: 'Founder',
  skills: ['product', 'design', 'engineering'],
  is_technical: true,
  ai_context: null,
  created_at: NOW,
  updated_at: NOW
}

export const DEMO_ORGANIZATION: DemoOrganization = {
  id: DEMO_ORG_ID,
  name: DEMO_ORG_NAME,
  slug: DEMO_ORG_SLUG,
  created_at: NOW
}

export const DEMO_MEMBERSHIP: DemoMembership = {
  membershipId: DEMO_MEMBERSHIP_ID,
  role: 'admin',
  organization: DEMO_ORGANIZATION
}

export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: DEMO_USER_EMAIL
}

// --- Chat store -------------------------------------------------------------

type StoredChat = {
  id: string
  title: string
  userId: string
  orgId: string | null
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

const chatStore = new Map<string, StoredChat>()

export function listDemoChats(): ChatSummary[] {
  return Array.from(chatStore.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
}

export function getDemoChat(id: string): Chat | null {
  const chat = chatStore.get(id)
  if (!chat) return null
  return {
    id: chat.id,
    title: chat.title,
    userId: chat.userId,
    orgId: chat.orgId,
    messages: normalizeMessages(chat.messages),
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  }
}

export function createDemoChat(id: string, firstUserMessage: UIMessage): { id: string, title: string } {
  const now = new Date().toISOString()
  chatStore.set(id, {
    id,
    title: '',
    userId: DEMO_USER_ID,
    orgId: DEMO_ORG_ID,
    messages: normalizeMessages([firstUserMessage]),
    createdAt: now,
    updatedAt: now
  })
  return { id, title: '' }
}

export function appendDemoChatMessages(id: string, newMessages: UIMessage[]): void {
  const chat = chatStore.get(id)
  if (!chat) return
  const existingIds = new Set(chat.messages.map(m => m.id))
  const filtered = newMessages.filter(m => !existingIds.has(m.id))
  if (filtered.length === 0) return
  chat.messages = normalizeMessages([
    ...serializeMessages(chat.messages),
    ...serializeMessages(filtered)
  ])
  chat.updatedAt = new Date().toISOString()
}

export function setDemoChatTitle(id: string, title: string): void {
  const chat = chatStore.get(id)
  if (!chat) return
  chat.title = title
  chat.updatedAt = new Date().toISOString()
}

export function deleteDemoChat(id: string): boolean {
  return chatStore.delete(id)
}
