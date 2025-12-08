// Prompts spécifiques SNIJ

import type { PromptsConfig } from '../../core/types';
import { systemPromptAr } from './system-ar';
import { systemPromptFr } from './system-fr';

export const ragTemplateAr = `=== المصادر القانونية ===

{{sources}}

=== نهاية المصادر ===

سؤال المستخدم: {{question}}

الرجاء الإجابة على السؤال بناءً على المصادر المقدمة أعلاه فقط. اذكر المصادر التي استخدمتها في إجابتك بين قوسين مربعين [المصدر 1]، [المصدر 2]، إلخ.

إذا لم تجد معلومات كافية في المصادر، اعترف بذلك بوضوح وأنصح المستخدم بمراجعة مختص قانوني.`;

export const ragTemplateFr = `=== SOURCES JURIDIQUES ===

{{sources}}

=== FIN DES SOURCES ===

Question de l'utilisateur : {{question}}

Veuillez répondre à la question en vous basant UNIQUEMENT sur les sources fournies ci-dessus. Citez les sources que vous utilisez dans votre réponse entre crochets [Source 1], [Source 2], etc.

Si vous ne trouvez pas suffisamment d'informations dans les sources, reconnaissez-le clairement et conseillez à l'utilisateur de consulter un professionnel du droit.`;

export const summaryTemplateAr = `قم بتلخيص النص القانوني التالي في فقرة واحدة (3-5 جمل) بلغة بسيطة ومفهومة للمواطن العادي.

النص القانوني:
{{content}}

قدم ملخصًا يتضمن:
1. الهدف الرئيسي من هذا النص
2. أهم الأحكام أو التغييرات
3. من يتأثر بهذا النص

الملخص:

النقاط الرئيسية:
1.`;

export const summaryTemplateFr = `Résumez le texte juridique suivant en un paragraphe (3-5 phrases) dans un langage simple et compréhensible pour le citoyen ordinaire.

Texte juridique :
{{content}}

Fournissez un résumé incluant :
1. L'objectif principal de ce texte
2. Les dispositions ou changements les plus importants
3. Qui est concerné par ce texte

Résumé :

Points clés :
1.`;

export const snijPrompts: PromptsConfig = {
  system: {
    ar: systemPromptAr,
    fr: systemPromptFr,
    en: systemPromptFr, // Fallback to French for English
  },
  ragTemplate: ragTemplateFr, // Default template
  summaryTemplate: summaryTemplateFr,
};

export { systemPromptAr, systemPromptFr };
