// Classification des requêtes juridiques
// Identifie le domaine juridique et l'intention de la requête

export interface QueryClassification {
  domain: LegalDomain;
  intent: QueryIntent;
  entities: ExtractedEntities;
  confidence: number;
  suggestedFilters: Record<string, string>;
}

export type LegalDomain =
  | 'travail'           // Droit du travail
  | 'commercial'        // Droit commercial
  | 'fiscal'            // Droit fiscal
  | 'civil'             // Droit civil
  | 'penal'             // Droit pénal
  | 'administratif'     // Droit administratif
  | 'constitutionnel'   // Droit constitutionnel
  | 'famille'           // Droit de la famille
  | 'environnement'     // Droit de l'environnement
  | 'propriete'         // Propriété intellectuelle
  | 'donnees'           // Protection des données
  | 'general';          // Non classifié

export type QueryIntent =
  | 'definition'        // "Qu'est-ce que..."
  | 'procedure'         // "Comment faire pour..."
  | 'droits'            // "Quels sont mes droits..."
  | 'obligations'       // "Quelles sont les obligations..."
  | 'sanctions'         // "Quelles sanctions..."
  | 'conditions'        // "Quelles conditions pour..."
  | 'comparison'        // Comparer deux textes/situations
  | 'verification'      // Vérifier la conformité
  | 'temporel'          // Questions sur les délais/dates
  | 'information';      // Recherche d'information générale

export interface ExtractedEntities {
  lawNumbers: string[];       // Ex: "loi 2018-35"
  articleNumbers: string[];   // Ex: "article 5"
  dates: string[];            // Ex: "2020", "janvier 2021"
  amounts: string[];          // Ex: "5000 dinars"
  durations: string[];        // Ex: "30 jours"
  actors: string[];           // Ex: "employeur", "locataire"
}

// Patterns de classification par domaine
const domainPatterns: Record<LegalDomain, RegExp[]> = {
  travail: [
    /emploi|employ[ée]|travail|travailleur|salari[ée]|cong[ée]|licenciement|contrat de travail/i,
    /patron|employeur|grève|syndica|heures? de travail|salaire|prime/i,
    /CNSS|sécurité sociale|retraite|pension/i,
    /عقد العمل|عامل|طرد|أجر|إضراب|نقابة/,
  ],
  commercial: [
    /société|entreprise|commerce|commerçant|faillite|registre/i,
    /SARL|SA|société anonyme|associé|actionnaire|dividende/i,
    /شركة|تجارة|تاجر|إفلاس|سجل تجاري/,
  ],
  fiscal: [
    /impôt|taxe|TVA|fiscal|déclaration|IRPP|\bIS\b/i,
    /contribuable|exonération|déduction|bénéfice imposable/i,
    /ضريبة|ضرائب|إعفاء|تصريح ضريبي/,
  ],
  civil: [
    /propriété|contrat|obligation|responsabilité civile|dommage/i,
    /créancier|débiteur|hypothèque|gage|cautionnement/i,
    /ملكية|عقد|التزام|مسؤولية مدنية|ضمان/,
  ],
  penal: [
    /infraction|délit|crime|peine|prison|amende/i,
    /vol|escroquerie|abus de confiance|violence/i,
    /جريمة|جنحة|عقوبة|سجن|خطية/,
  ],
  administratif: [
    /administration|fonctionnaire|marché public|permis de construire/i,
    /autorisation|licence|agrément|tribunal administratif/i,
    /urbanisme|lotissement|aménagement|collectivité/i,
    /إدارة|موظف|صفقة عمومية|رخصة|ترخيص/,
  ],
  constitutionnel: [
    /constitution|droit fondamental|liberté|élection|vote/i,
    /président|parlement|assemblée|référendum/i,
    /دستور|حقوق أساسية|حرية|انتخابات/,
  ],
  famille: [
    /mariage|divorce|pension alimentaire|garde|héritage/i,
    /succession|tutelle|adoption|filiation/i,
    /زواج|طلاق|نفقة|حضانة|ميراث|إرث/,
  ],
  environnement: [
    /environnement|pollution|déchet|énergie renouvelable/i,
    /impact environnemental|réserve naturelle|protection de l'environnement/i,
    /écologie|émission|carbone|recyclage/i,
    /بيئة|تلوث|نفايات|محمية طبيعية/,
  ],
  propriete: [
    /brevet|marque|droit d'auteur|propriété intellectuelle/i,
    /contrefaçon|licence|copyright|invention/i,
    /براءة اختراع|علامة تجارية|حقوق المؤلف/,
  ],
  donnees: [
    /données personnelles|vie privée|INPDP|protection des données/i,
    /consentement|traitement|fichier|RGPD/i,
    /معطيات شخصية|حماية المعطيات|خصوصية/,
  ],
  general: [],
};

