// src/routes/api/integrations/wisphub/clientes/[id]/comprobantes/+server.ts
import { json } from '@sveltejs/kit';
import { getWisphubClienteComprobantes } from '$lib/server/services/wisphub';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return json({ success: false, message: 'ID de servicio requerido.' }, { status: 400 });
  }

  const usuario = url.searchParams.get('usuario') || undefined;

  try {
    const result = await getWisphubClienteComprobantes(id, usuario);
    return json(result, { status: result.success ? 200 : result.statusCode || 400 });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar comprobantes: ${err.message}`
    }, { status: 500 });
  }
};
