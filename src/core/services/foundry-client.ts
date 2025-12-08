// Client pour communiquer avec snij-foundry

import type { Bindings, SearchResult } from '../types';

export class FoundryClient {
  private baseUrl: string;
  private token: string;

  constructor(env: Bindings) {
    this.baseUrl = env.FOUNDRY_URL;
    this.token = env.FOUNDRY_SERVICE_TOKEN;
  }

  private async request<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Foundry API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async queryLexical(
    query: string,
    filters?: Record<string, unknown>,
    limit: number = 30
  ): Promise<SearchResult[]> {
    const data = await this.request<{
      success: boolean;
      results: SearchResult[];
    }>('/query', {
      search: query,
      filters,
      limit,
    });

    return data.results ?? [];
  }

  async searchSemantic(
    query: string,
    filters?: Record<string, unknown>,
    limit: number = 30
  ): Promise<SearchResult[]> {
    const data = await this.request<{
      success: boolean;
      results: SearchResult[];
    }>('/search', {
      query,
      filters,
      limit,
    });

    return data.results ?? [];
  }

  async getDocument(id: string): Promise<SearchResult | null> {
    const data = await this.request<{
      success: boolean;
      document: SearchResult | null;
    }>('/query', { id });

    return data.document ?? null;
  }

  async embedText(text: string): Promise<number[]> {
    const data = await this.request<{
      success: boolean;
      embedding: number[];
    }>('/search/embed', { text });

    return data.embedding ?? [];
  }
}
