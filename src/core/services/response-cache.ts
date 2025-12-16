// Cache intelligent pour les réponses RAG
// Évite de régénérer des réponses pour des questions similaires

import type { Source } from '../types';

export interface CachedResponse {
  answer: string;
  sources: Source[];
  confidence: number;
  language: string;
  classification: {
    domain: string;
    intent: string;
  };
  cachedAt: number;
  hitCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  totalQueries: number;
}

const CACHE_TTL = 3600; // 1 heure
const MIN_CONFIDENCE_TO_CACHE = 0.4; // Ne cache que les bonnes réponses
const MAX_CACHE_ENTRIES = 1000;

export class ResponseCache {
  private kv: KVNamespace;
  private stats: CacheStats = { hits: 0, misses: 0, totalQueries: 0 };

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Génère une clé de cache normalisée
   */
  private generateCacheKey(question: string, language: string, filters?: Record<string, unknown>): string {
    // Normaliser la question
    const normalizedQuestion = question
      .toLowerCase()
      .trim()
      .replace(/[?!.,:;]/g, '')
      .replace(/\s+/g, ' ');

    // Créer une clé unique
    const filterStr = filters ? JSON.stringify(filters) : '';
    const keyData = `${normalizedQuestion}|${language}|${filterStr}`;

    // Hash simple pour la clé
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return `rag-cache:${Math.abs(hash).toString(36)}`;
  }

  /**
   * Cherche une réponse en cache
   */
  async get(
    question: string,
    language: string,
    filters?: Record<string, unknown>
  ): Promise<CachedResponse | null> {
    this.stats.totalQueries++;

    const key = this.generateCacheKey(question, language, filters);

    try {
      const cached = await this.kv.get(key, 'json') as CachedResponse | null;

      if (cached) {
        this.stats.hits++;

        // Mettre à jour le hit count
        cached.hitCount++;
        await this.kv.put(key, JSON.stringify(cached), {
          expirationTtl: CACHE_TTL,
        });

        console.log(`[Cache] HIT for key ${key}, hitCount: ${cached.hitCount}`);
        return cached;
      }

      this.stats.misses++;
      console.log(`[Cache] MISS for key ${key}`);
      return null;
    } catch (error) {
      console.error('[Cache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Stocke une réponse en cache
   */
  async set(
    question: string,
    language: string,
    response: {
      answer: string;
      sources: Source[];
      confidence: number;
      classification: { domain: string; intent: string };
    },
    filters?: Record<string, unknown>
  ): Promise<void> {
    // Ne pas cacher les réponses de faible confiance
    if (response.confidence < MIN_CONFIDENCE_TO_CACHE) {
      console.log(`[Cache] Skipping cache - low confidence: ${response.confidence}`);
      return;
    }

    // Ne pas cacher les réponses sans sources
    if (response.sources.length === 0) {
      console.log('[Cache] Skipping cache - no sources');
      return;
    }

    const key = this.generateCacheKey(question, language, filters);

    const cacheEntry: CachedResponse = {
      answer: response.answer,
      sources: response.sources,
      confidence: response.confidence,
      language,
      classification: response.classification,
      cachedAt: Date.now(),
      hitCount: 0,
    };

    try {
      await this.kv.put(key, JSON.stringify(cacheEntry), {
        expirationTtl: CACHE_TTL,
      });
      console.log(`[Cache] Stored response for key ${key}`);
    } catch (error) {
      console.error('[Cache] Error storing cache:', error);
    }
  }

  /**
   * Invalide le cache pour un domaine spécifique
   */
  async invalidateDomain(domain: string): Promise<void> {
    // Note: KV ne supporte pas les requêtes par préfixe de manière efficace
    // Cette méthode est principalement pour documentation
    console.log(`[Cache] Domain ${domain} invalidation requested`);
  }

  /**
   * Retourne les statistiques du cache
   */
  getStats(): CacheStats & { hitRate: number } {
    const hitRate = this.stats.totalQueries > 0
      ? (this.stats.hits / this.stats.totalQueries) * 100
      : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Vérifie si une question est suffisamment similaire pour utiliser le cache
   */
  isSimilarQuestion(q1: string, q2: string): boolean {
    const normalize = (s: string) => s
      .toLowerCase()
      .replace(/[?!.,:;]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const n1 = normalize(q1);
    const n2 = normalize(q2);

    // Correspondance exacte après normalisation
    if (n1 === n2) return true;

    // Calcul de similarité simple (Jaccard)
    const words1 = new Set(n1.split(' '));
    const words2 = new Set(n2.split(' '));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;
    return similarity > 0.8; // 80% de similarité
  }
}
