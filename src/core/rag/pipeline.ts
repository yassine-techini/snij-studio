// Pipeline RAG complet

import { Retriever } from './retriever';
import { Reranker } from './reranker';
import { Augmenter } from './augmenter';
import { Generator } from './generator';
import type { AgentContext, Source, SearchResult } from '../types';

export interface RAGQueryOptions {
  question: string;
  language: 'ar' | 'fr' | 'en';
  filters?: Record<string, unknown>;
  topK: number;
  systemPrompt: string;
}

export interface RAGResult {
  answer: string;
  sources: Source[];
  confidence: number;
}

export class RAGPipeline {
  private retriever: Retriever;
  private reranker: Reranker;
  private augmenter: Augmenter;
  private generator: Generator;
  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
    this.retriever = new Retriever(context);
    this.reranker = new Reranker(context);
    this.augmenter = new Augmenter(context.config.prompts);
    this.generator = new Generator(context);
  }

  async query(options: RAGQueryOptions): Promise<RAGResult> {
    // Step 1: Retrieve candidates
    const candidates = await this.retriever.retrieve({
      query: options.question,
      filters: options.filters,
      topK: 50, // Always retrieve more, then rerank
    });

    if (candidates.length === 0) {
      return {
        answer: this.getNoResultsMessage(options.language),
        sources: [],
        confidence: 0,
      };
    }

    // Step 2: Rerank
    const reranked = this.reranker.rerank(options.question, candidates);

    if (reranked.length === 0) {
      return {
        answer: this.getNoResultsMessage(options.language),
        sources: [],
        confidence: 0,
      };
    }

    // Step 3: Augment (build prompt)
    const prompt = this.augmenter.buildPrompt(
      options.question,
      reranked.slice(0, options.topK),
      options.language
    );

    // Step 4: Generate
    const answer = await this.generator.generate({
      prompt,
      systemPrompt: options.systemPrompt,
      language: options.language,
    });

    // Format sources
    const sources = this.formatSources(reranked.slice(0, options.topK), options.language);

    // Calculate confidence
    const confidence = this.calculateConfidence(reranked);

    return { answer, sources, confidence };
  }

  /**
   * Récupère uniquement les sources (pour streaming)
   */
  async retrieveSources(options: {
    question: string;
    language: 'ar' | 'fr' | 'en';
    filters?: Record<string, unknown>;
    topK: number;
  }): Promise<Source[]> {
    const candidates = await this.retriever.retrieve({
      query: options.question,
      filters: options.filters,
      topK: 50,
    });

    const reranked = this.reranker.rerank(options.question, candidates);

    return this.formatSources(reranked.slice(0, options.topK), options.language);
  }

  /**
   * Génère la réponse en streaming
   */
  async *generateStream(options: {
    question: string;
    language: 'ar' | 'fr' | 'en';
    sources: Source[];
    systemPrompt: string;
  }): AsyncGenerator<string, void, unknown> {
    // Reconstruire les documents pour le prompt
    const docs: SearchResult[] = options.sources.map((s) => ({
      id: s.id,
      type: s.type as 'loi' | 'decret' | 'jurisprudence',
      title: s.title,
      numero: s.numero,
      date: s.date,
      content: s.relevantPassage,
      score: 1,
    }));

    const prompt = this.augmenter.buildPrompt(
      options.question,
      docs,
      options.language
    );

    const stream = this.generator.generateStream({
      prompt,
      systemPrompt: options.systemPrompt,
      language: options.language,
    });

    for await (const token of stream) {
      yield token;
    }
  }

  private formatSources(
    documents: SearchResult[],
    language: 'ar' | 'fr' | 'en'
  ): Source[] {
    return documents.map((doc) => ({
      id: doc.id,
      type: doc.type,
      title: language === 'ar' ? doc.titleAr ?? doc.title : doc.titleFr ?? doc.title,
      numero: doc.numero,
      date: doc.date,
      relevantPassage: (doc.content ?? '').substring(0, 500),
      url: `/${language}/document/${doc.id}`,
    }));
  }

  private getNoResultsMessage(language: 'ar' | 'fr' | 'en'): string {
    const messages = {
      ar: 'لم أجد معلومات حول هذا الموضوع في النصوص المتاحة. أنصحك بمراجعة مختص قانوني.',
      fr: "Je n'ai pas trouvé d'information sur ce sujet dans les textes disponibles. Je vous conseille de consulter un professionnel du droit.",
      en: 'I did not find information on this topic in the available texts. I advise you to consult a legal professional.',
    };
    return messages[language];
  }

  private calculateConfidence(documents: SearchResult[]): number {
    if (documents.length === 0) return 0;
    const avgScore = documents.reduce((sum, d) => sum + d.score, 0) / documents.length;
    return Math.min(avgScore * 1.5, 1); // Scale up and cap at 1
  }
}
