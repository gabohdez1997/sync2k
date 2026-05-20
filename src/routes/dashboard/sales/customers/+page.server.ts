// src/routes/dashboard/sales/customers/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { logAction } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_customers', async ({ locals, url, fetch }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    const urlBranchId = url.searchParams.get('branch_id');
    
    try {
        const profile = locals.profile;
        if (!profile) {
            console.error('[CUSTOMERS] Perfil no encontrado en locals. Redirigiendo...');
            return {
                status: 302,
                redirect: '/'
            };
        }

        // LÓGICA DE PERMISOS
        const canCreate = hasPermission(profile, 'sales_customers', 'create');
        const canUpdate = hasPermission(profile, 'sales_customers', 'update');
        const canDelete = hasPermission(profile, 'sales_customers', 'delete');

		// 1. Obtener todas las sucursales de Supabase
		let allBranches: any[] = [];
		const { data: dbBranches, error } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token, profit_branch_codes, active, sort_order')
			.eq('active', true)
			.order('sort_order')
			.order('name');

		if (error) {
			console.error('[CUSTOMERS] Supabase branches error:', error.message);
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
                title: 'Clientes',
                customers: [],
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
                title: 'Clientes',
                customers: [],
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

        // LÓGICA DE PRIVACIDAD: Si no puede ver terceros, forzar filtro por su vendedor
        const canSeeOthers = hasPermission(profile, 'sales_customers', 'others');
        let co_ven_filter = '';
        if (!canSeeOthers) {
            co_ven_filter = (profile.profit_user || '').trim().toUpperCase();
            if (!co_ven_filter) {
                return {
                    title: 'Clientes', customers: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
                    error: 'Tu perfil no tiene asociado un código de Vendedor. No puedes visualizar clientes.',
                    branches: allowedBranches, selectedBranchId: selectedBranch.id,
                    crud: { read: true, create: canCreate, update: canUpdate, delete: canDelete }
                };
            }
        }

        let customers: any[] = [];
        let resData: any = { success: true, data: { items: [] }, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
        let zonas: any[] = [];
        let tiposCliente: any[] = [];

        try {
            // Solo consultamos al agente si no estamos en un proceso de redirección o similar
            // Y capturamos errores para no romper el SSR si el agente está offline
            if (search) {
                // Mapeo refinado: No enviar todos a la vez para evitar colisiones AND en el agente
                const cleanSearch = search.trim();
                const isRIF = /^[VEJGvejg]\d+(-?\d+)?$/i.test(cleanSearch.replace(/[-\s]/g, ''));
                
                let filters: any = {};
                if (isRIF) {
                    filters.rif = cleanSearch;
                    filters.co_cli = cleanSearch;
                } else {
                    // Si no es RIF, enviamos por múltiples parámetros comunes para asegurar match
                    filters.cli_des = cleanSearch;
                    filters.descripcion = cleanSearch;
                    filters.q = cleanSearch; // Parámetro universal de búsqueda
                }

                // Inyectamos el filtro de vendedor si existe restricción
                if (co_ven_filter) filters.co_ven = co_ven_filter;

                const res = await agentClient.searchCustomers(filters, page, 20).catch(() => null);
                if (res && res.success) {
                    resData = res;
                    customers = res.data?.items || res.items || res.data || [];
                }
            } else {
                let filters: any = {};
                if (co_ven_filter) filters.co_ven = co_ven_filter;

                // getCustomers no soporta filtros directo en el nombre, usamos searchCustomers con co_ven si hay restricción
                const res = co_ven_filter
                    ? await agentClient.searchCustomers(filters, page, 20).catch(() => null)
                    : await agentClient.getCustomers(page, 20).catch(() => null);

                if (res && res.success) {
                    resData = res;
                    customers = res.data?.items || res.items || res.data || [];
                }
            }

            // También cargar zonas para el modal de cliente
            const zonRes = await agentClient.getZonas().catch(() => null);
            if (zonRes && zonRes.success) {
                zonas = zonRes.data || [];
            }

            // También cargar tipos de cliente para el modal de cliente
            const tcRes = await agentClient.getTiposCliente().catch(() => null);
            if (tcRes && tcRes.success) {
                tiposCliente = tcRes.data || [];
            }
        } catch (err) {
            console.warn('[CUSTOMERS] Safe SSR Load failed:', err);
        }

        // Extraer permisos CRUD del usuario para esta sección
        const crud = profile.permissions?.['sales_customers'] || { read: true, create: false, update: false, delete: false };

        return {
            title: 'Clientes',
            customers,
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
                tiposCliente
            }
        };
    } catch (err: any) {
        console.error('[CUSTOMERS] Load error:', err);
        return {
            title: 'Clientes',
            customers: [],
            error: 'Error al conectar con la sucursal: ' + err.message,
            context: { branches: [] }
        };
    }
});

