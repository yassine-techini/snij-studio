// Agent de recherche hybride (lexical + sémantique)

import { BaseAgent } from './base-agent';
import { FoundryClient } from '../services/foundry-client';
import type {
  AgentContext,
  AgentResult,
  SearchResult,
  Facets,
} from '../types';

export interface SearchInput {
  query: string;
  filters?: {
    type?: string[];
    domaine?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  page?: number;
  limit?: number;
}

export interface SearchOutput {
  results: SearchResult[];
  total: number;
  page: number;
  totalPages: number;
  facets: Facets;
  query: string;
}

export class SearchAgent extends BaseAgent<SearchInput, SearchOutput> {
  private foundry: FoundryClient;

  constructor(context: AgentContext) {
    super(context, 'SearchAgent');
    this.foundry = new FoundryClient(context.env);
  }

  async execute(input: SearchInput): Promise<AgentResult<SearchOutput>> {
    const startTime = Date.now();

    try {
      const language = this.detectLanguage(input.query);
      this.log('Search', {
        language,
        query: input.query.substring(0, 50),
      });

      // Recherche parallèle lexicale + sémantique
      const [lexicalResults, semanticResults] = await Promise.all([
        this.foundry.queryLexical(input.query, input.filters, 50),
        this.foundry.searchSemantic(input.query, input.filters, 50),
      ]);

      // Fusion RRF avec poids configurables
      const fusedResults = this.reciprocalRankFusion(
        lexicalResults,
        semanticResults
      );

      // Pagination
      const page = input.page ?? 1;
      const limit = Math.min(
        input.limit ?? this.config.agents.search.defaultLimit,
        this.config.agents.search.maxLimit
      );

      const startIdx = (page - 1) * limit;
      const paginatedResults = fusedResults.slice(startIdx, startIdx + limit);

      // Calcul des facettes
      const facets = this.computeFacets(fusedResults);

      return {
        success: true,
        data: {
          results: paginatedResults,
          total: fusedResults.length,
          page,
          totalPages: Math.ceil(fusedResults.length / limit),
          facets,
          query: input.query,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.log('Error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
        executionTime: Date.now() - startTime,
      };
    }
  }

  private reciprocalRankFusion(
    list1: SearchResult[],
    list2: SearchResult[],
    k = 60
  ): SearchResult[] {
    const scores = new Map<string, number>();
    const docs = new Map<string, SearchResult>();

    const { lexicalWeight, semanticWeight } = this.config.agents.search;

    list1.forEach((doc, rank) => {
      const score = lexicalWeight * (1 / (k + rank + 1));
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + score);
      docs.set(doc.id, doc);
    });

    list2.forEach((doc, rank) => {
      const score = semanticWeight * (1 / (k + rank + 1));
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

  private computeFacets(results: SearchResult[]): Facets {
    const typeCounts = new Map<string, number>();
    const domaineCounts = new Map<string, number>();
    const yearCounts = new Map<string, number>();

    results.forEach((r) => {
      typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);

      if (r.domaine) {
        domaineCounts.set(
          r.domaine.id,
          (domaineCounts.get(r.domaine.id) ?? 0) + 1
        );
      }

      if (r.date) {
        const year = r.date.substring(0, 4);
        yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
      }
    });

    return {
      type: Array.from(typeCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      domaine: Array.from(domaineCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      year: Array.from(yearCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.value.localeCompare(a.value)),
    };
  }
}
