// src/routes/api/integrations/wisphub/clientes/+server.ts
import { json } from '@sveltejs/kit';
import { getWisphubClientes } from '$lib/server/services/wisphub';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const search = url.searchParams.get('search') || undefined;
  const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : undefined;
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined;
  const estado = url.searchParams.get('estado') || undefined;
  const router = url.searchParams.get('router') || undefined;

  try {
    const result = await getWisphubClientes({
      search,
      page,
      limit,
      offset,
      estado,
      router
    });

    return json(result, { status: result.success ? 200 : result.statusCode || 400 });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar clientes de WispHub: ${err.message}`
    }, { status: 500 });
  }
};

