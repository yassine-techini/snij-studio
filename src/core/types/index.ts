// Types partagés pour DevFactory Studio

export interface Bindings {
  ANTHROPIC_API_KEY: string;
  FOUNDRY_API_URL: string;
  FOUNDRY_SERVICE_TOKEN: string;
  DRUPAL_BASE_URL: string;
  KV: KVNamespace;
  ENVIRONMENT: string;
}

export interface Variables {
  agentContext?: AgentContext;
}

export interface AgentContext {
  env: Bindings;
  config: StudioConfig;
  language: 'ar' | 'fr' | 'en';
  userId?: string;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime: number;
}

// Search types
export interface SearchResult {
  id: string;
  type: 'loi' | 'decret' | 'jurisprudence';
  title: string;
  titleAr?: string;
  titleFr?: string;
  numero: string;
  date: string;
  domaine?: {
    id: string;
    name: string;
  };
  excerpt?: string;
  aiSummary?: string;
  score: number;
  url?: string;
  content?: string;
}

export interface Facets {
  type: Array<{ value: string; count: number }>;
  domaine: Array<{ value: string; count: number }>;
  year?: Array<{ value: string; count: number }>;
}

// RAG types
export interface Source {
  id: string;
  type: string;
  title: string;
  numero: string;
  date: string;
  relevantPassage: string;
  url: string;
}

// Config types
export interface StudioConfig {
  domain: string;
  agents: AgentsConfig;
  rag: RAGConfig;
  prompts: PromptsConfig;
}

export interface AgentsConfig {
  search: SearchAgentConfig;
  rag: RAGAgentConfig;
  summary: SummaryAgentConfig;
}

export interface SearchAgentConfig {
  lexicalWeight: number;
  semanticWeight: number;
  defaultLimit: number;
  maxLimit: number;
}

export interface RAGAgentConfig {
  maxSources: number;
  temperature: number;
  maxTokens: number;
  model: string;
  confidenceThreshold: number;
}

export interface SummaryAgentConfig {
  shortMaxTokens: number;
  detailedMaxTokens: number;
  temperature: number;
}

export interface RAGConfig {
  retriever: {
    topK: number;
    fusionK: number;
  };
  reranker: {
    topK: number;
    minScore: number;
  };
}

export interface PromptsConfig {
  system: Record<string, string>;
  ragTemplate: string;
  summaryTemplate: string;
}
