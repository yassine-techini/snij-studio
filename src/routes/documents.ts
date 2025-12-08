// Route /api/documents - Proxy vers Foundry/Drupal

import { Hono } from 'hono';
import { FoundryClient } from '../core/services/foundry-client';
import type { Bindings, Variables } from '../core/types';

const documentsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Liste des documents
documentsRoutes.get('/', async (c) => {
  const foundry = new FoundryClient(c.env);

  const entity = c.req.query('type') as 'loi' | 'decret' | 'jurisprudence' | undefined;
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const results = await foundry.queryLexical('', { entity }, limit);

    return c.json({
      success: true,
      data: {
        results,
        total: results.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch documents',
      },
      500
    );
  }
});

// Document par ID
documentsRoutes.get('/:id', async (c) => {
  const foundry = new FoundryClient(c.env);
  const id = c.req.param('id');

  try {
    const document = await foundry.getDocument(id);

    if (!document) {
      return c.json(
        {
          success: false,
          error: 'Document not found',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: document,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch document',
      },
      500
    );
  }
});

export { documentsRoutes };
