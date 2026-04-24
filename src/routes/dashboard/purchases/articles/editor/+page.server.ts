import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import { logAction } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('pur_articles', async ({ url, locals, fetch }) => {
    try {
        const articleId = url.searchParams.get('id');
        const branchId = url.searchParams.get('branch_id'); // Para saber de dónde leer el original

        // ─── 1. LOAD BRANCH FOR READING ────────────────────────────────
        const { data: dbBranches, error } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active')
            .eq('active', true);

        if (error || !dbBranches || dbBranches.length === 0) {
            return { error: 'No hay sucursales configuradas para cargar catálogos.' };
        }

        const readBranch = branchId 
            ? dbBranches.find(b => b.id === branchId) || dbBranches[0]
            : dbBranches[0];

        const agentClient = new AgentClient({
            slug: readBranch.id,
            agent_url: readBranch.agent_url,
            agent_api_key: readBranch.agent_token
        }, (locals as any).profile || undefined, fetch);

        // ─── 2. LOAD CATALOGS ──────────────────────────────────────────
        let lineas: any[] = [];
        let sublineas: any[] = [];
        let categorias: any[] = [];
        let unidades: any[] = [];
        let ubicaciones: any[] = [];

        try {
            const [linRes, subRes, catRes, uniRes, ubiRes] = await Promise.all([
                agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
                agentClient.request<any>('/catalogos/sublineas').catch(() => ({ data: [] })),
                agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] })),
                agentClient.request<any>('/catalogos/unidades').catch(() => ({ data: [] })),
                agentClient.request<any>('/ubicaciones').catch(() => ({ data: [] }))
            ]);

            lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
            sublineas = (subRes as any).data || (subRes as any).items || (Array.isArray(subRes) ? subRes : []);
            categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);
            unidades = (uniRes as any).data || (uniRes as any).items || (Array.isArray(uniRes) ? uniRes : []);
            ubicaciones = (ubiRes as any).data || (ubiRes as any).items || (Array.isArray(ubiRes) ? ubiRes : []);
        } catch (e) {
            console.error('[PUR_ARTICLES_EDITOR] Catalog fetch error:', e);
        }

        // ─── 3. LOAD ARTICLE IF EDITING ────────────────────────────────
        let article = null;
        if (articleId) {
            const artRes = await agentClient.request<any>(`/articulos/${encodeURIComponent(articleId)}`);
            if (artRes.success !== false) {
                article = (artRes as any).data || artRes;
            }
        }

        return {
            article,
            catalogs: {
                lineas,
                sublineas,
                categorias,
                unidades,
                ubicaciones
            }
        };

    } catch (e: any) {
        console.error('[PUR_ARTICLES_EDITOR] Fatal error:', e);
        return { error: `Error interno: ${e.message}` };
    }
});

export const actions: Actions = {
    default: protectAction('pur_articles', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        
        // Extraer datos generales
        const payload: any = {
            co_art: formData.get('co_art')?.toString().trim(),
            art_des: formData.get('art_des')?.toString().trim(),
            tipo: formData.get('tipo')?.toString() || 'V',
            co_lin: formData.get('co_lin')?.toString() || null,
            co_subl: formData.get('co_subl')?.toString() || null,
            co_cat: formData.get('co_cat')?.toString() || null,
            co_color: formData.get('co_color')?.toString() || null,
            co_ubicacion: formData.get('co_ubicacion')?.toString() || null,
            procedencia: formData.get('procedencia')?.toString() || 'N',
            modelo: formData.get('modelo')?.toString() || null,
            ref: formData.get('ref')?.toString() || null,
            
            // Datos Adicionales
            uni_venta: formData.get('co_uni')?.toString() || null,
            sSco_Uni: formData.get('sCo_Uni_Sec')?.toString() || null,
            bManeja_Serial: formData.get('bManeja_Serial') === 'on',
            bManeja_Lote: formData.get('bManeja_Lote') === 'on',
            tipo_imp: formData.get('tipo_imp')?.toString() || '1',
            peso: Number(formData.get('peso')) || 0,
            volumen: Number(formData.get('volumen')) || 0,
            
            // Comentarios
            comentario: formData.get('comentario')?.toString() || null,
            
            // Imagen base64 (Para enviar a BD Local en el futuro, o al agente si soporta)
            image_base64: formData.get('imageBase64')?.toString() || null,
        };

        // Extraer Márgenes
        payload.margenes = [];
        for (let i = 1; i <= 5; i++) {
            const margenVal = formData.get(`margen_${i}`);
            if (margenVal !== null) {
                payload.margenes.push({
                    tipo_precio: i.toString(),
                    porcentaje: Number(margenVal) || 0
                });
            }
        }

        if (!payload.co_art || !payload.art_des) {
            return fail(400, { error: 'El código y la descripción son obligatorios.' });
        }

        // ─── BROADCAST A TODAS LAS SUCURSALES ──────────────────────────────
        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active, profit_branch_codes')
            .eq('active', true);

        if (!dbBranches || dbBranches.length === 0) {
            return fail(500, { error: 'No hay sucursales configuradas para sincronizar.' });
        }

        const userProfile = locals.profile;
        const isNew = true; // Por ahora forzamos POST/PUT en el agente según exista o no
        
        const errors: string[] = [];
        let successCount = 0;

        for (const branch of dbBranches) {
            if (!branch.agent_url) continue;

            const agentClient = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, userProfile || undefined, fetch);

            try {
                // Enviar la petición PUT /articulos/:id con el payload completo
                // El agente debe encargarse de hacer Insert si no existe, o Update si existe.
                const endpoint = `/articulos/${encodeURIComponent(payload.co_art)}`;
                const res = await agentClient.request(endpoint, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });

                if ((res as any).success === false) {
                    errors.push(`[${branch.name}] ${(res as any).message || 'Error'}`);
                } else {
                    successCount++;
                }
            } catch (err: any) {
                errors.push(`[${branch.name}] Fallo de conexión: ${err.message}`);
            }
        }

        if (successCount === 0) {
            return fail(500, { error: 'Fallo al guardar en todas las sedes:\n' + errors.join('\n') });
        }

        // Auditoría
        await logAction({
            uid:          userProfile?.id ?? null,
            user_email:   userProfile?.email ?? 'system',
            action:       'UPSERT',
            module:       'pur_articles',
            record_id:    payload.co_art,
            branch_id:    'BROADCAST',
            new_data:     payload,
            source:       'cloud'
        });

        // Advertir si hubo fallos parciales
        if (errors.length > 0) {
            console.warn('[PUR_ARTICLES_BROADCAST] Fallos parciales:', errors);
            // Podríamos retornar un warning, pero SvelteKit form actions prefiere fail o éxito.
        }

        return { success: true, co_art: payload.co_art };
    })
};
