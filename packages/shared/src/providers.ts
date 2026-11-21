export const PROVIDER_IDS = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'deepseek', 'mistral'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ApiStyle = 'openai' | 'anthropic' | 'google';

export interface ModelDef {
  id: string;
  label: string;
  /** relative cost tier — "$" cheap, "$$$" premium. Approximate; check provider pricing. */
  cost: '$' | '$$' | '$$$';
  hint: string;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  style: ApiStyle;
  baseUrl: string;
  keyPrefix?: string;
  keyUrl: string;
  models: ModelDef[];
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    style: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', cost: '$', hint: 'Fast and cheap — great default' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', cost: '$', hint: 'Very low cost' },
      { id: 'gpt-4.1', label: 'GPT-4.1', cost: '$$', hint: 'Stronger reasoning' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', cost: '$$', hint: 'Newer generation, balanced' },
      { id: 'gpt-5', label: 'GPT-5', cost: '$$$', hint: 'Most capable OpenAI model' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    style: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', cost: '$', hint: 'Fastest Claude, low cost' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', cost: '$$', hint: 'Best balance for support agents' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', cost: '$$$', hint: 'Most capable Claude' },
    ],
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    style: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', cost: '$', hint: 'Cheapest Gemini' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', cost: '$', hint: 'Fast, generous free tier' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', cost: '$$', hint: 'Strongest Gemini' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    style: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    keyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', cost: '$', hint: 'Very fast responses' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', cost: '$', hint: 'Ultra cheap, simple tasks' },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', cost: '$', hint: 'Open-weight, tool calling' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    style: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefix: 'sk-or-',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini (via OpenRouter)', cost: '$', hint: 'One key, many models' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (via OpenRouter)', cost: '$', hint: 'Cheap and fast' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (via OpenRouter)', cost: '$', hint: 'Open model' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    style: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', cost: '$', hint: 'Very low cost, good quality' }],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    style: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', cost: '$', hint: 'Cheap, multilingual' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium', cost: '$$', hint: 'Balanced' },
      { id: 'mistral-large-latest', label: 'Mistral Large', cost: '$$', hint: 'Most capable Mistral' },
    ],
  },
};
