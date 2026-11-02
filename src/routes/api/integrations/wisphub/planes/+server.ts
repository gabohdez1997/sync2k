// src/routes/api/integrations/wisphub/planes/+server.ts
import { json } from '@sveltejs/kit';
import { getWisphubPlanes } from '$lib/server/services/wisphub';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  try {
    const result = await getWisphubPlanes();
    return json(result, { status: result.success ? 200 : result.statusCode || 400 });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al consultar planes: ${err.message}`
    }, { status: 500 });
  }
};

