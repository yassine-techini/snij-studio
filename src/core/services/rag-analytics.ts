// Analytics pour les requêtes RAG
// Collecte des métriques sur l'utilisation, les performances et la qualité

import type { Source } from '../types';
import type { LegalDomain, QueryIntent } from './query-classifier';

export interface RAGQueryEvent {
  id: string;
  timestamp: number;
  question: string;
  language: 'ar' | 'fr' | 'en';
  domain: LegalDomain;
  intent: QueryIntent;
  confidence: number;
  sourcesCount: number;
  executionTime: number;
  fromCache: boolean;
  sessionId?: string;
  // Feedback utilisateur (optionnel)
  rating?: 1 | 2 | 3 | 4 | 5;
  feedback?: 'helpful' | 'not_helpful' | 'wrong' | 'incomplete';
}

export interface AnalyticsSummary {
  period: 'day' | 'week' | 'month';
  totalQueries: number;
  byLanguage: Record<string, number>;
  byDomain: Record<string, number>;
  byIntent: Record<string, number>;
  cacheHitRate: number;
  avgConfidence: number;
  avgExecutionTime: number;
  avgSourcesPerQuery: number;
  topQuestions: Array<{ question: string; count: number }>;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  queries: number;
  cacheHits: number;
  avgExecutionTime: number;
  avgConfidence: number;
  byDomain: Record<string, number>;
  byLanguage: Record<string, number>;
}

const MAX_EVENTS_PER_DAY = 10000;
const ANALYTICS_TTL = 30 * 24 * 3600; // 30 jours

export class RAGAnalytics {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Enregistre un événement de requête RAG
   */
  async trackQuery(event: Omit<RAGQueryEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: RAGQueryEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const dateKey = this.getDateKey();

    try {
      // Sauvegarder l'événement individuel
      await this.kv.put(
        `analytics:event:${fullEvent.id}`,
        JSON.stringify(fullEvent),
        { expirationTtl: ANALYTICS_TTL }
      );

      // Mettre à jour les stats quotidiennes
      await this.updateDailyStats(dateKey, fullEvent);

      // Ajouter à la liste des événements du jour
      await this.appendToEventList(dateKey, fullEvent.id);

      console.log(`[Analytics] Tracked query: ${event.domain}/${event.intent}`);
    } catch (error) {
      console.error('[Analytics] Error tracking query:', error);
    }
  }

  /**
   * Met à jour les statistiques quotidiennes
   */
  private async updateDailyStats(dateKey: string, event: RAGQueryEvent): Promise<void> {
    const statsKey = `analytics:daily:${dateKey}`;
    let stats = await this.kv.get(statsKey, 'json') as DailyStats | null;

    if (!stats) {
      stats = {
        date: dateKey,
        queries: 0,
        cacheHits: 0,
        avgExecutionTime: 0,
        avgConfidence: 0,
        byDomain: {},
        byLanguage: {},
      };
    }

    // Mise à jour incrémentale des moyennes
    const oldTotal = stats.queries;
    const newTotal = stats.queries + 1;

    stats.avgExecutionTime = (stats.avgExecutionTime * oldTotal + event.executionTime) / newTotal;
    stats.avgConfidence = (stats.avgConfidence * oldTotal + event.confidence) / newTotal;
    stats.queries = newTotal;

    if (event.fromCache) {
      stats.cacheHits++;
    }

    // Compteurs par domaine et langue
    stats.byDomain[event.domain] = (stats.byDomain[event.domain] || 0) + 1;
    stats.byLanguage[event.language] = (stats.byLanguage[event.language] || 0) + 1;

    await this.kv.put(statsKey, JSON.stringify(stats), {
      expirationTtl: ANALYTICS_TTL,
    });
  }

  /**
   * Ajoute un événement à la liste du jour
   */
  private async appendToEventList(dateKey: string, eventId: string): Promise<void> {
    const listKey = `analytics:events:${dateKey}`;
    let eventIds = await this.kv.get(listKey, 'json') as string[] | null;

    if (!eventIds) {
      eventIds = [];
    }

    // Limiter le nombre d'événements par jour
    if (eventIds.length < MAX_EVENTS_PER_DAY) {
      eventIds.push(eventId);
      await this.kv.put(listKey, JSON.stringify(eventIds), {
        expirationTtl: ANALYTICS_TTL,
      });
    }
  }

