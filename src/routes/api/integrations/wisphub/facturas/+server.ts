// src/routes/api/integrations/wisphub/facturas/+server.ts
import { json } from '@sveltejs/kit';
import { getWisphubFacturas, getWisphubFactura } from '$lib/server/services/wisphub';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const id_factura = url.searchParams.get('id');
  if (id_factura) {
    try {
      const singleRes = await getWisphubFactura(id_factura);
      return json(singleRes, { status: singleRes.success ? 200 : singleRes.statusCode || 400 });
    } catch (err: any) {
      return json({ success: false, message: err.message }, { status: 500 });
    }
  }

  const id_cliente = url.searchParams.get('id_cliente') || undefined;
  const estado = url.searchParams.get('estado') || undefined;
  const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : undefined;
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
  const search = url.searchParams.get('search') || undefined;

  try {
    const result = await getWisphubFacturas({
      id_cliente,
      estado,
      page,
      limit,
      search
    });

    return json(result, { status: result.success ? 200 : result.statusCode || 400 });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar facturas: ${err.message}`
    }, { status: 500 });
  }
};

