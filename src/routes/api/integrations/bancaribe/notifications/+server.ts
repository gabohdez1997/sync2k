// src/routes/api/integrations/bancaribe/notifications/+server.ts
// Servicio de Notificaciones Bancaribe Open Banking (Webhook Receptor)
// Recibe peticiones POST con header "Authorization: ApiKey <key>" y responde { message: "Success", statusCode: 200 }

import { json } from '@sveltejs/kit';
import {
  verifyBancaribeWebhookAuth,
  recordBancaribeNotification,
  getBancaribeNotifications,
  clearBancaribeNotifications
} from '$lib/server/services/bancaribe';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
  try {
    const authHeader = request.headers.get('authorization');
    const xApiKey = request.headers.get('x-api-key');

    const authCheck = await verifyBancaribeWebhookAuth(authHeader, xApiKey, fetch);
    if (!authCheck.authorized) {
      return json(
        {
          message: authCheck.reason || 'Unauthorized',
          statusCode: 401
        },
        { status: 401 }
      );
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return json(
        {
          message: 'Invalid JSON payload',
          statusCode: 400
        },
        { status: 400 }
      );
    }

    let sourceIp = '';
    try {
      sourceIp = getClientAddress();
    } catch {
      sourceIp = request.headers.get('x-forwarded-for') || '';
    }

    recordBancaribeNotification(payload, sourceIp);

    // Respuesta exacta especificada en el manual de Servicio de Notificaciones Bancaribe
    return json(
      {
        message: 'Success',
        statusCode: 200
      },
      { status: 200 }
    );
  } catch (err: any) {
    return json(
      {
        message: err.message || 'Internal Server Error',
        statusCode: 500
      },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async ({ locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }
  if (!hasPermission(profile, 'sec_integrations', 'read') && !hasPermission(profile, 'sec_integrations', 'others')) {
    return json({ success: false, message: 'Sin permisos para consultar integraciones.' }, { status: 403 });
  }

  const notifications = getBancaribeNotifications();
  return json({
    success: true,
    notifications
  });
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }
  if (!hasPermission(profile, 'sec_integrations', 'others')) {
    return json({ success: false, message: 'Sin permisos para limpiar notificaciones.' }, { status: 403 });
  }

  clearBancaribeNotifications();
  return json({
    success: true,
    notifications: []
  });
};
