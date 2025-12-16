// Client LLM (Claude API)

import Anthropic from '@anthropic-ai/sdk';
import type { Bindings } from '../types';

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface StreamGenerateOptions extends GenerateOptions {
  onToken?: (token: string) => void;
}

export class LLMClient {
  private client: Anthropic;
  private defaultModel = 'claude-3-5-sonnet-20241022';

  constructor(env: Bindings) {
    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  async generate(options: GenerateOptions): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: options.prompt },
    ];

    const response = await this.client.messages.create({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.3,
      system: options.systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content?.type === 'text') {
      return content.text;
    }

    return '';
  }

  async *generateStream(
    options: StreamGenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: options.prompt },
    ];

    const stream = this.client.messages.stream({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.3,
      system: options.systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
