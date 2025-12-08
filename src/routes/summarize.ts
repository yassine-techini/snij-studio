// Route /api/summarize - Génération de résumés

import { Hono } from 'hono';
import { SummaryAgent } from '../core/agents/summary-agent';
import type { Bindings, Variables, AgentContext } from '../core/types';
import snijConfig from '../config';

const summarizeRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

summarizeRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    documentId: string;
    type?: 'short' | 'detailed';
    language?: 'ar' | 'fr' | 'en';
    force?: boolean;
  }>();

  if (!body.documentId) {
    return c.json({ success: false, error: 'documentId is required' }, 400);
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

  const agent = new SummaryAgent(context);
  const result = await agent.execute({
    documentId: body.documentId,
    type: body.type,
    language,
  });

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
      },
      result.error === 'Document not found' ? 404 : 500
    );
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      executionTime: result.executionTime,
    },
  });
});

export { summarizeRoutes };
