import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_customers', async ({ locals, url }: { locals: any, url: URL }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    
    // Obtenemos la empresa activa del perfil cargado en locals
    const company = (locals as any).profile?.company;
    
    if (!company?.slug) {
        return {
            title: 'Clientes',
            customers: [],
            error: 'No se ha detectado una empresa activa en tu sesión.'
        };
    }

    const agent = new AgentClient(company);
    
    try {
        let response;
        if (search) {
            // Buscamos por descripción/nombre
            response = await agent.searchCustomers({ descripcion: search }, page, 20);
        } else {
            // Listado general
            response = await agent.getCustomers(page, 20);
        }

        return {
            title: 'Clientes',
            customers: response.success ? (response.data || []) : [],
            pagination: response.pagination,
            error: response.success ? null : response.message,
            search
        };
    } catch (err) {
        return {
            title: 'Clientes',
            customers: [],
            error: 'Error crítico al intentar conectar con el Agente de Datos.'
        };
    }
});

export const actions: Actions = {
    saveCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        const company = (locals as any).profile?.company;
        if (!company?.agent_url) return fail(400, { message: 'No hay una empresa activa o configurada' });

        const formData = await request.formData();
        const customerData = Object.fromEntries(formData);
        const isNew = formData.get('_isNew') === 'true';

        const agent = new AgentClient(company);
        const response = await agent.saveCustomer(customerData, isNew);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al guardar el cliente' });
        }

        return { success: true };
    }),

    deleteCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        const company = (locals as any).profile?.company;
        if (!company?.agent_url) return fail(400, { message: 'No hay una empresa activa o configurada' });

        const formData = await request.formData();
        const co_cli = formData.get('co_cli') as string;

        if (!co_cli) return fail(400, { message: 'Código de cliente no proporcionado' });

        const agent = new AgentClient(company);
        const response = await agent.deleteCustomer(co_cli);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al eliminar el cliente' });
        }

        return { success: true };
    })
};
