// src/routes/dashboard/sales/customers/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_customers', async ({ locals, url }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    const urlBranchId = url.searchParams.get('branch_id');
    
    try {
        const profile = locals.profile;
        if (!profile) throw new Error('Perfil no cargado.');

        // 1. Obtener sucursales autorizadas del perfil (ya vienen de Supabase)
        const allowedBranches = profile.allowed_branches || [];
        
        if (allowedBranches.length === 0) {
            return {
                title: 'Clientes',
                customers: [],
                error: 'No tienes sucursales asignadas. Contacta al administrador.',
                context: { branches: [] }
            };
        }

        // 2. Seleccionar sucursal activa
        const selectedBranch = urlBranchId 
            ? allowedBranches.find(b => b.id === urlBranchId)
            : allowedBranches[0];

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
        
        // Buscar la sucursal en el perfil del usuario
        const branch = profile.allowed_branches.find(b => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida o sin agente configurado' });
        }

        const agent = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile);

        const customerData = Object.fromEntries(formData);
        const isNew = formData.get('_isNew') === 'true';

        // Cast boolean values
        const payload = {
            ...customerData,
            contribuyente: formData.has('contribuyente'),
            contribu_e: formData.has('contribu_e') || formData.has('contribuu_e'),
            porc_esp: parseFloat(formData.get('porc_esp') as string) || 0
        };

        const response = await agent.saveCustomer(payload, isNew, branch.profit_branch_code || branch.id);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al guardar el cliente' });
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

        if (!co_cli) return fail(400, { message: 'Código de cliente no proporcionado' });

        const branch = profile.allowed_branches.find(b => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida' });
        }

        const agent = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile);

        const response = await agent.deleteCustomer(co_cli);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al eliminar el cliente' });
        }

        return { success: true, message: 'Cliente eliminado correctamente.' };
    })
};
