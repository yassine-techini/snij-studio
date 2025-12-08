// Augmenter - Construction du prompt RAG

import type { SearchResult, PromptsConfig } from '../types';

export class Augmenter {
  private prompts: PromptsConfig;

  constructor(prompts: PromptsConfig) {
    this.prompts = prompts;
  }

  buildPrompt(
    question: string,
    documents: SearchResult[],
    language: 'ar' | 'fr' | 'en'
  ): string {
    const sourcesText = this.formatSources(documents, language);
    const template = this.getTemplate(language);

    return template
      .replace('{{sources}}', sourcesText)
      .replace('{{question}}', question);
  }

  private formatSources(
    documents: SearchResult[],
    language: 'ar' | 'fr' | 'en'
  ): string {
    if (language === 'ar') {
      return documents
        .map(
          (doc, idx) =>
            `[المصدر ${idx + 1}]\n` +
            `النوع: ${this.getTypeLabel(doc.type, 'ar')}\n` +
            `العنوان: ${doc.titleAr ?? doc.title}\n` +
            `الرقم: ${doc.numero}\n` +
            `التاريخ: ${doc.date}\n` +
            `المحتوى:\n${(doc.content ?? '').substring(0, 2000)}\n` +
            `---`
        )
        .join('\n\n');
    }

    return documents
      .map(
        (doc, idx) =>
          `[Source ${idx + 1}]\n` +
          `Type: ${this.getTypeLabel(doc.type, 'fr')}\n` +
          `Titre: ${doc.titleFr ?? doc.title}\n` +
          `Numéro: ${doc.numero}\n` +
          `Date: ${doc.date}\n` +
          `Contenu:\n${(doc.content ?? '').substring(0, 2000)}\n` +
          `---`
      )
      .join('\n\n');
  }

  private getTemplate(language: 'ar' | 'fr' | 'en'): string {
    // Si template configuré, l'utiliser
    if (this.prompts.ragTemplate) {
      return this.prompts.ragTemplate;
    }

    // Templates par défaut
    if (language === 'ar') {
      return `=== المصادر القانونية ===

{{sources}}

=== نهاية المصادر ===

سؤال المستخدم: {{question}}

الرجاء الإجابة على السؤال بناءً على المصادر المقدمة أعلاه فقط. اذكر المصادر التي استخدمتها في إجابتك بين قوسين مربعين [المصدر 1]، [المصدر 2]، إلخ.`;
    }

    return `=== SOURCES JURIDIQUES ===

{{sources}}

=== FIN DES SOURCES ===

Question de l'utilisateur : {{question}}

Veuillez répondre à la question en vous basant UNIQUEMENT sur les sources fournies ci-dessus. Citez les sources que vous utilisez dans votre réponse entre crochets [Source 1], [Source 2], etc.`;
  }

  private getTypeLabel(
    type: string,
    language: 'ar' | 'fr' | 'en'
  ): string {
    const labels: Record<string, Record<string, string>> = {
      loi: { ar: 'قانون', fr: 'Loi', en: 'Law' },
      decret: { ar: 'مرسوم', fr: 'Décret', en: 'Decree' },
      jurisprudence: { ar: 'فقه قضائي', fr: 'Jurisprudence', en: 'Case law' },
    };

    return labels[type]?.[language] ?? type;
  }
}
