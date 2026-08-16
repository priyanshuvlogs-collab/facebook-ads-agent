import { ExternalApiError, createLogger, getEnv, withRetry } from "@yta/shared";
import type {
  ChatMessage,
  ChatProvider,
  CompletionOptions,
  CompletionResult,
} from "./types";

const logger = createLogger("ai-providers:anthropic");

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: { message?: string };
}

/** Anthropic Messages API client (Claude models). */
export class AnthropicProvider implements ChatProvider {
  readonly name = "anthropic";
  private readonly defaultModel = "claude-3-5-haiku-latest";

  isAvailable(): boolean {
    return Boolean(getEnv().ANTHROPIC_API_KEY);
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const apiKey = getEnv().ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ExternalApiError("Anthropic API key not configured", this.name, 503);
    }

    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const chat = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const model = options.model ?? this.defaultModel;

    const execute = async (): Promise<CompletionResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 120_000
      );
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            ...(system ? { system } : {}),
            messages: chat,
          }),
          signal: controller.signal,
        });

        const json = (await response.json()) as AnthropicResponse;
        if (!response.ok) {
          throw new ExternalApiError(
            json.error?.message ?? `HTTP ${response.status}`,
            this.name,
            response.status
          );
        }
        const text = json.content
          ?.filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("");
        if (!text) {
          throw new ExternalApiError("Empty completion response", this.name);
        }
        return {
          text,
          provider: this.name,
          model: json.model ?? model,
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
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
        logger.warn("completion retry", { attempt, error }),
    });
  }
}
