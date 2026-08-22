// src/routes/dashboard/purchases/suppliers/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { logAction } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_suppliers', async ({ locals, url, fetch }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    const urlBranchId = url.searchParams.get('branch_id');
    
    try {
        const profile = locals.profile;
        if (!profile) {
            console.error('[SUPPLIERS] Perfil no encontrado en locals. Redirigiendo...');
            return {
                status: 302,
                redirect: '/'
            };
        }

        // LÓGICA DE PERMISOS
        const canCreate = hasPermission(profile, 'pur_suppliers', 'create');
        const canUpdate = hasPermission(profile, 'pur_suppliers', 'update');
        const canDelete = hasPermission(profile, 'pur_suppliers', 'delete');

        // 1. Obtener todas las sucursales de Supabase
        let allBranches: any[] = [];
        const { data: dbBranches, error } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, profit_branch_codes, active, sort_order')
            .eq('active', true)
            .order('sort_order')
            .order('name');

        if (error) {
            console.error('[SUPPLIERS] Supabase branches error:', error.message);
        } else if (dbBranches) {
            allBranches = dbBranches.map(b => {
                let defaultCode = '';
                let isDefault = false;
                if (Array.isArray(b.profit_branch_codes) && b.profit_branch_codes.length > 0) {
                    const def = b.profit_branch_codes.find((c: any) => c.is_default);
                    if (def) {
                        defaultCode = def.code;
                        isDefault = true;
                    } else {
                        defaultCode = b.profit_branch_codes[0].code;
                    }
                }
                return {
                    id: b.id,
                    name: b.name,
                    agent_url: b.agent_url,
                    agent_token: b.agent_token,
                    profit_branch_code: defaultCode,
                    is_default: isDefault
                };
            });
        }

        // Filtrar sucursales según permisos del perfil
        const profileAllowed = profile?.allowed_branches || [];
        const profileBranchIds: string[] = Array.isArray(profileAllowed) 
            ? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
            : [];
            
        const isAdmin = profileBranchIds.length === 0;

        const allowedBranches = isAdmin
            ? allBranches
            : allBranches.filter(b => profileBranchIds.includes(b.id));

        if (allowedBranches.length === 0) {
            return {
                title: 'Proveedores',
                suppliers: [],
                error: 'No tienes sucursales asignadas. Contacta al administrador.',
                context: { branches: [] }
            };
        }

        // 2. Seleccionar sucursal activa
        const defaultBranch = allowedBranches.find(b => b.is_default);
        const selectedBranch = urlBranchId 
            ? allowedBranches.find(b => b.id === urlBranchId)
            : (defaultBranch || allowedBranches[0]);

        if (!selectedBranch || !selectedBranch.agent_url) {
            return {
                title: 'Proveedores',
                suppliers: [],
                error: 'La sucursal seleccionada no tiene un agente configurado.',
                context: { branches: allowedBranches }
            };
        }

        // 3. Inicializar AgentClient con datos de la sucursal
        const agentClient = new AgentClient({
            slug: selectedBranch.id,
            agent_url: selectedBranch.agent_url,
            agent_api_key: selectedBranch.agent_token
        }, profile, fetch);

        let suppliers: any[] = [];
        let resData: any = { success: true, data: { items: [] }, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
        let zonas: any[] = [];
        let tiposProveedor: any[] = [];
        let condicionesPago: any[] = [];

        try {
            if (search) {
                const cleanSearch = search.trim();
                const isRIF = /^[VEJGvejg]\d+(-?\d+)?$/i.test(cleanSearch.replace(/[-\s]/g, ''));
                
                let filters: any = {};
                if (isRIF) {
                    filters.rif = cleanSearch;
                    filters.co_prov = cleanSearch;
                } else {
                    filters.prov_des = cleanSearch;
                    filters.descripcion = cleanSearch;
                    filters.q = cleanSearch;
                }

                const res = await agentClient.searchSuppliers(filters, page, 20).catch(() => null);
                if (res && res.success) {
                    resData = res;
                    suppliers = res.data?.items || res.items || res.data || [];
                }
            } else {
                const res = await agentClient.getSuppliers(page, 20).catch(() => null);
                if (res && res.success) {
                    resData = res;
                    suppliers = res.data?.items || res.items || res.data || [];
                }
            }

            // Cargar zonas para el modal de proveedor
            const zonRes = await agentClient.getZonas().catch(() => null);
            if (zonRes && zonRes.success) {
                zonas = zonRes.data || [];
            }

            // Cargar tipos de proveedor para el modal
            const tpRes = await agentClient.getTiposProveedor().catch(() => null);
            if (tpRes && tpRes.success) {
                tiposProveedor = tpRes.data || [];
            }

            // Cargar condiciones de pago para el modal
            const condRes = await agentClient.getCondicionesPago().catch(() => null);
            if (condRes && condRes.success) {
                condicionesPago = condRes.data || [];
            }
        } catch (err) {
            console.warn('[SUPPLIERS] Safe SSR Load failed:', err);
        }

        return {
            title: 'Proveedores',
            suppliers,
            pagination: {
                total: resData.pagination?.total || 0,
                page: resData.pagination?.currentPage || resData.pagination?.page || page,
                limit: resData.pagination?.limit || 20,
                totalPages: resData.pagination?.pages || resData.pagination?.totalPages || 0
            },
            error: resData.success === false ? resData.message : null,
            search,
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            crud: {
                read: true,
                create: canCreate,
                update: canUpdate,
                delete: canDelete
            },
            context: {
                branchId: selectedBranch.id,
                branches: allowedBranches,
                zonas,
                tiposProveedor,
                condicionesPago
            }
        };
    } catch (err: any) {
        console.error('[SUPPLIERS] Load error:', err);
        return {
            title: 'Proveedores',
            suppliers: [],
            error: 'Error al conectar con la sucursal: ' + err.message,
            context: { branches: [] }
        };
    }
});

