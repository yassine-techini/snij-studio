// Agent RAG (Retrieval-Augmented Generation) - Version améliorée
// Intègre la classification de requêtes, la mémoire de conversation et le cache

import { BaseAgent } from './base-agent';
import { RAGPipeline } from '../rag/pipeline';
import { QueryClassifier, type QueryClassification } from '../services/query-classifier';
import { ConversationMemory } from '../services/conversation-memory';
import { ResponseCache } from '../services/response-cache';
import { RAGAnalytics } from '../services/rag-analytics';
import type { AgentContext, AgentResult, Source } from '../types';

export interface RAGInput {
  question: string;
  filters?: Record<string, unknown>;
  maxSources?: number;
  stream?: boolean;
  sessionId?: string; // Pour la mémoire de conversation
  useCache?: boolean; // Activer/désactiver le cache (défaut: true)
}

export interface RAGOutput {
  answer: string;
  sources: Source[];
  language: string;
  confidence: number;
  classification?: QueryClassification;
  sessionId?: string;
  fromCache?: boolean;
}

export class RAGAgent extends BaseAgent<RAGInput, RAGOutput> {
  private pipeline: RAGPipeline;
  private classifier: QueryClassifier;
  private memory: ConversationMemory;
  private cache: ResponseCache;
  private analytics: RAGAnalytics;

  constructor(context: AgentContext) {
    super(context, 'RAGAgent');
    this.pipeline = new RAGPipeline(context);
    this.classifier = new QueryClassifier();
    this.memory = new ConversationMemory(context.env.KV);
    this.cache = new ResponseCache(context.env.KV);
    this.analytics = new RAGAnalytics(context.env.KV);
  }