// Patterns de classification par intention
const intentPatterns: Record<QueryIntent, RegExp[]> = {
  definition: [
    /qu'est[- ]ce qu[e']|c'est quoi|définition|signifie|veut dire/i,
    /ما هو|ما هي|ماذا يعني|تعريف/,
  ],
  procedure: [
    /comment faire|procédure|démarche|étapes|obtenir|demander/i,
    /كيف أ|إجراءات|خطوات|للحصول على/,
  ],
  droits: [
    /mes droits|ai[- ]je le droit|peut[- ]on|autorisé|permis/i,
    /حقوقي|هل يحق لي|مسموح/,
  ],
  obligations: [
    /obligé|obligation|dois[- ]je|faut[- ]il|tenu de|devoir/i,
    /ملزم|واجب|هل يجب|التزامات/,
  ],
  sanctions: [
    /sanction|peine|amende|risque|punition|condamn/i,
    /عقوبة|خطية|غرامة|جزاء/,
  ],
  conditions: [
    /conditions?|critères?|requis|nécessaire|éligible|exigé/i,
    /شروط|متطلبات|معايير/,
  ],
  comparison: [
    /différence|comparer|versus|vs|par rapport/i,
    /الفرق بين|مقارنة/,
  ],
  verification: [
    /conforme|légal|valide|applicable|en vigueur/i,
    /قانوني|ساري المفعول|صالح/,
  ],
  temporel: [
    /délai|date limite|quand|durée|prescription|échéance/i,
    /أجل|مهلة|متى|مدة/,
  ],
  information: [],
};

