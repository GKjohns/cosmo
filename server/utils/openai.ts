import OpenAI from 'openai'

let _client: OpenAI | null = null

export function serverOpenAI() {
  if (_client) {
    return _client
  }

  const config = useRuntimeConfig()

  _client = new OpenAI({
    apiKey: config.openaiApiKey
  })

  return _client
}
