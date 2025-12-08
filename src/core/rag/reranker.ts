// Reranker - Scoring et filtrage des résultats

import type { AgentContext, SearchResult, RAGConfig } from '../types';

export class Reranker {
  private config: RAGConfig;

  constructor(context: AgentContext) {
    this.config = context.config.rag;
  }

  rerank(question: string, documents: SearchResult[]): SearchResult[] {
    // Simple reranking basé sur:
    // 1. Score existant
    // 2. Présence des mots de la question dans le contenu
    // 3. Fraîcheur du document

    const questionWords = this.extractKeywords(question);

    const scored = documents.map((doc) => {
      let score = doc.score;

      // Bonus pour correspondance de mots-clés
      const content = `${doc.title} ${doc.content ?? ''}`.toLowerCase();
      const matchCount = questionWords.filter((w) =>
        content.includes(w)
      ).length;
      score += (matchCount / questionWords.length) * 0.3;

      // Bonus pour documents récents
      if (doc.date) {
        const year = parseInt(doc.date.substring(0, 4), 10);
        const currentYear = new Date().getFullYear();
        const ageFactor = Math.max(0, 1 - (currentYear - year) / 50);
        score += ageFactor * 0.1;
      }

      return { ...doc, score };
    });

    // Filtrer par score minimum et trier
    return scored
      .filter((d) => d.score >= this.config.reranker.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.reranker.topK);
  }

  private extractKeywords(text: string): string[] {
    // Mots vides en arabe et français
    const stopWords = new Set([
      // Arabe
      'من',
      'في',
      'على',
      'إلى',
      'عن',
      'مع',
      'هذا',
      'هذه',
      'التي',
      'الذي',
      'ما',
      'هو',
      'هي',
      // Français
      'le',
      'la',
      'les',
      'de',
      'du',
      'des',
      'un',
      'une',
      'et',
      'ou',
      'que',
      'qui',
      'dans',
      'pour',
      'avec',
      'sur',
      'par',
      'est',
      'sont',
      // Anglais
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'in',
      'for',
      'with',
      'on',
      'by',
      'is',
      'are',
    ]);

    return text
      .toLowerCase()
      .split(/[\s,;:.!?،؛]+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }
}
