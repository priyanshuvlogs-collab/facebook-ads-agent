import { ExternalApiError, createLogger, withRetry } from "@yta/shared";
import type {
  ChatMessage,
  ChatProvider,
  CompletionOptions,
  CompletionResult,
} from "./types";

const logger = createLogger("ai-providers");

interface OpenAiCompatibleConfig {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: () => string | undefined;
  /** Some providers don't support response_format json_object. */
  supportsJsonMode?: boolean;
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

/**
 * Generic client for the OpenAI-compatible chat completions API surface.
 * OpenAI, Groq and Together all speak this protocol.
 */
export class OpenAiCompatibleProvider implements ChatProvider {
  readonly name: string;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.name = config.name;
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiKey());
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const apiKey = this.config.apiKey();
    if (!apiKey) {
      throw new ExternalApiError(`${this.name} API key not configured`, this.name, 503);
    }

    const model = options.model ?? this.config.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.jsonMode && (this.config.supportsJsonMode ?? true)) {
      body.response_format = { type: "json_object" };
    }

    const execute = async (): Promise<CompletionResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 120_000
      );
      try {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const json = (await response.json()) as OpenAiChatResponse;
        if (!response.ok) {
          throw new ExternalApiError(
            json.error?.message ?? `HTTP ${response.status}`,
            this.name,
            response.status
          );
        }
        const text = json.choices?.[0]?.message?.content;
        if (!text) {
          throw new ExternalApiError("Empty completion response", this.name);
        }
        return {
          text,
          provider: this.name,
          model: json.model ?? model,
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
        };
      } finally {
        clearTimeout(timeout);
      }
    };

    return withRetry(execute, {
      attempts: 3,
      baseDelayMs: 2000,
      shouldRetry: (error) =>
        error instanceof ExternalApiError
          ? error.statusCode === 429 || error.statusCode >= 500
          : true,
      onRetry: (error, attempt) =>
        logger.warn(`${this.name} completion retry`, { attempt, error }),
    });
  }
}
