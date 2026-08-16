import { ConfigurationError, createLogger, errorMessage, getEnv } from "@yta/shared";
import { AnthropicProvider } from "./anthropic";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { ChatMessage, ChatProvider, CompletionOptions, CompletionResult } from "./types";

const logger = createLogger("ai-providers:registry");

function buildProviders(): ChatProvider[] {
  return [
    new OpenAiCompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o-mini",
      apiKey: () => getEnv().OPENAI_API_KEY,
    }),
    new AnthropicProvider(),
    new OpenAiCompatibleProvider({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.3-70b-versatile",
      apiKey: () => getEnv().GROQ_API_KEY,
    }),
    new OpenAiCompatibleProvider({
      name: "together",
      baseUrl: "https://api.together.xyz/v1",
      defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      apiKey: () => getEnv().TOGETHER_API_KEY,
      supportsJsonMode: false,
    }),
  ];
}

/**
 * Registry that picks the first configured provider and transparently falls
 * back to the next one when a request fails. Free-first ordering can be
 * requested (Groq/Together generous free tiers before paid providers).
 */
export class ProviderRegistry {
  private readonly providers: ChatProvider[];

  constructor(preferFree = false) {
    const all = buildProviders();
    this.providers = preferFree
      ? [...all].sort((a, b) => freeRank(a.name) - freeRank(b.name))
      : all;
  }

  /** All providers that currently have an API key configured. */
  available(): ChatProvider[] {
    return this.providers.filter((p) => p.isAvailable());
  }

  /** True if at least one provider is usable. */
  hasAnyProvider(): boolean {
    return this.available().length > 0;
  }

  /** Get a specific provider by name (must be configured). */
  get(name: string): ChatProvider {
    const provider = this.providers.find((p) => p.name === name);
    if (!provider) throw new ConfigurationError(`Unknown AI provider: ${name}`);
    if (!provider.isAvailable()) {
      throw new ConfigurationError(`AI provider ${name} has no API key configured`);
    }
    return provider;
  }

  /**
   * Run a completion against the first available provider, falling back to
   * the next on failure.
   */
  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const candidates = this.available();
    if (candidates.length === 0) {
      throw new ConfigurationError(
        "No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY or TOGETHER_API_KEY."
      );
    }

    let lastError: unknown;
    for (const provider of candidates) {
      try {
        return await provider.complete(messages, options);
      } catch (error) {
        lastError = error;
        logger.warn("provider failed, trying next", {
          provider: provider.name,
          error: errorMessage(error),
        });
      }
    }
    throw lastError;
  }
}

function freeRank(name: string): number {
  const order = ["groq", "together", "openai", "anthropic"];
  const idx = order.indexOf(name);
  return idx === -1 ? order.length : idx;
}

let defaultRegistry: ProviderRegistry | undefined;

/** Shared registry instance (default provider ordering). */
export function getProviderRegistry(): ProviderRegistry {
  if (!defaultRegistry) defaultRegistry = new ProviderRegistry();
  return defaultRegistry;
}
