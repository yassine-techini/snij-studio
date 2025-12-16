// Gestion de la mémoire de conversation
// Stocke l'historique des échanges pour un contexte enrichi

import type { Source } from '../types';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: Source[];
  classification?: {
    domain: string;
    intent: string;
  };
}

export interface ConversationSession {
  id: string;
  userId?: string;
  language: 'ar' | 'fr' | 'en';
  messages: ConversationMessage[];
  createdAt: number;
  lastActivityAt: number;
  metadata?: {
    totalQuestions: number;
    domains: string[];
    intents: string[];
  };
}

const SESSION_TTL = 3600; // 1 heure en secondes
const MAX_MESSAGES_IN_CONTEXT = 6; // 3 paires Q/R

export class ConversationMemory {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Crée une nouvelle session de conversation
   */
  async createSession(
    sessionId: string,
    language: 'ar' | 'fr' | 'en',
    userId?: string
  ): Promise<ConversationSession> {
    const session: ConversationSession = {
      id: sessionId,
      userId,
      language,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      metadata: {
        totalQuestions: 0,
        domains: [],
        intents: [],
      },
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Récupère une session existante ou en crée une nouvelle
   */
  async getOrCreateSession(
    sessionId: string,
    language: 'ar' | 'fr' | 'en',
    userId?: string
  ): Promise<ConversationSession> {
    const existing = await this.getSession(sessionId);
    if (existing) {
      return existing;
    }
    return this.createSession(sessionId, language, userId);
  }

  /**
   * Récupère une session par son ID
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const data = await this.kv.get(`session:${sessionId}`, 'json');
    return data as ConversationSession | null;
  }

  /**
   * Ajoute un message utilisateur à la session
   */
  async addUserMessage(
    sessionId: string,
    content: string,
    classification?: { domain: string; intent: string }
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const message: ConversationMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      classification,
    };

    session.messages.push(message);
    session.lastActivityAt = Date.now();

    // Mettre à jour les métadonnées
    if (session.metadata) {
      session.metadata.totalQuestions++;
      if (classification?.domain && !session.metadata.domains.includes(classification.domain)) {
        session.metadata.domains.push(classification.domain);
      }
      if (classification?.intent && !session.metadata.intents.includes(classification.intent)) {
        session.metadata.intents.push(classification.intent);
      }
    }

    await this.saveSession(session);
  }

  /**
   * Ajoute une réponse assistant à la session
   */
  async addAssistantMessage(
    sessionId: string,
    content: string,
    sources?: Source[]
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const message: ConversationMessage = {
      role: 'assistant',
      content,
      timestamp: Date.now(),
      sources,
    };

    session.messages.push(message);
    session.lastActivityAt = Date.now();

    await this.saveSession(session);
  }

  /**
   * Récupère l'historique formaté pour le prompt
   */
  async getContextHistory(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session || session.messages.length === 0) {
      return '';
    }

    // Prendre les N derniers messages
    const recentMessages = session.messages.slice(-MAX_MESSAGES_IN_CONTEXT);

    const parts: string[] = ['[Historique de la conversation]'];

    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        parts.push(`Utilisateur: ${msg.content}`);
      } else {
        // Tronquer les réponses longues
        const truncated = msg.content.length > 500
          ? msg.content.substring(0, 500) + '...'
          : msg.content;
        parts.push(`Assistant: ${truncated}`);
      }
    }

    parts.push('');
    return parts.join('\n');
  }

  /**
   * Récupère les sources déjà citées dans la conversation
   */
  async getCitedSources(sessionId: string): Promise<string[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];

    const sourceIds: Set<string> = new Set();
    for (const msg of session.messages) {
      if (msg.sources) {
        for (const source of msg.sources) {
          sourceIds.add(source.id);
        }
      }
    }

    return Array.from(sourceIds);
  }

  /**
   * Vérifie si la question fait référence à la conversation précédente
   */
  isFollowUpQuestion(question: string): boolean {
    const followUpPatterns = [
      // Français
      /\b(et|aussi|également|en plus|de plus)\b/i,
      /\b(qu'en est-il|et pour|et si|et concernant)\b/i,
      /\b(le même|la même|les mêmes|ce|cette|ces)\b/i,
      /\b(précédent|mentionné|cité|évoqué)\b/i,
      // Arabe
      /و(أيضا|كذلك|بالإضافة)/,
      /ماذا عن|وبخصوص/,
      /نفس|هذا|هذه|المذكور/,
    ];

    return followUpPatterns.some(pattern => pattern.test(question));
  }

  /**
   * Récupère le domaine dominant de la conversation
   */
  async getDominantDomain(sessionId: string): Promise<string | null> {
    const session = await this.getSession(sessionId);
    if (!session?.metadata?.domains.length) return null;

    // Le dernier domaine est souvent le plus pertinent
    const lastDomain = session.metadata.domains[session.metadata.domains.length - 1];
    return lastDomain ?? null;
  }

  /**
   * Sauvegarde une session dans KV
   */
  private async saveSession(session: ConversationSession): Promise<void> {
    await this.kv.put(
      `session:${session.id}`,
      JSON.stringify(session),
      { expirationTtl: SESSION_TTL }
    );
  }

  /**
   * Supprime une session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.kv.delete(`session:${sessionId}`);
  }

  /**
   * Génère un résumé de la conversation pour les longues sessions
   */
  async generateConversationSummary(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session || session.messages.length < 4) {
      return '';
    }

    const topics = session.metadata?.domains.join(', ') || 'général';
    const questionCount = session.metadata?.totalQuestions || 0;

    return `[Contexte: ${questionCount} questions posées sur: ${topics}]`;
  }
}
