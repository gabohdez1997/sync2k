// src/routes/api/integrations/wisphub/clientes/[id]/+server.ts
import { json } from '@sveltejs/kit';
import { getWisphubCliente, getWisphubClienteSaldo } from '$lib/server/services/wisphub';
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

  const view = url.searchParams.get('view') || 'all';

  try {
    if (view === 'saldo') {
      const saldoRes = await getWisphubClienteSaldo(id);
      return json(saldoRes, { status: saldoRes.success ? 200 : saldoRes.statusCode || 400 });
    }

    // Por defecto consulta detalle y saldo concurrentemente
    const [clientRes, saldoRes] = await Promise.all([
      getWisphubCliente(id),
      getWisphubClienteSaldo(id).catch(() => ({ success: false, data: undefined }))
    ]);

    if (!clientRes.success) {
      return json({ success: false, message: clientRes.error || 'Cliente no encontrado' }, { status: clientRes.statusCode || 404 });
    }

    return json({
      success: true,
      client: clientRes.client,
      saldo: saldoRes.data || null
    });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar cliente: ${err.message}`
    }, { status: 500 });
  }
};

