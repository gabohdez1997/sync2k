// src/routes/api/integrations/hka/last-number/+server.ts
import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { getLastHkaDocumentNumber } from '$lib/server/services/hka';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const tipoDocumento = url.searchParams.get('tipo_documento') || '01';
  const serie = url.searchParams.get('serie') || undefined;

  try {
    const result = await getLastHkaDocumentNumber(tipoDocumento, serie);
    return json(result, { status: result.success ? 200 : 400 });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar último número: ${err.message}`
    }, { status: 500 });
  }
};

