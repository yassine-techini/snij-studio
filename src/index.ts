// SNIJ Studio - Agents IA & Pipeline RAG
// Point d'entrée principal

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import type { Bindings, Variables } from './core/types';
import { searchRoutes } from './routes/search';
import { ragRoutes } from './routes/rag';
import { summarizeRoutes } from './routes/summarize';
import { documentsRoutes } from './routes/documents';
import { rateLimiter } from './middleware/rate-limit';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware globaux
app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'https://snij.tn', 'https://*.snij.tn'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 86400,
    credentials: true,
  })
);

// Rate limiting sur les routes API
app.use('/api/*', rateLimiter());

// Routes API
app.route('/api/search', searchRoutes);
app.route('/api/rag', ragRoutes);
app.route('/api/summarize', summarizeRoutes);
app.route('/api/documents', documentsRoutes);

// Health check
app.get('/', (c) => {
  return c.json({
    service: 'snij-studio',
    version: '1.0.0',
    status: 'healthy',
    endpoints: {
      search: 'POST /api/search',
      rag: 'POST /api/rag',
      summarize: 'POST /api/summarize',
      documents: 'GET /api/documents',
    },
    capabilities: {
      languages: ['ar', 'fr', 'en'],
      streaming: true,
      agents: ['search', 'rag', 'summary'],
    },
  });
});

// Health check détaillé
app.get('/health', async (c) => {
  const checks: Record<string, boolean> = {
    kv: false,
    foundry: false,
    anthropic: false,
  };

  // Check KV
  try {
    await c.env.KV.put('health-check', Date.now().toString(), { expirationTtl: 60 });
    checks.kv = true;
  } catch {
    checks.kv = false;
  }

  // Check Foundry connectivity
  try {
    const response = await fetch(c.env.FOUNDRY_API_URL, {
      headers: { Authorization: `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}` },
    });
    checks.foundry = response.ok;
  } catch {
    checks.foundry = false;
  }

  // Check Anthropic API key exists
  checks.anthropic = !!c.env.ANTHROPIC_API_KEY;

  const allHealthy = Object.values(checks).every(Boolean);

  return c.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    allHealthy ? 200 : 503
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Error handler global
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message:
          c.env.ENVIRONMENT === 'development'
            ? err.message
            : 'An unexpected error occurred',
      },
    },
    500
  );
});

export default app;
