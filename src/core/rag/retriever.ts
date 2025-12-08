// Retriever - Recherche hybride pour RAG

import { FoundryClient } from '../services/foundry-client';
import type { AgentContext, SearchResult, RAGConfig } from '../types';

export interface RetrieveOptions {
  query: string;
  filters?: Record<string, unknown>;
  topK?: number;
}

export class Retriever {
  private foundry: FoundryClient;
  private config: RAGConfig;

  constructor(context: AgentContext) {
    this.foundry = new FoundryClient(context.env);
    this.config = context.config.rag;
  }

  async retrieve(options: RetrieveOptions): Promise<SearchResult[]> {
    const topK = options.topK ?? this.config.retriever.topK;

    // Recherche parallèle lexicale + sémantique
    const [lexical, semantic] = await Promise.all([
      this.foundry.queryLexical(options.query, options.filters, topK),
      this.foundry.searchSemantic(options.query, options.filters, topK),
    ]);

    // Fusion RRF
    return this.reciprocalRankFusion(lexical, semantic);
  }

  private reciprocalRankFusion(
    list1: SearchResult[],
    list2: SearchResult[]
  ): SearchResult[] {
    const k = this.config.retriever.fusionK;
    const scores = new Map<string, number>();
    const docs = new Map<string, SearchResult>();

    const LEXICAL_WEIGHT = 0.6;
    const SEMANTIC_WEIGHT = 0.4;

    list1.forEach((doc, rank) => {
      const score = LEXICAL_WEIGHT / (k + rank + 1);
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + score);
      docs.set(doc.id, doc);
    });

    list2.forEach((doc, rank) => {
      const score = SEMANTIC_WEIGHT / (k + rank + 1);
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + score);
      if (!docs.has(doc.id)) docs.set(doc.id, doc);
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => {
        const doc = docs.get(id)!;
        return { ...doc, score };
      });
  }
}
