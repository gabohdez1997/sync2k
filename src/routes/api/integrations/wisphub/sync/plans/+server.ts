// src/routes/api/integrations/wisphub/sync/plans/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { getWisphubPlanes, type WisphubPlan } from '$lib/server/services/wisphub';
import { syncWisphubPlansToProfit } from '$lib/server/services/wisphubSync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { branch_id, plans: rawPlans } = body;

    // Resolver sucursal de destino en Profit Plus
    const allowedBranches = profile.allowed_branches || [];
    const targetBranch = branch_id
      ? allowedBranches.find((b: any) => b.id === branch_id)
      : (allowedBranches[0] || null);

    if (!targetBranch || !targetBranch.agent_url) {
      return json({
        success: false,
        message: 'No se encontró una sucursal con Agente Sync2K configurado para verificar artículos.'
      }, { status: 400 });
    }

    const agentClient = new AgentClient({
      slug: targetBranch.id,
      agent_url: targetBranch.agent_url,
      agent_api_key: targetBranch.agent_token
    }, profile, fetch);

    let plansToVerify: WisphubPlan[] = [];
    if (Array.isArray(rawPlans) && rawPlans.length > 0) {
      plansToVerify = rawPlans;
    } else {
      const pRes = await getWisphubPlanes();
      if (!pRes.success || !pRes.results) {
        return json({ success: false, message: pRes.error || 'No se pudieron obtener los planes de WispHub' }, { status: 400 });
      }
      plansToVerify = pRes.results;
    }

    const verification = await syncWisphubPlansToProfit(plansToVerify, agentClient);

    return json({
      success: true,
      mappings: verification.mappings,
      unlinkedCount: verification.unlinkedCount,
      totalPlans: plansToVerify.length,
      branch: {
        id: targetBranch.id,
        name: targetBranch.name
      }
    });
  } catch (err: any) {
    return json({
      success: false,
      message: `Error al sincronizar/verificar planes: ${err.message}`
    }, { status: 500 });
  }
};
