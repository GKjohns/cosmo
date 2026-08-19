/**
 * AI system prompt builder + helpers.
 * Assembles ambient context into a system prompt for System 1 (Vercel AI SDK streaming chat).
 */

type CurrentUser = {
  name: string | null
  title: string | null
  currentFocus: string | null
  organizationRole: string | null
}

export function buildAISystemPrompt(params: {
  currentUser: CurrentUser
  activityDigest?: string | null
}) {
  const { currentUser, activityDigest } = params

  const lines: string[] = [
    'You are Cosmo, an AI assistant for team operations.',
    'You help users manage items, track decisions, and stay on top of their work.',
    '',
    'Guidelines:',
    '- Be concise and direct.',
    '- Use the available tools to look up data before guessing.',
    '- Format dates in a human-friendly way.'
  ]

  if (currentUser.name || currentUser.title) {
    lines.push('', '## Current User')
    if (currentUser.name) lines.push(`Name: ${currentUser.name}`)
    if (currentUser.title) lines.push(`Title: ${currentUser.title}`)
    if (currentUser.organizationRole) lines.push(`Org role: ${currentUser.organizationRole}`)
    if (currentUser.currentFocus) lines.push(`Current focus: ${currentUser.currentFocus}`)
  }

  if (activityDigest?.trim()) {
    lines.push('', '## Recent Activity', activityDigest)
  }

  return lines.join('\n')
}

export function extractMessageContent(parts: Array<{ type: string, text?: string }>) {
  return parts
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text!)
    .join('\n')
    .trim()
}

export function shouldGenerateConversationTitle(currentTitle: string | null, firstUserMessage: string) {
  if (!firstUserMessage.trim()) return false
  return !currentTitle || currentTitle === 'New conversation'
}
