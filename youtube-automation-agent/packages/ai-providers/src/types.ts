export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionOptions {
  /** Override the provider's default model. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON response when supported. */
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatProvider {
  /** Stable identifier, e.g. "openai". */
  readonly name: string;
  /** Whether the required API key is configured. */
  isAvailable(): boolean;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}