// Patterns pour extraction d'entités
const entityPatterns = {
  lawNumbers: [
    /(?:loi|قانون)\s*(?:n[°o]?\s*)?(\d{4}[-/]\d+|\d+[-/]\d{4})/gi,
    /(?:décret|مرسوم)\s*(?:n[°o]?\s*)?(\d{4}[-/]\d+|\d+[-/]\d{4})/gi,
  ],
  articleNumbers: [
    /article\s*(\d+(?:\s*bis|\s*ter)?)/gi,
    /الفصل\s*(\d+)/gi,
  ],
  dates: [
    /(\d{4})/g,
    /(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*\d{4}/gi,
  ],
  amounts: [
    /(\d+(?:[.,]\d+)?)\s*(?:dinars?|DT|د\.ت)/gi,
  ],
  durations: [
    /(\d+)\s*(?:jours?|semaines?|mois|ans?)/gi,
    /(\d+)\s*(?:يوم|أسبوع|شهر|سنة)/gi,
  ],
  actors: [
    /employeur|employé|travailleur|locataire|propriétaire|contribuable/gi,
    /مؤجر|أجير|عامل|مكتري|مالك/gi,
  ],
};

export class QueryClassifier {
  /**
   * Classifie une requête utilisateur
   */
  classify(query: string): QueryClassification {
    const domain = this.detectDomain(query);
    const intent = this.detectIntent(query);
    const entities = this.extractEntities(query);
    const confidence = this.calculateConfidence(domain, intent, entities);
    const suggestedFilters = this.buildFilters(domain, entities);

    return {
      domain,
      intent,
      entities,
      confidence,
      suggestedFilters,
    };
  }

  private detectDomain(query: string): LegalDomain {
    let bestMatch: LegalDomain = 'general';
    let maxMatches = 0;

    for (const [domain, patterns] of Object.entries(domainPatterns)) {
      const matches = patterns.filter(p => p.test(query)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = domain as LegalDomain;
      }
    }

    return bestMatch;
  }

  private detectIntent(query: string): QueryIntent {
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some(p => p.test(query))) {
        return intent as QueryIntent;
      }
    }
    return 'information';
  }

  private extractEntities(query: string): ExtractedEntities {
    const entities: ExtractedEntities = {
      lawNumbers: [],
      articleNumbers: [],
      dates: [],
      amounts: [],
      durations: [],
      actors: [],
    };

    // Extraire chaque type d'entité
    for (const [key, patterns] of Object.entries(entityPatterns)) {
      const values: string[] = [];
      for (const pattern of patterns) {
        const matches = query.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) values.push(match[1]);
          else if (match[0]) values.push(match[0]);
        }
      }
      entities[key as keyof ExtractedEntities] = [...new Set(values)];
    }

    return entities;
  }

  private calculateConfidence(
    domain: LegalDomain,
    intent: QueryIntent,
    entities: ExtractedEntities
  ): number {
    let confidence = 0.3; // Base confidence

    // Bonus si domaine identifié
    if (domain !== 'general') confidence += 0.3;

    // Bonus si intention identifiée
    if (intent !== 'information') confidence += 0.2;

    // Bonus si entités extraites
    const entityCount = Object.values(entities).flat().length;
    confidence += Math.min(entityCount * 0.1, 0.2);

    return Math.min(confidence, 1);
  }

  private buildFilters(
    domain: LegalDomain,
    entities: ExtractedEntities
  ): Record<string, string> {
    const filters: Record<string, string> = {};

    // Mapper domaine vers filtre
    if (domain !== 'general') {
      filters.domaine = domain;
    }

    // Si références de loi spécifiques, filtrer par type
    if (entities.lawNumbers.length > 0) {
      // Analyser si c'est une loi ou un décret
      const hasDecret = entities.lawNumbers.some(n =>
        n.toLowerCase().includes('decret') || n.includes('مرسوم')
      );
      if (hasDecret) {
        filters.type = 'decret';
      }
    }

    return filters;
  }

  /**
   * Génère un contexte enrichi pour le prompt
   */
  generateContext(classification: QueryClassification): string {
    const parts: string[] = [];

    if (classification.domain !== 'general') {
      parts.push(`Domaine juridique identifié: ${this.getDomainLabel(classification.domain)}`);
    }

    if (classification.intent !== 'information') {
      parts.push(`Type de question: ${this.getIntentLabel(classification.intent)}`);
    }

    const { entities } = classification;
    if (entities.lawNumbers.length > 0) {
      parts.push(`Références citées: ${entities.lawNumbers.join(', ')}`);
    }
    if (entities.articleNumbers.length > 0) {
      parts.push(`Articles mentionnés: ${entities.articleNumbers.join(', ')}`);
    }

    return parts.length > 0
      ? `[Contexte de la requête]\n${parts.join('\n')}\n\n`
      : '';
  }

  private getDomainLabel(domain: LegalDomain): string {
    const labels: Record<LegalDomain, string> = {
      travail: 'Droit du travail',
      commercial: 'Droit commercial',
      fiscal: 'Droit fiscal',
      civil: 'Droit civil',
      penal: 'Droit pénal',
      administratif: 'Droit administratif',
      constitutionnel: 'Droit constitutionnel',
      famille: 'Droit de la famille',
      environnement: 'Droit de l\'environnement',
      propriete: 'Propriété intellectuelle',
      donnees: 'Protection des données',
      general: 'Général',
    };
    return labels[domain];
  }

  private getIntentLabel(intent: QueryIntent): string {
    const labels: Record<QueryIntent, string> = {
      definition: 'Demande de définition',
      procedure: 'Question procédurale',
      droits: 'Question sur les droits',
      obligations: 'Question sur les obligations',
      sanctions: 'Question sur les sanctions',
      conditions: 'Question sur les conditions',
      comparison: 'Demande de comparaison',
      verification: 'Vérification de conformité',
      temporel: 'Question sur les délais',
      information: 'Recherche d\'information',
    };
    return labels[intent];
  }
}

export const queryClassifier = new QueryClassifier();
