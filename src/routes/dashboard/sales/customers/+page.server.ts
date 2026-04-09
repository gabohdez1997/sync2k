// src/routes/dashboard/sales/customers/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { logAction } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_customers', async ({ locals, url }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    const urlBranchId = url.searchParams.get('branch_id');
    
    try {
        const profile = locals.profile;
        if (!profile) throw new Error('Perfil no cargado.');

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
            slug: selectedBranch.id, // Usamos el ID de la sucursal como slug
            agent_url: selectedBranch.agent_url,
            agent_api_key: selectedBranch.agent_token
        }, profile);

        // 4. Fetch Customers
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '20');
        if (search) params.set('descripcion', search);
        
        params.set('sede_id', selectedBranch.id);
        params.set('sede', selectedBranch.profit_branch_code || selectedBranch.id);

        const endpoint = search ? `/clientes/search?${params.toString()}` : `/clientes?${params.toString()}`;
        const resData = await agentClient.request<any>(endpoint);
        
        const customers = resData.data?.items || resData.items || resData.data || (Array.isArray(resData) ? resData : []);

        // 5. Fetch Zonas
        let zonas: any[] = [];
        try {
            const zonRes = await agentClient.getZonas().catch(() => null);
            zonas = (zonRes as any)?.data || (zonRes as any)?.items || (Array.isArray(zonRes) ? zonRes : []);
        } catch (e) {}

        return {
            title: 'Clientes',
            customers: Array.isArray(customers) ? customers : [],
            pagination: resData.pagination,
            error: resData.success === false ? resData.message : null,
            search,
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            context: {
                branchId: selectedBranch.id,
                branches: allowedBranches,
                zonas
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
    saveCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        
        // Permisos
		const isAdmin = !profile.allowed_branches || profile.allowed_branches.length === 0;
		if (!isAdmin) {
			const allowedBranchIds = (profile.allowed_branches as any[]).map(b => typeof b === 'object' ? b.id : b);
			if (!allowedBranchIds.includes(branchId)) {
				return fail(403, { message: 'No tienes permiso para operar en esta sucursal.' });
			}
		}

        // Fetch branch
        const { data: dbBranch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, profit_branch_codes')
            .eq('id', branchId)
            .single();

        if (branchErr || !dbBranch?.agent_url) {
            return fail(400, { message: 'Sucursal no válida o sin agente configurado' });
        }

        // Parse profit_branch_codes
        let verifiedCoSucu = '';
        if (Array.isArray(dbBranch.profit_branch_codes) && dbBranch.profit_branch_codes.length > 0) {
            const def = dbBranch.profit_branch_codes.find((c: any) => c.is_default);
            verifiedCoSucu = def ? def.code : dbBranch.profit_branch_codes[0].code;
        }

        const agent = new AgentClient({
            slug: dbBranch.id,
            agent_url: dbBranch.agent_url as string,
            agent_api_key: dbBranch.agent_token
        }, profile);

        const customerData = Object.fromEntries(formData);
        const isNew = formData.get('_isNew') === 'true';

        const payload = {
            ...customerData,
            contribuyente: formData.has('contribuyente'),
            contribu_e: formData.has('contribu_e') || formData.has('contribuu_e'),
            porc_esp: parseFloat(formData.get('porc_esp') as string) || 0
        };

        const response = await agent.saveCustomer(payload, isNew, verifiedCoSucu || dbBranch.id);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al guardar el cliente' });
        }

        // Auditoría
        try {
            await logAction({
                uid:        profile.id ?? null,
                user_email: profile.email ?? 'system',
                action:     isNew ? 'CREATE' : 'UPDATE',
                module:     'sales_customers',
                record_id:  payload.co_cli as string,
                branch_id:  branchId,
                old_data:   isNew ? null : { co_cli: payload.co_cli, note: 'Datos anteriores no capturados' },
                new_data:   {
                    co_cli: payload.co_cli,
                    cli_des: payload.cli_des || payload.descripcion,
                    rif: payload.rif,
                    telefonos: payload.telefonos,
                    email: payload.email,
                    direc1: payload.direc1,
                    co_zon: payload.co_zon
                },
                source: 'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de cliente:', auditErr);
        }

        return { 
            success: true, 
            message: isNew ? 'Cliente creado correctamente.' : 'Cliente actualizado correctamente.'
        };
    }),

    deleteCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        const profile = locals.profile;
        if (!profile) return fail(401, { message: 'Sesión expirada' });

        const formData = await request.formData();
        const co_cli = formData.get('co_cli') as string;
        const branchId = formData.get('branch_id') as string;
        const password = formData.get('password') as string;

        if (!co_cli) return fail(400, { message: 'Código de cliente no proporcionado' });
        if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar la eliminación.' });

        // 1. Verificar contraseña del usuario con Supabase Auth
        const email = locals.session?.user?.email;
        if (!email) return fail(401, { message: 'Sesión no válida.' });

        const { error: authErr } = await supabaseAdmin.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

        // 2. Permisos de sucursal
		const isAdmin = !profile.allowed_branches || profile.allowed_branches.length === 0;
		if (!isAdmin) {
			const allowedBranchIds = (profile.allowed_branches as any[]).map(b => typeof b === 'object' ? b.id : b);
			if (!allowedBranchIds.includes(branchId)) {
				return fail(403, { message: 'No tienes permiso para operar en esta sucursal.' });
			}
		}

        // 3. Obtener datos de la sucursal para el Agente
        const { data: dbBranch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, profit_branch_codes')
            .eq('id', branchId)
            .single();

        if (branchErr || !dbBranch?.agent_url) {
            return fail(400, { message: 'Sucursal no válida' });
        }

        const agent = new AgentClient({
            slug: dbBranch.id,
            agent_url: dbBranch.agent_url as string,
            agent_api_key: dbBranch.agent_token
        }, profile);

        const response = await agent.deleteCustomer(co_cli);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al eliminar el cliente' });
        }

        // Auditoría
        try {
            await logAction({
                uid:        profile.id ?? null,
                user_email: profile.email ?? 'system',
                action:     'DELETE',
                module:     'sales_customers',
                record_id:  co_cli,
                branch_id:  branchId,
                old_data:   { co_cli },
                new_data:   null,
                source:     'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de eliminación:', auditErr);
        }

        return { success: true, message: 'Cliente eliminado correctamente.' };
    })
};
