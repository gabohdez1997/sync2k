// src/routes/api/integrations/bancaribe/execute/+server.ts
// Endpoint unificado para consumir todas las APIs de Bancaribe Open Banking desde Sync2K

import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import {
  getBancaribeAccessToken,
  consultarTasasBcv,
  consultarUltimosMovimientos,
  consultarExtractoHistorico,
  consultarExtractoResumen,
  verificarTransaccionExtracto,
  consultarOperacionPlus,
  listarBancosBancaribe,
  registrarPagoC2p,
  enviarPagoPersonasB2p,
  iniciarTransferenciaInmediata,
  consultarTransferenciaCrin,
  generarTokenCobranza,
  solicitarClaveCobranza,
  ejecutarCobranzaDigital,
  consultarOperacionCobranza,
  getBancaribeNotifications,
  clearBancaribeNotifications,
  recordBancaribeNotification
} from '$lib/server/services/bancaribe';
import type { RequestHandler } from './$types';

const FINANCIAL_MUTATION_OPS = new Set([
  'pago_c2p',
  'pago_b2p',
  'transferencia_inmediata',
  'cobranza_cargo'
]);

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const canRead = hasPermission(profile, 'sec_integrations', 'read');
  const canExecute = hasPermission(profile, 'sec_integrations', 'others');

  try {
    const body = await request.json().catch(() => ({}));
    const operation = String(body.operation || '').trim();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!operation) {
      return json({ success: false, message: 'Debe indicar la operación Bancaribe a ejecutar.' }, { status: 400 });
    }

    if (FINANCIAL_MUTATION_OPS.has(operation) && !canExecute) {
      return json(
        { success: false, message: 'No posee permisos de ejecución en integraciones para operaciones financieras.' },
        { status: 403 }
      );
    }

    if (!canRead && !canExecute) {
      return json({ success: false, message: 'Sin permisos para operar integraciones.' }, { status: 403 });
    }

    let result: any;

    switch (operation) {
      case 'oauth_token':
        result = await getBancaribeAccessToken({
          forceRefresh: Boolean(payload.forceRefresh),
          fetchFn: fetch
        });
        break;

      case 'tasas_bcv':
        result = await consultarTasasBcv(payload, fetch);
        break;

      case 'ultimos_movimientos':
        result = await consultarUltimosMovimientos(payload, fetch);
        break;

      case 'extracto_historico':
        result = await consultarExtractoHistorico(payload, fetch);
        break;

      case 'extracto_resumen':
        result = await consultarExtractoResumen(payload, fetch);
        break;

      case 'extracto_verificar':
        result = await verificarTransaccionExtracto(payload, fetch);
        break;

      case 'consulta_operacion':
        result = await consultarOperacionPlus(payload, fetch);
        break;

      case 'listar_bancos':
        result = await listarBancosBancaribe(payload, fetch);
        break;

      case 'pago_c2p':
        result = await registrarPagoC2p(payload, fetch);
        break;

      case 'pago_b2p':
        result = await enviarPagoPersonasB2p(payload, fetch);
        break;

      case 'transferencia_inmediata':
        result = await iniciarTransferenciaInmediata(payload, fetch);
        break;

      case 'consultar_transferencia':
        result = await consultarTransferenciaCrin(payload, fetch);
        break;

      case 'cobranza_token':
        result = await generarTokenCobranza(payload, fetch);
        break;

      case 'cobranza_clave':
        result = await solicitarClaveCobranza(payload, fetch);
        break;

      case 'cobranza_cargo':
        result = await ejecutarCobranzaDigital(payload, fetch);
        break;

      case 'cobranza_consulta':
        result = await consultarOperacionCobranza(payload, fetch);
        break;

      case 'notificaciones_list':
        result = {
          success: true,
          statusCode: 200,
          message: 'Notificaciones recuperadas.',
          latencyMs: 0,
          data: { notifications: getBancaribeNotifications() }
        };
        break;

      case 'notificaciones_clear':
        clearBancaribeNotifications();
        result = {
          success: true,
          statusCode: 200,
          message: 'Historial local de notificaciones limpiado.',
          latencyMs: 0,
          data: { notifications: [] }
        };
        break;

      case 'notificaciones_simulate': {
        const simRecord = recordBancaribeNotification(
          {
            amount: Number(payload.amount || 100),
            bankName: payload.bankName || 'BANCO DEL CARIBE',
            clientPhone: payload.clientPhone || '00584141234567',
            commercePhone: payload.commercePhone || '00584149999999',
            creditorAccount: payload.creditorAccount || '01140152001520123861',
            currencyCode: payload.currencyCode || 'VES',
            date: payload.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
            debtorAccount: payload.debtorAccount || '01140152001520123746',
            debtorID: payload.debtorID || 'V12345678',
            destinyBankReference: payload.destinyBankReference || String(Date.now()).slice(-12),
            originBankCode: payload.originBankCode || '0114',
            originBankReference: payload.originBankReference || String(Date.now()).slice(-9),
            paymentType: payload.paymentType || 'TRF',
            time: payload.time || new Date().toTimeString().slice(0, 8),
            Udf1: payload.Udf1 || 'SIMULACION_SYNC2K',
            Udf2: payload.Udf2 || '',
            Udf3: payload.Udf3 || ''
          },
          '127.0.0.1 (Simulación)'
        );
        result = {
          success: true,
          statusCode: 200,
          message: 'Notificación de prueba simulada y almacenada correctamente.',
          latencyMs: 0,
          data: { record: simRecord, notifications: getBancaribeNotifications() }
        };
        break;
      }

      default:
        return json({ success: false, message: `Operación Bancaribe no soportada: ${operation}` }, { status: 400 });
    }

    if (FINANCIAL_MUTATION_OPS.has(operation)) {
      await logAction({
        uid: profile.id,
        user_email: profile.email || 'system',
        action: 'CREATE',
        module: `bancaribe_${operation}`,
        record_id: String(result?.data?.secuencial || result?.data?.idEndToEnd || result?.data?.codigoConfirmacion || ''),
        new_data: {
          operation,
          success: result?.success,
          statusCode: result?.statusCode,
          message: result?.message
        },
        branch_id: profile.allowed_branches?.[0]?.id || undefined
      });
    }

    return json(result, { status: 200 });
  } catch (err: any) {
    return json(
      {
        success: false,
        statusCode: 500,
        message: `Error ejecutando operación Bancaribe: ${err.message}`
      },
      { status: 500 }
    );
  }
};
