# AI Gateway usage — cosmo (project mirror)

> **Canonical doc:** `~/claude-ops/conventions/ai_sdk_usage.md`. This is the cosmo-specific
> mirror — how *this* repo talks to the Vercel AI Gateway. Where the two disagree, the
> canonical doc wins; fix the drift there first, then here. A clone keeps this file and
> extends it with its own model keys and call sites.

Everything cosmo bills — chat, the editor's inline completion, the chat-title call, the
Inngest digest worker — goes through the Vercel AI SDK (`ai@7`, `@ai-sdk/vue@4`) against
the AI Gateway on **one** key (`AI_GATEWAY_API_KEY`). No provider package, no `openai`
SDK, no direct-provider fallback. With the key unset the chat route streams a canned "add
the key" reply and `/api/completion` returns 503, so demo mode never 500s.

---

## TL;DR — which primitive

| Shape | Server | Client | Cosmo call site |
|---|---|---|---|
| Streams to a user, multi-turn, tools | `streamText` → `createUIMessageStream` + `createUIMessageStreamResponse` | `useChat()` + `UChat*` | `server/api/chats/[id].post.ts` |
| Streams plain text (one shot) | `streamText` → `createTextStreamResponse` | `useCompletion({ streamProtocol: 'text' })` | `server/api/completion.post.ts` |
| Lands in a DB row (structured) | `generateText` + `Output.object({ schema })` | — | `server/inngest/functions/generate-digest.ts` |
| Plain string, no UI | `generateText` | — | `generateChatTitle` in `server/utils/chats.ts` |

ai@7 names: `instructions` (not `system`), `stopWhen: isStepCount(n)`,
`toUIMessageStream({ stream: result.stream })`, `createUIMessageStream({ onEnd })`, and a
top-level `reasoning: 'minimal' | 'low' | 'medium' | 'high'` — the SDK translates it per
provider, so no hand-built `providerOptions`. The old names still work as deprecated aliases;
use the new ones.

## The `MODELS` map

`src/server/utils/aiModels.ts` is the only place a model id appears:

```ts
export const MODELS = {
  chat: 'anthropic/claude-sonnet-4.6',   // streaming chat surface — reasoning + tool calls
  fast: 'openai/gpt-5-nano',             // editor inline AI, digests; latency-sensitive
  titleGen: 'openai/gpt-5-nano',         // chat title before the first stream
  reasoning: 'openai/gpt-5'              // structured / heavy workers
} as const
```

Bare `'provider/model'` strings resolve through the gateway automatically when
`AI_GATEWAY_API_KEY` is set. Swapping provider is a one-line change here. Projects extend the
registry with task-specific keys (`journalExtract`, `clipTitle`, …) rather than reusing the
generic ones for everything. `isRegisteredModel()` is what the chat route uses to validate a
client-sent `model`.

## The chat route — `POST /api/chats/:id`

Mirrors `nuxt-ui-templates/chat` (Aug 2026). `useChat` / `DefaultChatTransport` send the full
history every turn: `{ id, messages: UIMessage[], trigger?, messageId?, model? }`. Order of
operations, load-bearing:

1. Validate the body (zod; `model` must pass `isRegisteredModel`, else 400), load + authorize
   the chat — demo store or Supabase.
2. No title yet → `generateChatTitle` **before** streaming (`MODELS.titleGen`,
   `reasoning: 'minimal'`), persist it, and emit a transient `data-chat-title` part so the
   sidebar updates mid-stream.
3. Stream:

```ts
const stream = createUIMessageStream({
  originalMessages: messages,
  execute: async ({ writer }) => {
    const result = streamText({
      abortSignal: abortController.signal,      // res 'close' → abort (stop button / tab close)
      model: body.model ?? MODELS.chat,
      instructions: buildAISystemPrompt({ ... }),
      messages: await convertToModelMessages(messages),
      ...(tools && { tools }),                  // org-scoped; skipped in demo mode
      reasoning: 'low',
      stopWhen: isStepCount(10),
      experimental_transform: smoothStream()
    })
    writer.merge(toUIMessageStream({ stream: result.stream, sendReasoning: true, sendSources: true }))
  },
  onEnd: ({ messages }) => persistChatMessages(backend, id, messages)  // merge-by-id into chats.messages jsonb
})
return createUIMessageStreamResponse({ stream })
```

4. `onEnd` merges by message id against the stored `chats.messages` jsonb (the SDK can
   re-emit existing parts; a full overwrite duplicates them) and fires one detached
   `chat_message_sent` analytics event (counts only, never content).

Client side is `useChat()` from `@ai-sdk/vue` rendering through `UChatMessages` /
`UChatPrompt` / Comark — see `~/claude-ops/conventions/nuxt_ui_chat.md`.

## Workers — `generateText + Output.object`

`generate-digest.ts` is the reference Inngest worker. The model call lives inside a
`step.run` so a retry never double-bills:

```ts
const { output } = await generateText({
  model: MODELS.fast,
  output: Output.object({ schema: digestSchema }),   // zod
  reasoning: 'low',
  instructions: 'Synthesize recent work activity into a daily digest …',
  prompt: JSON.stringify(activity)
})
if (!output) throw new Error('Digest generation returned empty response.')
```

`generateObject` is the equivalent single-call form; either is fine. What is **not** fine in
a gateway-only project: importing `openai`, reading a provider key from env, or naming a
model at the call site.

## Gotchas

- `reasoning: 'minimal'` on `gpt-5-nano` for the title + completion calls is deliberate —
  the model's default reasoning burned the tiny token budget and returned empty completions
  (Sprint 2, 2026-08-18). Leave it.
- `useCompletion`'s callback is `onFinish` — that one is not renamed in ai@7.
- Budget/price helpers (`MODEL_PRICING`, `estimateCostUsd`, credit-error detection) were
  dropped from the template; lift Daylight's `aiModels.ts` if a project needs them. Same for
  the per-user AI usage gate (`aiUsage.ts`) — migration `0007_usage_tracking` already carries
  the tables.
- Realtime voice and transcription are not in cosmo. Camera Shy's mirror
  (`~/Programming/Workspace/camera_shy/internal_docs/ai_gateway_usage.md`) has the
  gateway-native realtime pattern (token route → `RealtimeSetupResponse`, the
  `Experimental_AbstractRealtimeSession` subclass, the recording seam); Daylight's has the
  REST transcription endpoint.