export const actions: Actions = {
    saveCustomer: protectAction('sales_customers', async ({ request, locals, fetch }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const isNew = formData.get('_isNew') === 'true';

        // VALIDACIÓN DINÁMICA DE PERMISOS
        if (isNew && !hasPermission(profile, 'sales_customers', 'create')) {
          return fail(403, { message: 'No tienes permiso para REGISTRAR nuevos clientes.' });
        }
        if (!isNew && !hasPermission(profile, 'sales_customers', 'update')) {
          return fail(403, { message: 'No tienes permiso para ACTUALIZAR clientes.' });
        }
        // 1. Determinar sucursales para Broadcast
        let targetBranches: any[] = [];
        const profileAllowed = profile.allowed_branches || [];
        const isAdmin = !profileAllowed || profileAllowed.length === 0;

        if (isAdmin) {
            const { data } = await supabaseAdmin.from('branches').select('*').eq('active', true);
            targetBranches = data || [];
        } else {
            // Asegurarnos de tener los datos completos de las sucursales (url, token, etc)
            const allowedIds = profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b));
            const { data } = await supabaseAdmin.from('branches').select('*').in('id', allowedIds).eq('active', true);
            targetBranches = data || [];
        }

        if (targetBranches.length === 0) {
            return fail(400, { message: 'No se encontraron sucursales activas autorizadas.' });
        }

        const customerData = Object.fromEntries(formData);
        const payload = {
            ...customerData,
            contribuyente: formData.has('contribuyente'),
            contribu_e: formData.has('contribu_e') || formData.has('contribuu_e'),
            porc_esp: parseFloat(formData.get('porc_esp') as string) || 0
        };

        // 2. Ejecución del Broadcast
        let successCount = 0;
        let failedBranches: string[] = [];
        let lastErrorMessage = '';

        console.log(`[SAVE BROADCAST] Iniciando ${isNew ? 'creación' : 'actualización'} en ${targetBranches.length} sedes...`);

        for (const branch of targetBranches) {
            if (!branch.agent_url) {
                failedBranches.push(`${branch.name || branch.id}: Sin URL de Agente`);
                continue;
            }

            try {
                // Determinar el co_sucu verificado para esta sede
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

                const response = await agent.saveCustomer(payload, isNew, verifiedCoSucu || branch.id);
                
                if (response.success) {
                    successCount++;
                } else {
                    const errorMsg = response.message || 'Error desconocido';
                    failedBranches.push(`${branch.name}: ${errorMsg}`);
                    console.warn(`[SAVE] Fallo en sucursal ${branch.name}: ${errorMsg}`);
                }
            } catch (err: any) {
                failedBranches.push(`${branch.name}: Error de conexión (${err.message})`);
                console.error(`[SAVE] Error de conexión con sucursal ${branch.name}:`, err.message);
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
                module:     'CLIENTES',
                record_id:  payload.co_cli as string,
                branch_id:  targetBranches[0].id,
                old_data:   isNew ? null : { co_cli: payload.co_cli, broadcast: true, success_in: successCount, fails: failedBranches.length },
                new_data:   {
                    co_cli: payload.co_cli,
                    cli_des: payload.cli_des || payload.descripcion,
                    broadcast: true,
                    success_count: successCount,
                    failures: failedBranches
                },
                source: 'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de cliente:', auditErr);
        }

        let finalMsg = isNew ? 'Cliente creado' : 'Cliente actualizado';
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

    deleteCustomer: protectAction('sales_customers', async ({ request, locals, fetch }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const co_cli = formData.get('co_cli') as string;
        const branchId = formData.get('branch_id') as string;
        const password = formData.get('password') as string;

        console.log(`[DELETE CUSTOMER] Attempting to delete client: ${co_cli}. Target Branch: ${branchId || 'BROADCAST'}`);

        if (!co_cli) return fail(400, { message: 'Código de cliente no proporcionado' });
        if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar la eliminación.' });

        // 1. Verificar contraseña del usuario con su propio cliente de sesión
        // IMPORTANTE: Usar locals.supabase en vez de supabaseAdmin para no invalidar la sesión actual.
        const email = locals.session?.user?.email;
        if (!email) return fail(401, { message: 'Sesión no válida.' });

        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

        // 2. Determinar sucursales a las que se enviará la eliminación
        // Si hay una sucursal seleccionada, empezamos por esa. 
        // Si no, o como fallback/broadcast, usamos todas las permitidas.
        let targetBranches: any[] = [];
        
        const profileAllowed = profile.allowed_branches || [];
        const isAdmin = profileAllowed.length === 0; // En este sistema, perfil sin sucursales explícitas = admin global

        if (isAdmin) {
            // Si es admin, obtenemos todas las activas de la DB
            const { data } = await supabaseAdmin.from('branches').select('*').eq('active', true);
            targetBranches = data || [];
        } else {
            targetBranches = profileAllowed;
        }

        if (targetBranches.length === 0) {
            return fail(403, { message: 'No tienes sucursales asignadas para realizar esta operación.' });
        }

        // 3. Ejecución de la eliminación (Broadcast)
        let successCount = 0;
        let failCount = 0;
        let lastErrorMessage = '';

        // Si el usuario especificó una sucursal, la ponemos primero en la lista
        if (branchId) {
            const specific = targetBranches.find(b => b.id === branchId);
            if (specific) {
                targetBranches = [specific, ...targetBranches.filter(b => b.id !== branchId)];
            }
        }

        console.log(`[DELETE BROADCAST] Inicianado eliminación en ${targetBranches.length} sedes...`);

        for (const branch of targetBranches) {
            if (!branch.agent_url) continue;

            try {
                const agent = new AgentClient({
                    slug: branch.id,
                    agent_url: branch.agent_url,
                    agent_api_key: branch.agent_token
                }, profile, fetch);

                const response = await agent.deleteCustomer(co_cli);
                
                if (response.success) {
                    successCount++;
                    console.log(`[DELETE] Exito en sucursal: ${branch.name || branch.id}`);
                } else {
                    failCount++;
                    lastErrorMessage = response.message || 'Error desconocido';
                    console.warn(`[DELETE] Fallo en sucursal ${branch.name}: ${lastErrorMessage}`);
                }
            } catch (err: any) {
                failCount++;
                console.error(`[DELETE] Error de conexión con sucursal ${branch.name}:`, err.message);
            }
        }

        if (successCount === 0) {
            return fail(500, { 
                message: failCount > 0 
                    ? `No se pudo eliminar el cliente en ninguna sede. Último error: ${lastErrorMessage}` 
                    : 'No se encontraron sedes activas para procesar la eliminación.' 
            });
        }

        // 4. Auditoría (solo un registro general del broadcast)
        try {
            await logAction({
                uid:        profile.id ?? null,
                user_email: profile.email ?? 'system',
                action:     'DELETE',
                module:     'CLIENTES',
                record_id:  co_cli,
                branch_id:  branchId || targetBranches[0].id,
                old_data:   { co_cli, broadcast: true, success_in: successCount, fails: failCount },
                new_data:   null,
                source:     'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de eliminación:', auditErr);
        }

        const msg = failCount > 0 
            ? `Eliminado en ${successCount} sedes. Hubo errores en ${failCount} sedes.` 
            : 'Cliente eliminado correctamente en todas las sedes autorizadas.';

        return { success: true, message: msg };
    })
};
