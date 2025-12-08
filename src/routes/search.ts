// Route /api/search - Recherche hybride

import { Hono } from 'hono';
import { SearchAgent } from '../core/agents/search-agent';
import type { Bindings, Variables, AgentContext } from '../core/types';
import snijConfig from '../config';

const searchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

searchRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    query: string;
    filters?: {
      type?: string[];
      domaine?: string[];
      dateFrom?: string;
      dateTo?: string;
    };
    page?: number;
    limit?: number;
    language?: 'ar' | 'fr' | 'en';
  }>();

  if (!body.query || body.query.trim().length === 0) {
    return c.json({ success: false, error: 'Query is required' }, 400);
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

  const agent = new SearchAgent(context);
  const result = await agent.execute({
    query: body.query,
    filters: body.filters,
    page: body.page,
    limit: body.limit,
  });

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
      },
      500
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

export { searchRoutes };
