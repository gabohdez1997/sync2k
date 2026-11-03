// src/routes/api/integrations/wisphub/sync/customers/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { getWisphubClientes, getWisphubCliente, type WisphubClient } from '$lib/server/services/wisphub';
import { syncBatchWisphubCustomers, type CustomerSyncOptions } from '$lib/server/services/wisphubSync';
import { getIntegration, saveIntegration } from '$lib/server/integrations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { clients: rawClients, id_servicio, branch_id, options = {} } = body;

    // Resolver sucursal de destino en Profit Plus
    const allowedBranches = profile.allowed_branches || [];
    const targetBranch = branch_id
      ? allowedBranches.find((b: any) => b.id === branch_id)
      : (allowedBranches[0] || null);

    if (!targetBranch || !targetBranch.agent_url) {
      return json({
        success: false,
        message: 'No se encontró una sucursal con Agente Sync2K configurado para recibir la sincronización.'
      }, { status: 400 });
    }

    const agentClient = new AgentClient({
      slug: targetBranch.id,
      agent_url: targetBranch.agent_url,
      agent_api_key: targetBranch.agent_token
    }, profile, fetch);

    // Obtener los clientes a sincronizar
    let clientsToSync: WisphubClient[] = [];

    if (Array.isArray(rawClients) && rawClients.length > 0) {
      clientsToSync = rawClients;
    } else if (id_servicio) {
      const singleRes = await getWisphubCliente(id_servicio);
      if (!singleRes.success || !singleRes.client) {
        return json({ success: false, message: singleRes.error || 'Cliente no encontrado en WispHub' }, { status: 404 });
      }
      clientsToSync = [singleRes.client];
    } else {
      // Si no vienen clientes específicos, traer los primeros activos o según filtros
      const listRes = await getWisphubClientes({ limit: 100, estado: '1' });
      if (!listRes.success || !listRes.results) {
        return json({ success: false, message: listRes.error || 'No se pudieron consultar clientes de WispHub' }, { status: 400 });
      }
      clientsToSync = listRes.results;
    }

    // Defaults de Profit Plus obtenidos de la configuración de la Sucursal o de la integración
    const curWisp = await getIntegration('wisphub').catch(() => null);
    const branchId = String(targetBranch.id || '');
    const branchPreset = curWisp?.options?.branch_presets?.[branchId] || {};

    const defaultZone = (options.default_zone || branchPreset.default_zone || targetBranch.default_zone || '01').trim();
    const defaultClientType = (options.default_client_type || branchPreset.default_client_type || targetBranch.default_client_type || '01').trim();
    const defaultCta = (options.default_cta_ingr_egr || branchPreset.default_cta_ingr_egr || targetBranch.default_cta_ingr_egr || 'I-001').trim();
    const defaultSeller = (options.default_seller || branchPreset.default_seller || targetBranch.default_seller || '01').trim();
    const defaultSegment = (options.default_segment || branchPreset.default_segment || targetBranch.default_segment || '01').trim();
    const defaultCurrency = (options.default_currency || branchPreset.default_currency || 'US$').trim();
    const defaultCond = (options.default_cond || branchPreset.default_cond || '01').trim();

    const syncOptions: CustomerSyncOptions = {
      sedeId: targetBranch.profit_server_id || targetBranch.id,
      default_cta_ingr_egr: defaultCta,
      default_zone: defaultZone,
      default_client_type: defaultClientType,
      default_seller: defaultSeller,
      default_segment: defaultSegment,
      default_currency: defaultCurrency,
      default_cond: defaultCond,
      overwrite_existing: options.overwrite_existing ?? true,
      field_mappings: options.field_mappings || branchPreset.field_mappings || {}
    };

    // Si el usuario marcó persistir opciones, actualizar la integración de WispHub (con presets por sucursal)
    if (options.save_defaults) {
      try {
        if (curWisp) {
          const existingPresets = curWisp.options?.branch_presets || {};
          await saveIntegration('wisphub', {
            options: {
              ...curWisp.options,
              default_cta_ingr_egr: syncOptions.default_cta_ingr_egr,
              default_zone: syncOptions.default_zone,
              default_client_type: syncOptions.default_client_type,
              default_seller: syncOptions.default_seller,
              default_segment: syncOptions.default_segment,
              field_mappings: syncOptions.field_mappings,
              branch_presets: {
                ...existingPresets,
                [branchId]: {
                  default_cta_ingr_egr: syncOptions.default_cta_ingr_egr,
                  default_zone: syncOptions.default_zone,
                  default_client_type: syncOptions.default_client_type,
                  default_seller: syncOptions.default_seller,
                  default_segment: syncOptions.default_segment,
                  field_mappings: syncOptions.field_mappings
                }
              }
            }
          }, fetch);
        }
      } catch {}
    }

    const summary = await syncBatchWisphubCustomers(clientsToSync, agentClient, syncOptions);

    // Registrar en auditoría
    await logAction({
      uid: profile.id,
      user_email: profile.email || 'system',
      action: 'UPDATE',
      module: 'integrations',
      record_id: 'wisphub_customers_sync',
      branch_id: targetBranch.id,
      new_data: {
        total: summary.total,
        created: summary.created,
        updated: summary.updated,
        failed: summary.failed,
        branch_name: targetBranch.name,
        co_cta_ingr_egr: syncOptions.default_cta_ingr_egr
      }
    });

    return json({
      success: true,
      summary,
      branch: {
        id: targetBranch.id,
        name: targetBranch.name
      }
    });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error durante la sincronización de clientes: ${err.message}`
    }, { status: 500 });
  }
};
