// Agent RAG (Retrieval-Augmented Generation)

import { BaseAgent } from './base-agent';
import { RAGPipeline } from '../rag/pipeline';
import type { AgentContext, AgentResult, Source } from '../types';

export interface RAGInput {
  question: string;
  filters?: Record<string, unknown>;
  maxSources?: number;
  stream?: boolean;
}

export interface RAGOutput {
  answer: string;
  sources: Source[];
  language: string;
  confidence: number;
}

export class RAGAgent extends BaseAgent<RAGInput, RAGOutput> {
  private pipeline: RAGPipeline;

  constructor(context: AgentContext) {
    super(context, 'RAGAgent');
    this.pipeline = new RAGPipeline(context);
  }

  async execute(input: RAGInput): Promise<AgentResult<RAGOutput>> {
    const startTime = Date.now();

    try {
      const language = this.detectLanguage(input.question);
      this.log('RAG Query', { language, questionLength: input.question.length });

      // Exécution du pipeline RAG
      const result = await this.pipeline.query({
        question: input.question,
        language,
        filters: input.filters,
        topK: input.maxSources ?? this.config.agents.rag.maxSources,
        systemPrompt: this.getSystemPrompt(language),
      });

      return {
        success: true,
        data: {
          answer: result.answer,
          sources: result.sources,
          language,
          confidence: result.confidence,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.log('Error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'RAG failed',
        data: {
          answer: this.getFallbackMessage('error'),
          sources: [],
          language: this.context.language,
          confidence: 0,
        },
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Version streaming du RAG (pour SSE)
   */
  async *executeStream(
    input: RAGInput
  ): AsyncGenerator<{ type: string; data: unknown }, void, unknown> {
    const language = this.detectLanguage(input.question);

    // Yield initial event
    yield {
      type: 'start',
      data: { language },
    };

    try {
      // Récupérer les sources d'abord
      const sources = await this.pipeline.retrieveSources({
        question: input.question,
        language,
        filters: input.filters,
        topK: input.maxSources ?? this.config.agents.rag.maxSources,
      });

      yield {
        type: 'sources',
        data: { sources },
      };

      // Stream la génération
      const generator = this.pipeline.generateStream({
        question: input.question,
        language,
        sources,
        systemPrompt: this.getSystemPrompt(language),
      });

      for await (const token of generator) {
        yield {
          type: 'token',
          data: { token },
        };
      }

      yield {
        type: 'done',
        data: {
          confidence: this.calculateConfidence(sources),
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Stream failed',
        },
      };
    }
  }

  private calculateConfidence(sources: Source[]): number {
    if (sources.length === 0) return 0;
    // Simple confidence based on number of sources found
    return Math.min(sources.length / 5, 1);
  }
}
