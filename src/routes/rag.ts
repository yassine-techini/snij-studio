// Route /api/rag - Question-Réponse avec RAG

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { RAGAgent } from '../core/agents/rag-agent';
import type { Bindings, Variables, AgentContext } from '../core/types';
import snijConfig from '../config';

const ragRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

ragRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    question: string;
    filters?: Record<string, unknown>;
    maxSources?: number;
    language?: 'ar' | 'fr' | 'en';
    stream?: boolean;
  }>();

  if (!body.question || body.question.trim().length === 0) {
    return c.json({ success: false, error: 'Question is required' }, 400);
  }

  const language =
    body.language ??
    (c.req.header('Accept-Language')?.split(',')[0]?.substring(0, 2) as
      | 'ar'
      | 'fr'
      | 'en') ??
    'ar';

  const context: AgentContext = {
    env: c.env,
    config: snijConfig,
    language,
  };

  const agent = new RAGAgent(context);

  // Mode streaming
  if (body.stream) {
    return streamSSE(c, async (stream) => {
      const generator = agent.executeStream({
        question: body.question,
        filters: body.filters,
        maxSources: body.maxSources,
      });

      for await (const event of generator) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        });
      }
    });
  }

  // Mode normal
  const result = await agent.execute({
    question: body.question,
    filters: body.filters,
    maxSources: body.maxSources,
  });

  return c.json({
    success: result.success,
    data: result.data,
    meta: {
      executionTime: result.executionTime,
    },
  });
});

export { ragRoutes };
