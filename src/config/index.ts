// Configuration spécifique SNIJ pour DevFactory Studio

import type { StudioConfig } from '../core/types';
import { snijPrompts } from './prompts';

/**
 * Configuration complète Studio pour le projet SNIJ
 * Portail National d'Information Juridique - Tunisie
 */
export const snijConfig: StudioConfig = {
  domain: 'legal-tunisia',

  agents: {
    search: {
      lexicalWeight: 0.6, // Privilégier recherche exacte pour termes juridiques
      semanticWeight: 0.4, // Compléter avec sémantique pour questions naturelles
      defaultLimit: 20,
      maxLimit: 100,
    },

    rag: {
      maxSources: 5, // 5 sources max pour réponses précises
      temperature: 0.3, // Faible température pour réponses factuelles
      maxTokens: 2048,
      model: 'claude-3-haiku-20240307',
      confidenceThreshold: 0.7,
    },

    summary: {
      shortMaxTokens: 256,
      detailedMaxTokens: 1024,
      temperature: 0.2, // Très bas pour résumés
    },
  },

  rag: {
    retriever: {
      topK: 50, // 50 candidats initiaux
      fusionK: 60, // Paramètre RRF
    },
    reranker: {
      topK: 5, // Top 5 pour génération
      minScore: 0.01, // Lowered to work with RRF scores
    },
  },

  prompts: snijPrompts,
};

export default snijConfig;
