import { error, fail } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

/**
 * Obtiene la tasa BCV a través del Agente local (que está en Venezuela
 * y puede acceder a bcv.org.ve sin problemas de SSL/geo).
 * Usa la primera sucursal disponible como proxy para hacer la consulta.
 */
async function getBCVRateViaAgent(profile: any, fetchFn: typeof fetch): Promise<number | null> {
    const branches = profile.allowed_branches || [];
    
    // Intentamos con cada sucursal hasta obtener respuesta
    for (const branch of branches) {
        if (!branch.agent_url) continue;
        
        try {
            const agent = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, profile, fetchFn);
            
            const res = await agent.request<any>('/catalogos/bcv');
            
            if (res.success && res.tasa) {
                console.log(`[BCV] Tasa obtenida via agente ${branch.name}: ${res.tasa}`);
                return res.tasa;
            }
        } catch (e: any) {
            console.warn(`[BCV] Fallo al obtener tasa via ${branch.name}:`, e.message);
            continue; // Intentar con la siguiente sucursal
        }
    }
    
    console.warn('[BCV] No se pudo obtener la tasa desde ningún agente');
    return null;
}

export const load: PageServerLoad = async ({ locals, fetch }) => {
    const profile = locals.profile;
    if (!profile) throw error(401, 'No autorizado');

    const perms = profile.permissions?.['cash_exchange'];
    if (!perms?.read) throw error(403, 'No tienes permiso para ver esta sección');

    // Obtener tasa BCV via el agente local (en Venezuela)
    const bcvRate = await getBCVRateViaAgent(profile, fetch);
    const branches = profile.allowed_branches || [];
    
    // Obtener tasa actual de cada sucursal (la que tienen configurada en Profit)
    const branchRates = await Promise.all(
        branches.map(async (branch) => {
            try {
                if (!branch.agent_url) return { ...branch, currentRate: null, error: 'Sin URL de Agente' };
                
                const agent = new AgentClient({
                    slug: branch.id,
                    agent_url: branch.agent_url,
                    agent_api_key: branch.agent_token
                }, profile, fetch);
                
                const res = await agent.request<any>('/catalogos/tasa');
                const data = (res as any).data || (Array.isArray(res) ? res : []);
                
                return {
                    ...branch,
                    currentRate: data.length > 0 ? data[0].tasa : null
                };
            } catch (e) {
                return { ...branch, currentRate: null, error: 'Error de conexión' };
            }
        })
    );

    return {
        bcvRate,
        branchRates
    };
};

export const actions: Actions = {
    sync: async ({ request, locals, fetch }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'No autorizado' });

        const perms = profile.permissions?.['cash_exchange'];
        if (!perms?.update) return fail(403, { message: 'No tienes permiso para sincronizar la tasa' });

        const formData = await request.formData();
        const rate = parseFloat(formData.get('rate')?.toString() || '0');

        if (!rate || rate <= 0) {
            return fail(400, { message: 'Tasa inválida' });
        }

        const branches = profile.allowed_branches || [];
        const results = await Promise.all(
            branches.map(async (branch) => {
                try {
                    if (!branch.agent_url) return { branch: branch.name, success: false, message: 'No configurada' };
                    
                    const agent = new AgentClient({
                        slug: branch.id,
                        agent_url: branch.agent_url,
                        agent_api_key: branch.agent_token
                    }, profile, fetch);
                    
                    const res = await agent.updateTasa(rate);
                    if (res.success) {
                        await logAction({
                            uid: profile.id ?? null,
                            user_email: profile.email ?? 'system',
                            action: 'UPDATE',
                            module: 'cash_exchange',
                            record_id: 'BCV_RATE',
                            branch_id: branch.id,
                            new_data: { tasa: rate },
                            source: 'cloud'
                        });
                    }
                    return { branch: branch.name, success: res.success, message: res.message || (res.success ? 'Sincronizado' : 'Error') };
                } catch (e: any) {
                    return { branch: branch.name, success: false, message: e.message };
                }
            })
        );

        return {
            success: true,
            results
        };
    }
};
