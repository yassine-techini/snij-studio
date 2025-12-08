// Agent de génération de résumés

import { BaseAgent } from './base-agent';
import { LLMClient } from '../services/llm-client';
import { FoundryClient } from '../services/foundry-client';
import type { AgentContext, AgentResult } from '../types';

export interface SummaryInput {
  documentId: string;
  type?: 'short' | 'detailed';
  language?: 'ar' | 'fr' | 'en';
}

export interface SummaryOutput {
  documentId: string;
  summary: string;
  keyPoints: string[];
  language: string;
  cached: boolean;
}

export class SummaryAgent extends BaseAgent<SummaryInput, SummaryOutput> {
  private llm: LLMClient;
  private foundry: FoundryClient;

  constructor(context: AgentContext) {
    super(context, 'SummaryAgent');
    this.llm = new LLMClient(context.env);
    this.foundry = new FoundryClient(context.env);
  }

  async execute(input: SummaryInput): Promise<AgentResult<SummaryOutput>> {
    const startTime = Date.now();

    try {
      const language = input.language ?? this.context.language;

      // Vérifier le cache
      const cacheKey = `summary:${input.documentId}:${input.type ?? 'short'}:${language}`;
      const cached = await this.context.env.KV.get(cacheKey, 'json') as SummaryOutput | null;

      if (cached) {
        this.log('Cache hit', { documentId: input.documentId });
        return {
          success: true,
          data: { ...cached, cached: true },
          executionTime: Date.now() - startTime,
        };
      }

      // Récupérer le document
      const document = await this.foundry.getDocument(input.documentId);
      if (!document) {
        return {
          success: false,
          error: 'Document not found',
          executionTime: Date.now() - startTime,
        };
      }

      // Générer le résumé
      const content = document.content ?? document.titleAr ?? document.title;
      const prompt = this.buildSummaryPrompt(content, language, input.type);

      const response = await this.llm.generate({
        prompt,
        systemPrompt: this.getSummarySystemPrompt(language),
        maxTokens:
          input.type === 'detailed'
            ? this.config.agents.summary.detailedMaxTokens
            : this.config.agents.summary.shortMaxTokens,
        temperature: this.config.agents.summary.temperature,
      });

      // Parser la réponse
      const { summary, keyPoints } = this.parseResponse(response);

      const result: SummaryOutput = {
        documentId: input.documentId,
        summary,
        keyPoints,
        language,
        cached: false,
      };

      // Mettre en cache (1 heure)
      await this.context.env.KV.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 3600,
      });

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.log('Error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Summary failed',
        executionTime: Date.now() - startTime,
      };
    }
  }

  private buildSummaryPrompt(
    content: string,
    language: string,
    type?: 'short' | 'detailed'
  ): string {
    const truncatedContent = content.substring(0, 8000);

    if (language === 'ar') {
      return type === 'detailed'
        ? `قم بتلخيص النص القانوني التالي بالتفصيل، مع ذكر النقاط الرئيسية:\n\n${truncatedContent}\n\nالملخص التفصيلي:\n\nالنقاط الرئيسية:\n1.`
        : `قم بتلخيص النص القانوني التالي في فقرة واحدة (3-5 جمل) بلغة بسيطة:\n\n${truncatedContent}\n\nالملخص:\n\nالنقاط الرئيسية:\n1.`;
    }

    return type === 'detailed'
      ? `Résumez le texte juridique suivant en détail, en mentionnant les points clés:\n\n${truncatedContent}\n\nRésumé détaillé:\n\nPoints clés:\n1.`
      : `Résumez le texte juridique suivant en un paragraphe (3-5 phrases) dans un langage simple:\n\n${truncatedContent}\n\nRésumé:\n\nPoints clés:\n1.`;
  }

  private getSummarySystemPrompt(language: string): string {
    if (language === 'ar') {
      return 'أنت خبير في تلخيص النصوص القانونية التونسية. قدم ملخصات واضحة ومفيدة للمواطنين.';
    }
    return 'Vous êtes un expert en résumé de textes juridiques tunisiens. Fournissez des résumés clairs et utiles pour les citoyens.';
  }

  private parseResponse(response: string): {
    summary: string;
    keyPoints: string[];
  } {
    const lines = response.split('\n').filter((l) => l.trim());

    // Trouver la section des points clés
    const keyPointsIndex = lines.findIndex(
      (l) =>
        l.includes('النقاط الرئيسية') ||
        l.includes('Points clés') ||
        l.includes('Key points')
    );

    let summary = '';
    const keyPoints: string[] = [];

    if (keyPointsIndex > 0) {
      summary = lines.slice(0, keyPointsIndex).join(' ').trim();
      const pointLines = lines.slice(keyPointsIndex + 1);

      for (const line of pointLines) {
        const cleaned = line.replace(/^\d+\.\s*/, '').trim();
        if (cleaned.length > 0) {
          keyPoints.push(cleaned);
        }
      }
    } else {
      summary = lines.join(' ').trim();
    }

    // Nettoyer les labels
    summary = summary
      .replace(/الملخص( التفصيلي)?:?/g, '')
      .replace(/Résumé( détaillé)?:?/g, '')
      .trim();

    return {
      summary: summary || response.trim(),
      keyPoints: keyPoints.slice(0, 5),
    };
  }
}
