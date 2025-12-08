// Classe abstraite de base pour tous les agents

import type { AgentContext, AgentResult, StudioConfig } from '../types';

export abstract class BaseAgent<TInput, TOutput> {
  protected context: AgentContext;
  protected name: string;
  protected config: StudioConfig;

  constructor(context: AgentContext, name: string) {
    this.context = context;
    this.name = name;
    this.config = context.config;
  }

  abstract execute(input: TInput): Promise<AgentResult<TOutput>>;

  /**
   * Détection de langue basée sur les caractères
   */
  protected detectLanguage(text: string): 'ar' | 'fr' | 'en' {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    const totalChars = text.length;

    if (totalChars > 0 && arabicChars / totalChars > 0.3) {
      return 'ar';
    }

    const frenchWords = [
      'le',
      'la',
      'les',
      'de',
      'du',
      'des',
      'un',
      'une',
      'est',
      'sont',
      'dans',
      'pour',
      'avec',
      'sur',
      'par',
    ];
    const lowerText = text.toLowerCase();
    const hasFrench = frenchWords.some(
      (w) => lowerText.includes(` ${w} `) || lowerText.startsWith(`${w} `)
    );

    return hasFrench ? 'fr' : 'en';
  }

  /**
   * Accès aux prompts selon la langue
   */
  protected getSystemPrompt(language?: 'ar' | 'fr' | 'en'): string {
    const lang = language ?? this.context.language;
    return this.config.prompts.system[lang] ?? this.config.prompts.system['ar'] ?? '';
  }

  /**
   * Accès au template RAG
   */
  protected getRagTemplate(): string {
    return this.config.prompts.ragTemplate;
  }

  /**
   * Accès au template de résumé
   */
  protected getSummaryTemplate(): string {
    return this.config.prompts.summaryTemplate;
  }

  /**
   * Log avec contexte
   */
  protected log(message: string, data?: unknown): void {
    const domain = this.config.domain;
    console.log(
      `[${domain}:${this.name}] ${message}`,
      data ? JSON.stringify(data) : ''
    );
  }

  /**
   * Messages de fallback par langue
   */
  protected getFallbackMessage(type: 'error' | 'noResults'): string {
    const messages = {
      error: {
        ar: 'عذرًا، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.',
        fr: "Désolé, une erreur s'est produite. Veuillez réessayer.",
        en: 'Sorry, an error occurred. Please try again.',
      },
      noResults: {
        ar: 'لم أجد معلومات حول هذا الموضوع في النصوص المتاحة.',
        fr: "Je n'ai pas trouvé d'information sur ce sujet dans les textes disponibles.",
        en: 'I did not find information on this topic in the available texts.',
      },
    };

    return messages[type][this.context.language] ?? messages[type]['fr'];
  }
}
