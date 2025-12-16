// Route /api/admin - Administration des documents (protégée par token)

import { Hono } from 'hono';
import { FoundryClient } from '../core/services/foundry-client';
import type { Bindings, Variables } from '../core/types';

const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware d'authentification admin
adminRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const adminToken = c.env.SERVICE_TOKEN;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== adminToken) {
    return c.json({ success: false, error: 'Invalid token' }, 403);
  }

  await next();
});

// POST /api/admin/documents - Créer un document
adminRoutes.post('/documents', async (c) => {
  try {
    const body = await c.req.json<{
      id?: string;
      type: 'loi' | 'decret' | 'jurisprudence';
      numero: string;
      title: { ar: string; fr?: string; en?: string };
      content: { ar: string; fr?: string; en?: string };
      aiSummary?: { ar: string; fr?: string; en?: string };
      date: string;
      domaine: string;
      statut?: string;
      jortReference?: string;
    }>();

    // Validation
    if (!body.type || !body.numero || !body.title?.ar || !body.content?.ar || !body.date || !body.domaine) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    // Générer un ID si non fourni
    const id = body.id || `${body.type}-${Date.now()}`;

    // Appeler Foundry pour indexer le document
    const response = await c.env.FOUNDRY.fetch('https://foundry/sync/document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        document: {
          id,
          type: body.type,
          numero: body.numero,
          title: body.title,
          content: body.content,
          aiSummary: body.aiSummary,
          datePromulgation: body.date,
          domaine: body.domaine,
          statut: body.statut || 'en_vigueur',
          jortReference: body.jortReference,
        },
      }),
    });

    const result = await response.json() as { success: boolean; error?: string };

    if (!response.ok || !result.success) {
      return c.json({ success: false, error: result.error || 'Failed to create document' }, response.status);
    }

    return c.json({
      success: true,
      data: { id },
      message: 'Document created successfully',
    });
  } catch (error) {
    console.error('Admin create document error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// PUT /api/admin/documents/:id - Mettre à jour un document
adminRoutes.put('/documents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      type?: 'loi' | 'decret' | 'jurisprudence';
      numero?: string;
      title?: { ar: string; fr?: string; en?: string };
      content?: { ar: string; fr?: string; en?: string };
      aiSummary?: { ar: string; fr?: string; en?: string };
      date?: string;
      domaine?: string;
      statut?: string;
      jortReference?: string;
    }>();

    // Récupérer le document existant
    const foundry = new FoundryClient(c.env);
    const existing = await foundry.getDocument(id);

    if (!existing) {
      return c.json({ success: false, error: 'Document not found' }, 404);
    }

    // Fusionner les données
    const updated = {
      id,
      type: body.type || existing.type,
      numero: body.numero || existing.numero,
      title: body.title || { ar: existing.titleAr || '', fr: existing.titleFr },
      content: body.content || { ar: existing.content || '' },
      aiSummary: body.aiSummary,
      datePromulgation: body.date || existing.date,
      domaine: body.domaine || existing.domaine?.id || 'autres',
      statut: body.statut || 'en_vigueur',
      jortReference: body.jortReference,
    };

    // Appeler Foundry pour mettre à jour
    const response = await c.env.FOUNDRY.fetch('https://foundry/sync/document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ document: updated }),
    });

    const result = await response.json() as { success: boolean; error?: string };

    if (!response.ok || !result.success) {
      return c.json({ success: false, error: result.error || 'Failed to update document' }, response.status);
    }

    return c.json({
      success: true,
      message: 'Document updated successfully',
    });
  } catch (error) {
    console.error('Admin update document error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// DELETE /api/admin/documents/:id - Supprimer un document
adminRoutes.delete('/documents/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const response = await c.env.FOUNDRY.fetch(`https://foundry/sync/document/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
    });

    const result = await response.json() as { success: boolean; error?: string };

    if (!response.ok || !result.success) {
      return c.json({ success: false, error: result.error || 'Failed to delete document' }, response.status);
    }

    return c.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Admin delete document error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// GET /api/admin/stats - Statistiques
adminRoutes.get('/stats', async (c) => {
  try {
    const response = await c.env.FOUNDRY.fetch('https://foundry/sync/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
    });

    const result = await response.json() as { success: boolean; stats?: unknown; error?: string };

    if (!response.ok || !result.success) {
      return c.json({ success: false, error: result.error || 'Failed to get stats' }, response.status);
    }

    return c.json({
      success: true,
      data: result.stats,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// POST /api/admin/sync - Déclencher une synchronisation
adminRoutes.post('/sync', async (c) => {
  try {
    const body = await c.req.json<{
      incremental?: boolean;
      entityTypes?: ('loi' | 'decret' | 'jurisprudence')[];
    }>().catch(() => ({}));

    const response = await c.env.FOUNDRY.fetch('https://foundry/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        incremental: body.incremental ?? true,
        entityTypes: body.entityTypes,
      }),
    });

    const result = await response.json() as {
      success: boolean;
      processed?: number;
      indexed?: number;
      errors?: string[];
      duration?: number;
      error?: string;
    };

    return c.json({
      success: result.success,
      data: {
        processed: result.processed || 0,
        indexed: result.indexed || 0,
        errors: result.errors || [],
        duration: result.duration || 0,
      },
      error: result.error,
    });
  } catch (error) {
    console.error('Admin sync error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// POST /api/admin/reindex - Réindexation complète
adminRoutes.post('/reindex', async (c) => {
  try {
    const response = await c.env.FOUNDRY.fetch('https://foundry/sync/reindex', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
    });

    const result = await response.json() as {
      success: boolean;
      processed?: number;
      indexed?: number;
      errors?: string[];
      duration?: number;
      error?: string;
    };

    return c.json({
      success: result.success,
      data: {
        processed: result.processed || 0,
        indexed: result.indexed || 0,
        errors: result.errors || [],
        duration: result.duration || 0,
      },
      error: result.error,
    });
  } catch (error) {
    console.error('Admin reindex error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// GET /api/admin/pipeline/status - État du pipeline
adminRoutes.get('/pipeline/status', async (c) => {
  try {
    // Get sync stats from Foundry
    const statsResponse = await c.env.FOUNDRY.fetch('https://foundry/sync/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
    });

    const statsResult = await statsResponse.json() as { success: boolean; stats?: { lastSync: Record<string, string | null>; documentsIndexed: number } };

    // Get document count
    const docsResponse = await c.env.FOUNDRY.fetch('https://foundry/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.FOUNDRY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ limit: 1 }),
    });

    const docsResult = await docsResponse.json() as { success: boolean; count?: number };

    // Check Drupal connectivity
    let drupalStatus = 'unknown';
    try {
      const drupalUrl = c.env.DRUPAL_BASE_URL || 'https://snij-drupal.onrender.com';
      const drupalCheck = await fetch(drupalUrl, { method: 'HEAD' });
      drupalStatus = drupalCheck.ok ? 'online' : 'offline';
    } catch {
      drupalStatus = 'offline';
    }

    return c.json({
      success: true,
      data: {
        drupal: {
          status: drupalStatus,
          url: c.env.DRUPAL_BASE_URL || 'https://snij-drupal.onrender.com',
        },
        sync: {
          lastSync: statsResult.stats?.lastSync || {},
          documentsIndexed: statsResult.stats?.documentsIndexed || 0,
        },
        storage: {
          d1: 'connected',
          vectorize: 'connected',
        },
        documentCount: docsResult.count || 0,
      },
    });
  } catch (error) {
    console.error('Pipeline status error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// ============================================
// Analytics RAG
// ============================================

import { RAGAnalytics } from '../core/services/rag-analytics';

// GET /api/admin/analytics/summary - Résumé des analytics
adminRoutes.get('/analytics/summary', async (c) => {
  try {
    const period = (c.req.query('period') || 'day') as 'day' | 'week' | 'month';
    const analytics = new RAGAnalytics(c.env.KV);
    const summary = await analytics.getSummary(period);

    return c.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// GET /api/admin/analytics/daily - Stats quotidiennes
adminRoutes.get('/analytics/daily', async (c) => {
  try {
    const date = c.req.query('date'); // Format: YYYY-MM-DD
    const analytics = new RAGAnalytics(c.env.KV);
    const stats = await analytics.getDailyStats(date);

    if (!stats) {
      return c.json({
        success: true,
        data: null,
        message: 'No data for this date',
      });
    }

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Analytics daily error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// GET /api/admin/analytics/top-questions - Questions les plus fréquentes
adminRoutes.get('/analytics/top-questions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const analytics = new RAGAnalytics(c.env.KV);
    const topQuestions = await analytics.getTopQuestions(limit);

    return c.json({
      success: true,
      data: topQuestions,
    });
  } catch (error) {
    console.error('Analytics top-questions error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

// POST /api/admin/analytics/feedback - Enregistrer un feedback
adminRoutes.post('/analytics/feedback', async (c) => {
  try {
    const body = await c.req.json<{
      eventId: string;
      rating?: 1 | 2 | 3 | 4 | 5;
      type?: 'helpful' | 'not_helpful' | 'wrong' | 'incomplete';
    }>();

    if (!body.eventId) {
      return c.json({ success: false, error: 'eventId is required' }, 400);
    }

    const analytics = new RAGAnalytics(c.env.KV);
    const success = await analytics.trackFeedback(body.eventId, {
      rating: body.rating,
      type: body.type,
    });

    return c.json({
      success,
      message: success ? 'Feedback recorded' : 'Event not found',
    });
  } catch (error) {
    console.error('Analytics feedback error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500
    );
  }
});

export { adminRoutes };
