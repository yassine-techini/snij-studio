// Generator - Génération de réponse via LLM

import { LLMClient } from '../services/llm-client';
import type { AgentContext, RAGAgentConfig } from '../types';

export interface GenerateOptions {
  prompt: string;
  systemPrompt: string;
  language: 'ar' | 'fr' | 'en';
}

export class Generator {
  private llm: LLMClient;
  private config: RAGAgentConfig;

  constructor(context: AgentContext) {
    this.llm = new LLMClient(context.env);
    this.config = context.config.agents.rag;
  }

  async generate(options: GenerateOptions): Promise<string> {
    return this.llm.generate({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      model: this.config.model,
    });
  }

  async *generateStream(
    options: GenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const stream = this.llm.generateStream({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      model: this.config.model,
    });

    for await (const token of stream) {
      yield token;
    }
  }
}
