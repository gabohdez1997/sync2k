// src/routes/api/integrations/wisphub/sync/customers/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { getWisphubClientes, getWisphubCliente, type WisphubClient } from '$lib/server/services/wisphub';
import { syncBatchWisphubCustomers, syncWisphubCustomerToProfit } from '$lib/server/services/wisphubSync';
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
      const listRes = await getWisphubClientes({ limit: 50, estado: '1' });
      if (!listRes.success || !listRes.results) {
        return json({ success: false, message: listRes.error || 'No se pudieron consultar clientes de WispHub' }, { status: 400 });
      }
      clientsToSync = listRes.results;
    }

    const syncOptions = {
      sedeId: targetBranch.profit_server_id || targetBranch.id,
      default_zone: options.default_zone || '01',
      default_client_type: options.default_client_type || '01',
      overwrite_existing: options.overwrite_existing ?? true
    };

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
        branch_name: targetBranch.name
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