  /**
   * Récupère les statistiques quotidiennes
   */
  async getDailyStats(date?: string): Promise<DailyStats | null> {
    const dateKey = date || this.getDateKey();
    return await this.kv.get(`analytics:daily:${dateKey}`, 'json') as DailyStats | null;
  }

  /**
   * Récupère un résumé sur une période
   */
  async getSummary(period: 'day' | 'week' | 'month'): Promise<AnalyticsSummary> {
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const dates = this.getDateRange(days);

    const summary: AnalyticsSummary = {
      period,
      totalQueries: 0,
      byLanguage: {},
      byDomain: {},
      byIntent: {},
      cacheHitRate: 0,
      avgConfidence: 0,
      avgExecutionTime: 0,
      avgSourcesPerQuery: 0,
      topQuestions: [],
    };

    let totalCacheHits = 0;
    let totalConfidence = 0;
    let totalExecutionTime = 0;

    for (const date of dates) {
      const stats = await this.getDailyStats(date);
      if (!stats) continue;

      summary.totalQueries += stats.queries;
      totalCacheHits += stats.cacheHits;
      totalConfidence += stats.avgConfidence * stats.queries;
      totalExecutionTime += stats.avgExecutionTime * stats.queries;

      // Agréger par domaine et langue
      for (const [domain, count] of Object.entries(stats.byDomain)) {
        summary.byDomain[domain] = (summary.byDomain[domain] || 0) + count;
      }
      for (const [lang, count] of Object.entries(stats.byLanguage)) {
        summary.byLanguage[lang] = (summary.byLanguage[lang] || 0) + count;
      }
    }

    if (summary.totalQueries > 0) {
      summary.cacheHitRate = (totalCacheHits / summary.totalQueries) * 100;
      summary.avgConfidence = totalConfidence / summary.totalQueries;
      summary.avgExecutionTime = totalExecutionTime / summary.totalQueries;
    }

    return summary;
  }

  /**
   * Enregistre un feedback utilisateur
   */
  async trackFeedback(
    eventId: string,
    feedback: { rating?: 1 | 2 | 3 | 4 | 5; type?: 'helpful' | 'not_helpful' | 'wrong' | 'incomplete' }
  ): Promise<boolean> {
    try {
      const event = await this.kv.get(`analytics:event:${eventId}`, 'json') as RAGQueryEvent | null;
      if (!event) return false;

      if (feedback.rating) event.rating = feedback.rating;
      if (feedback.type) event.feedback = feedback.type;

      await this.kv.put(`analytics:event:${eventId}`, JSON.stringify(event), {
        expirationTtl: ANALYTICS_TTL,
      });

      console.log(`[Analytics] Feedback recorded for ${eventId}`);
      return true;
    } catch (error) {
      console.error('[Analytics] Error tracking feedback:', error);
      return false;
    }
  }

  /**
   * Récupère les questions les plus fréquentes
   */
  async getTopQuestions(limit: number = 10): Promise<Array<{ question: string; count: number }>> {
    // Implémentation simplifiée - dans une vraie app, utiliser un compteur dédié
    const statsKey = 'analytics:top-questions';
    const data = await this.kv.get(statsKey, 'json') as Record<string, number> | null;

    if (!data) return [];

    return Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([question, count]) => ({ question, count }));
  }

  /**
   * Incrémente le compteur pour une question
   */
  async trackQuestionFrequency(question: string): Promise<void> {
    const normalizedQuestion = question.toLowerCase().trim().substring(0, 100);
    const statsKey = 'analytics:top-questions';

    try {
      let data = await this.kv.get(statsKey, 'json') as Record<string, number> | null;
      if (!data) data = {};

      data[normalizedQuestion] = (data[normalizedQuestion] || 0) + 1;

      // Limiter à 1000 questions uniques
      const entries = Object.entries(data);
      if (entries.length > 1000) {
        // Garder les 500 plus fréquentes
        entries.sort((a, b) => b[1] - a[1]);
        data = Object.fromEntries(entries.slice(0, 500));
      }

      await this.kv.put(statsKey, JSON.stringify(data), {
        expirationTtl: ANALYTICS_TTL,
      });
    } catch (error) {
      console.error('[Analytics] Error tracking question frequency:', error);
    }
  }

  /**
   * Génère la clé de date actuelle
   */
  private getDateKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Génère une liste de dates
   */
  private getDateRange(days: number): string[] {
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
  }
}
