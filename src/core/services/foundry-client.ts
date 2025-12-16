// Client pour communiquer avec snij-foundry via Service Binding

import type { Bindings, SearchResult } from '../types';

// Type interne pour les documents Foundry
interface FoundryDocument {
  id: string;
  type: 'loi' | 'decret' | 'jurisprudence';
  numero: string;
  title: {
    ar: string;
    fr?: string;
    en?: string;
  };
  content: {
    ar: string;
    fr?: string;
    en?: string;
  };
  aiSummary?: {
    ar: string;
    fr?: string;
    en?: string;
  };
  datePromulgation: string;
  domaine: string;
  statut: string;
  jortReference?: string;
  score?: number;
}

export class FoundryClient {
  private foundry: Fetcher;
  private token: string;

  constructor(env: Bindings) {
    this.foundry = env.FOUNDRY;
    this.token = env.FOUNDRY_SERVICE_TOKEN;
  }

  private async request<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    // Utiliser le Service Binding pour éviter l'erreur 1042
    const response = await this.foundry.fetch(`https://foundry${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read error response');
      console.error(`Foundry API error: ${response.status}`, errorText);
      throw new Error(`Foundry API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  }

  // Mapper un document Foundry vers SearchResult
  private mapToSearchResult(doc: FoundryDocument): SearchResult {
    return {
      id: doc.id,
      type: doc.type,
      title: doc.title.fr || doc.title.ar,
      titleAr: doc.title.ar,
      titleFr: doc.title.fr,
      numero: doc.numero,
      date: doc.datePromulgation?.split('T')[0] ?? '',
      domaine: doc.domaine
        ? { id: doc.domaine, name: doc.domaine }
        : undefined,
      excerpt: doc.content.fr?.substring(0, 300) ?? doc.content.ar?.substring(0, 300),
      aiSummary: doc.aiSummary?.fr ?? doc.aiSummary?.ar,
      score: doc.score ?? 0,
      content: doc.content.fr ?? doc.content.ar,
    };
  }

  async queryLexical(
    query: string,
    filters?: Record<string, unknown>,
    limit: number = 30
  ): Promise<SearchResult[]> {
    // Convertir les filtres pour l'API /query
    // /query utilise entity pour le type et filters.domaine/statut pour les autres
    const requestBody: Record<string, unknown> = {
      search: query,
      limit,
    };

    if (filters) {
      const typeFilter = filters['type'];
      if (Array.isArray(typeFilter) && typeFilter.length > 0) {
        // Pour /query, entity ne supporte qu'un seul type
        requestBody['entity'] = typeFilter[0];
      } else if (typeof typeFilter === 'string') {
        requestBody['entity'] = typeFilter;
      }

      // Filtres domaine/statut
      const queryFilters: Record<string, unknown> = {};
      if (filters['domaine']) {
        const domaineFilter = filters['domaine'];
        queryFilters['domaine'] = Array.isArray(domaineFilter)
          ? domaineFilter[0]
          : domaineFilter;
      }
      if (filters['statut']) {
        queryFilters['statut'] = filters['statut'];
      }
      if (Object.keys(queryFilters).length > 0) {
        requestBody['filters'] = queryFilters;
      }
    }

    const data = await this.request<{
      success: boolean;
      results: FoundryDocument[];
    }>('/query', requestBody);

    return (data.results ?? []).map((doc) => this.mapToSearchResult(doc));
  }

  async searchSemantic(
    query: string,
    filters?: Record<string, unknown>,
    limit: number = 30
  ): Promise<SearchResult[]> {
    // /search supporte les filtres type[] et domaine[] directement
    const data = await this.request<{
      success: boolean;
      results: FoundryDocument[];
    }>('/search', {
      query,
      filters,
      limit,
    });

    return (data.results ?? []).map((doc) => this.mapToSearchResult(doc));
  }

  async getDocument(id: string): Promise<SearchResult | null> {
    const data = await this.request<{
      success: boolean;
      document: FoundryDocument | null;
    }>('/query', { id });

    return data.document ? this.mapToSearchResult(data.document) : null;
  }

  async embedText(text: string): Promise<number[]> {
    const data = await this.request<{
      success: boolean;
      embedding: number[];
    }>('/search/embed', { text });

    return data.embedding ?? [];
  }
}