export const actions: Actions = {
    saveSupplier: protectAction('pur_suppliers', async ({ request, locals, fetch }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const isNew = formData.get('_isNew') === 'true';

        // VALIDACIÓN DINÁMICA DE PERMISOS
        if (isNew && !hasPermission(profile, 'pur_suppliers', 'create')) {
            return fail(403, { message: 'No tienes permiso para REGISTRAR nuevos proveedores.' });
        }
        if (!isNew && !hasPermission(profile, 'pur_suppliers', 'update')) {
            return fail(403, { message: 'No tienes permiso para ACTUALIZAR proveedores.' });
        }

        // 1. Determinar sucursales para Broadcast (todas las sucursales activas para consistencia de maestros)
        const { data: branchesData } = await supabaseAdmin.from('branches').select('*').eq('active', true);
        const targetBranches = branchesData || [];

        if (targetBranches.length === 0) {
            return fail(400, { message: 'No se encontraron sucursales activas.' });
        }

        const supplierData = Object.fromEntries(formData);
        const payload = {
            ...supplierData,
            prov_des: supplierData.prov_des || supplierData.descripcion,
            descripcion: supplierData.prov_des || supplierData.descripcion,
            co_prov: supplierData.co_prov || supplierData.rif,
            contribu_e: formData.has('contribu_e') || formData.has('contribuyente'),
            porc_esp: parseFloat(formData.get('porc_esp') as string) || 0
        };

        // 2. Ejecución del Broadcast
        let successCount = 0;
        let failedBranches: string[] = [];

        console.log(`[SAVE SUPPLIER BROADCAST] Iniciando ${isNew ? 'creación' : 'actualización'} en ${targetBranches.length} sedes...`);

        for (const branch of targetBranches) {
            if (!branch.agent_url) {
                failedBranches.push(`${branch.name || branch.id}: Sin URL de Agente`);
                continue;
            }

            try {
                let verifiedCoSucu = '';
                if (Array.isArray(branch.profit_branch_codes) && branch.profit_branch_codes.length > 0) {
                    const def = branch.profit_branch_codes.find((c: any) => c.is_default);
                    verifiedCoSucu = def ? def.code : branch.profit_branch_codes[0].code;
                }

                const agent = new AgentClient({
                    slug: branch.id,
                    agent_url: branch.agent_url,
                    agent_api_key: branch.agent_token
                }, profile, fetch);

                const response = await agent.saveSupplier(payload, isNew, verifiedCoSucu || branch.id);
                
                if (response.success) {
                    successCount++;
                } else {
                    const errorMsg = response.message || 'Error desconocido';
                    failedBranches.push(`${branch.name}: ${errorMsg}`);
                    console.warn(`[SAVE SUPPLIER] Fallo en sucursal ${branch.name}: ${errorMsg}`);
                }
            } catch (err: any) {
                failedBranches.push(`${branch.name}: Error de conexión (${err.message})`);
                console.error(`[SAVE SUPPLIER] Error de conexión con sucursal ${branch.name}:`, err.message);
            }
        }

        if (successCount === 0) {
            const detail = failedBranches.join(' | ');
            return fail(500, { 
                message: `No se pudo guardar en ninguna sede. Detalles: ${detail}` 
            });
        }

        // 3. Auditoría
        try {
            await logAction({
                uid:        profile.id ?? null,
                user_email: profile.email ?? 'system',
                action:     isNew ? 'CREATE' : 'UPDATE',
                module:     'PROVEEDORES',
                record_id:  payload.co_prov as string,
                branch_id:  targetBranches[0].id,
                old_data:   isNew ? null : { co_prov: payload.co_prov, broadcast: true, success_in: successCount, fails: failedBranches.length },
                new_data:   {
                    co_prov: payload.co_prov,
                    prov_des: payload.prov_des,
                    broadcast: true,
                    success_count: successCount,
                    failures: failedBranches
                },
                source: 'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de proveedor:', auditErr);
        }

        let finalMsg = isNew ? 'Proveedor creado' : 'Proveedor actualizado';
        if (failedBranches.length > 0) {
            finalMsg += ` en ${successCount} sedes, pero FALLÓ en: ${failedBranches.join(', ')}.`;
        } else {
            finalMsg += ` correctamente en todas las sedes (${successCount}).`;
        }

        return { 
            success: true, 
            message: finalMsg
        };
    }),

    deleteSupplier: protectAction('pur_suppliers', async ({ request, locals, fetch }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const co_prov = formData.get('co_prov') as string;
        const branchId = formData.get('branch_id') as string;
        const password = formData.get('password') as string;

        console.log(`[DELETE SUPPLIER] Attempting to delete supplier: ${co_prov}. Target Branch: ${branchId || 'BROADCAST'}`);

        if (!co_prov) return fail(400, { message: 'Código de proveedor no proporcionado' });
        if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar la eliminación.' });

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { message: 'Sesión no válida.' });

        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

        let targetBranches: any[] = [];
        const profileAllowed = profile.allowed_branches || [];
        const isAdmin = profileAllowed.length === 0;

        if (isAdmin) {
            const { data } = await supabaseAdmin.from('branches').select('*').eq('active', true);
            targetBranches = data || [];
        } else {
            targetBranches = profileAllowed;
        }

        if (targetBranches.length === 0) {
            return fail(403, { message: 'No tienes sucursales asignadas para realizar esta operación.' });
        }

        let successCount = 0;
        let failCount = 0;
        let lastErrorMessage = '';

        if (branchId) {
            const specific = targetBranches.find(b => b.id === branchId);
            if (specific) {
                targetBranches = [specific, ...targetBranches.filter(b => b.id !== branchId)];
            }
        }

        console.log(`[DELETE SUPPLIER BROADCAST] Iniciando eliminación en ${targetBranches.length} sedes...`);

        for (const branch of targetBranches) {
            if (!branch.agent_url) continue;

            try {
                const agent = new AgentClient({
                    slug: branch.id,
                    agent_url: branch.agent_url,
                    agent_api_key: branch.agent_token
                }, profile, fetch);

                const response = await agent.deleteSupplier(co_prov);
                
                if (response.success) {
                    successCount++;
                    console.log(`[DELETE SUPPLIER] Exito en sucursal: ${branch.name || branch.id}`);
                } else {
                    failCount++;
                    lastErrorMessage = response.message || 'Error desconocido';
                    console.warn(`[DELETE SUPPLIER] Fallo en sucursal ${branch.name}: ${lastErrorMessage}`);
                }
            } catch (err: any) {
                failCount++;
                console.error(`[DELETE SUPPLIER] Error de conexión con sucursal ${branch.name}:`, err.message);
            }
        }

        if (successCount === 0) {
            return fail(500, { 
                message: failCount > 0 
                    ? `No se pudo eliminar el proveedor en ninguna sede. Último error: ${lastErrorMessage}` 
                    : 'No se encontraron sedes activas para procesar la eliminación.' 
            });
        }

        try {
            await logAction({
                uid:        profile.id ?? null,
                user_email: profile.email ?? 'system',
                action:     'DELETE',
                module:     'PROVEEDORES',
                record_id:  co_prov,
                branch_id:  branchId || targetBranches[0].id,
                old_data:   { co_prov, broadcast: true, success_in: successCount, fails: failCount },
                new_data:   null,
                source:     'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de eliminación de proveedor:', auditErr);
        }

        const msg = failCount > 0 
            ? `Eliminado en ${successCount} sedes. Hubo errores en ${failCount} sedes.` 
            : 'Proveedor eliminado correctamente en todas las sedes autorizadas.';

        return { success: true, message: msg };
    })
};