  async execute(input: RAGInput): Promise<AgentResult<RAGOutput>> {
    const startTime = Date.now();
    const useCache = input.useCache !== false; // Activé par défaut

    try {
      const language = this.detectLanguage(input.question);

      // Classifier la requête
      const classification = this.classifier.classify(input.question);

      this.log('RAG Query', {
        language,
        questionLength: input.question.length,
        domain: classification.domain,
        intent: classification.intent,
        confidence: classification.confidence,
      });

      // Vérifier le cache (seulement si pas de session active - pour les nouvelles questions)
      if (useCache && !input.sessionId) {
        const cached = await this.cache.get(input.question, language, input.filters);
        if (cached) {
          this.log('Cache HIT', { hitCount: cached.hitCount });

          // Générer un nouveau sessionId pour cette réponse cachée
          const sessionId = crypto.randomUUID();
          await this.memory.createSession(sessionId, language);
          await this.memory.addUserMessage(sessionId, input.question, {
            domain: cached.classification.domain,
            intent: cached.classification.intent,
          });
          await this.memory.addAssistantMessage(sessionId, cached.answer, cached.sources);

          const executionTime = Date.now() - startTime;

          // Track analytics for cache hit
          this.analytics.trackQuery({
            question: input.question,
            language,
            domain: classification.domain,
            intent: classification.intent,
            confidence: cached.confidence,
            sourcesCount: cached.sources.length,
            executionTime,
            fromCache: true,
            sessionId,
          }).catch(() => {});

          return {
            success: true,
            data: {
              answer: cached.answer,
              sources: cached.sources,
              language: cached.language,
              confidence: cached.confidence,
              classification: classification,
              sessionId,
              fromCache: true,
            },
            executionTime,
          };
        }
      }

      // Gérer la session de conversation
      let conversationContext = '';
      let sessionId = input.sessionId;

      if (sessionId) {
        await this.memory.getOrCreateSession(sessionId, language);

        // Récupérer l'historique si question de suivi
        if (this.memory.isFollowUpQuestion(input.question)) {
          conversationContext = await this.memory.getContextHistory(sessionId);
        }

        // Ajouter la question utilisateur
        await this.memory.addUserMessage(sessionId, input.question, {
          domain: classification.domain,
          intent: classification.intent,
        });
      } else {
        // Générer un nouveau sessionId
        sessionId = crypto.randomUUID();
        await this.memory.createSession(sessionId, language);
        await this.memory.addUserMessage(sessionId, input.question, {
          domain: classification.domain,
          intent: classification.intent,
        });
      }

      // Enrichir les filtres avec la classification
      const enrichedFilters = this.enrichFilters(input.filters, classification);

      // Générer le contexte enrichi
      const classificationContext = this.classifier.generateContext(classification);

      // Construire le prompt système enrichi
      const systemPrompt = this.buildEnrichedSystemPrompt(
        language,
        classificationContext,
        conversationContext,
        classification
      );

      // Exécution du pipeline RAG
      const result = await this.pipeline.query({
        question: input.question,
        language,
        filters: enrichedFilters,
        topK: input.maxSources ?? this.config.agents.rag.maxSources,
        systemPrompt,
      });

      // Sauvegarder la réponse dans la mémoire
      if (sessionId) {
        await this.memory.addAssistantMessage(sessionId, result.answer, result.sources);
      }

      // Calculer la confiance combinée
      const combinedConfidence = this.calculateCombinedConfidence(
        result.confidence,
        classification.confidence
      );

      // Mettre en cache la réponse (seulement si pas de contexte de conversation)
      if (useCache && !input.sessionId && result.sources.length > 0) {
        await this.cache.set(input.question, language, {
          answer: result.answer,
          sources: result.sources,
          confidence: combinedConfidence,
          classification: {
            domain: classification.domain,
            intent: classification.intent,
          },
        }, input.filters);
      }

      const executionTime = Date.now() - startTime;

      // Track analytics
      this.analytics.trackQuery({
        question: input.question,
        language,
        domain: classification.domain,
        intent: classification.intent,
        confidence: combinedConfidence,
        sourcesCount: result.sources.length,
        executionTime,
        fromCache: false,
        sessionId,
      }).catch(() => {}); // Fire and forget

      this.analytics.trackQuestionFrequency(input.question).catch(() => {});

      return {
        success: true,
        data: {
          answer: result.answer,
          sources: result.sources,
          language,
          confidence: combinedConfidence,
          classification,
          sessionId,
          fromCache: false,
        },
        executionTime,
      };
    } catch (error) {
      this.log('Error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'RAG failed',
        data: {
          answer: this.getFallbackMessage('error'),
          sources: [],
          language: this.context.language,
          confidence: 0,
        },
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Version streaming du RAG (pour SSE)
   */
  async *executeStream(
    input: RAGInput
  ): AsyncGenerator<{ type: string; data: unknown }, void, unknown> {
    const language = this.detectLanguage(input.question);
    const useCache = input.useCache !== false;

    // Classifier la requête
    const classification = this.classifier.classify(input.question);

    // Yield initial event avec classification
    yield {
      type: 'start',
      data: {
        language,
        classification: {
          domain: classification.domain,
          intent: classification.intent,
          confidence: classification.confidence,
        },
      },
    };

    // Vérifier le cache pour les nouvelles questions (pas de session existante)
    if (useCache && !input.sessionId) {
      const cached = await this.cache.get(input.question, language, input.filters);
      if (cached) {
        this.log('Stream Cache HIT', { hitCount: cached.hitCount });

        // Générer un sessionId pour la réponse cachée
        const sessionId = crypto.randomUUID();
        await this.memory.createSession(sessionId, language);
        await this.memory.addUserMessage(sessionId, input.question, {
          domain: cached.classification.domain,
          intent: cached.classification.intent,
        });

        // Envoyer les sources
        yield {
          type: 'sources',
          data: { sources: cached.sources, sessionId },
        };

        // Simuler le streaming de la réponse cachée (plus rapide)
        const words = cached.answer.split(' ');
        for (const word of words) {
          yield {
            type: 'token',
            data: { token: word + ' ' },
          };
        }

        // Sauvegarder dans la mémoire
        await this.memory.addAssistantMessage(sessionId, cached.answer, cached.sources);

        yield {
          type: 'done',
          data: {
            confidence: cached.confidence,
            sessionId,
            fromCache: true,
          },
        };
        return;
      }
    }

    let sessionId = input.sessionId;

    try {
      // Gérer la session
      let conversationContext = '';

      if (sessionId) {
        await this.memory.getOrCreateSession(sessionId, language);
        if (this.memory.isFollowUpQuestion(input.question)) {
          conversationContext = await this.memory.getContextHistory(sessionId);
        }
        await this.memory.addUserMessage(sessionId, input.question, {
          domain: classification.domain,
          intent: classification.intent,
        });
      } else {
        sessionId = crypto.randomUUID();
        await this.memory.createSession(sessionId, language);
        await this.memory.addUserMessage(sessionId, input.question, {
          domain: classification.domain,
          intent: classification.intent,
        });
      }

      // Enrichir les filtres
      const enrichedFilters = this.enrichFilters(input.filters, classification);

      // Récupérer les sources d'abord
      const sources = await this.pipeline.retrieveSources({
        question: input.question,
        language,
        filters: enrichedFilters,
        topK: input.maxSources ?? this.config.agents.rag.maxSources,
      });

      yield {
        type: 'sources',
        data: { sources, sessionId },
      };

      // Construire le prompt enrichi
      const classificationContext = this.classifier.generateContext(classification);
      const systemPrompt = this.buildEnrichedSystemPrompt(
        language,
        classificationContext,
        conversationContext,
        classification
      );

      // Stream la génération
      const generator = this.pipeline.generateStream({
        question: input.question,
        language,
        sources,
        systemPrompt,
      });

      let fullAnswer = '';
      for await (const token of generator) {
        fullAnswer += token;
        yield {
          type: 'token',
          data: { token },
        };
      }

      // Sauvegarder dans la mémoire
      if (sessionId) {
        await this.memory.addAssistantMessage(sessionId, fullAnswer, sources);
      }

      // Calculer la confiance
      const combinedConfidence = this.calculateCombinedConfidence(
        this.calculateConfidence(sources),
        classification.confidence
      );

      // Mettre en cache la réponse (seulement si nouvelle question avec sources)
      if (useCache && !input.sessionId && sources.length > 0) {
        await this.cache.set(input.question, language, {
          answer: fullAnswer,
          sources,
          confidence: combinedConfidence,
          classification: {
            domain: classification.domain,
            intent: classification.intent,
          },
        }, input.filters);
      }

      yield {
        type: 'done',
        data: {
          confidence: combinedConfidence,
          sessionId,
          fromCache: false,
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Stream failed',
        },
      };
    }
  }

  /**
   * Enrichit les filtres avec la classification
   */
  private enrichFilters(
    baseFilters: Record<string, unknown> | undefined,
    classification: QueryClassification
  ): Record<string, unknown> {
    const filters = { ...baseFilters };

    // Ajouter les filtres suggérés par la classification si pas déjà définis
    for (const [key, value] of Object.entries(classification.suggestedFilters)) {
      if (!(key in filters)) {
        filters[key] = value;
      }
    }

    return filters;
  }

  /**
   * Construit un prompt système enrichi
   */
  private buildEnrichedSystemPrompt(
    language: 'ar' | 'fr' | 'en',
    classificationContext: string,
    conversationContext: string,
    classification: QueryClassification
  ): string {
    const basePrompt = this.getSystemPrompt(language);

    const parts: string[] = [basePrompt];

    // Ajouter les instructions spécifiques selon l'intention
    const intentInstructions = this.getIntentInstructions(classification.intent, language);
    if (intentInstructions) {
      parts.push('\n' + intentInstructions);
    }

    // Ajouter le contexte de classification
    if (classificationContext) {
      parts.push('\n' + classificationContext);
    }

    // Ajouter l'historique de conversation
    if (conversationContext) {
      parts.push('\n' + conversationContext);
    }

    return parts.join('\n');
  }

  /**
   * Instructions spécifiques selon l'intention de la requête
   */
  private getIntentInstructions(intent: string, language: 'ar' | 'fr' | 'en'): string {
    const instructions: Record<string, Record<string, string>> = {
      definition: {
        fr: "L'utilisateur demande une définition. Fournis une explication claire et précise du concept, en citant les articles de loi pertinents.",
        ar: "المستخدم يطلب تعريفًا. قدم شرحًا واضحًا ودقيقًا للمفهوم مع الإشارة إلى النصوص القانونية ذات الصلة.",
        en: "The user is asking for a definition. Provide a clear and precise explanation of the concept, citing relevant legal articles.",
      },
      procedure: {
        fr: "L'utilisateur demande une procédure. Structure ta réponse en étapes numérotées, en mentionnant les délais légaux et les documents requis.",
        ar: "المستخدم يسأل عن إجراء. قم بهيكلة إجابتك في خطوات مرقمة مع ذكر الآجال القانونية والوثائق المطلوبة.",
        en: "The user is asking about a procedure. Structure your response in numbered steps, mentioning legal deadlines and required documents.",
      },
      droits: {
        fr: "L'utilisateur s'interroge sur ses droits. Explique clairement les droits applicables, leurs limites et conditions d'exercice.",
        ar: "المستخدم يسأل عن حقوقه. اشرح بوضوح الحقوق المعمول بها وحدودها وشروط ممارستها.",
        en: "The user is asking about their rights. Clearly explain the applicable rights, their limits and conditions of exercise.",
      },
      obligations: {
        fr: "L'utilisateur s'interroge sur des obligations. Liste les obligations légales, les sanctions en cas de non-respect et les exceptions éventuelles.",
        ar: "المستخدم يسأل عن الالتزامات. اذكر الالتزامات القانونية والعقوبات في حالة عدم الامتثال والاستثناءات المحتملة.",
        en: "The user is asking about obligations. List the legal obligations, penalties for non-compliance and possible exceptions.",
      },
      sanctions: {
        fr: "L'utilisateur demande des informations sur les sanctions. Détaille les sanctions prévues (amendes, peines) avec les articles de loi correspondants.",
        ar: "المستخدم يسأل عن العقوبات. فصّل العقوبات المقررة (غرامات، عقوبات) مع النصوص القانونية المقابلة.",
        en: "The user is asking about sanctions. Detail the applicable penalties (fines, sentences) with corresponding legal articles.",
      },
      conditions: {
        fr: "L'utilisateur demande des conditions. Énumère clairement toutes les conditions requises, en distinguant les conditions obligatoires des facultatives.",
        ar: "المستخدم يسأل عن الشروط. اذكر بوضوح جميع الشروط المطلوبة مع التمييز بين الشروط الإلزامية والاختيارية.",
        en: "The user is asking about conditions. Clearly list all required conditions, distinguishing between mandatory and optional ones.",
      },
      temporel: {
        fr: "L'utilisateur pose une question sur les délais. Précise les délais légaux en jours/mois/années, les points de départ et les conséquences du non-respect.",
        ar: "المستخدم يسأل عن الآجال. حدد الآجال القانونية بالأيام/الأشهر/السنوات ونقاط البداية وعواقب عدم الاحترام.",
        en: "The user is asking about deadlines. Specify the legal deadlines in days/months/years, starting points and consequences of non-compliance.",
      },
    };

    return instructions[intent]?.[language] || '';
  }

  /**
   * Calcule la confiance combinée (RAG + classification)
   */
  private calculateCombinedConfidence(ragConfidence: number, classificationConfidence: number): number {
    // Moyenne pondérée: RAG compte plus
    return ragConfidence * 0.7 + classificationConfidence * 0.3;
  }

  private calculateConfidence(sources: Source[]): number {
    if (sources.length === 0) return 0;
    // Simple confidence based on number of sources found
    return Math.min(sources.length / 5, 1);
  }
}
