import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_customers', async ({ locals, url }: { locals: any, url: URL }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    
    try {
        const userProfile = (locals as any).profile;

        // ─── 1. LOAD ALL TENANTS FROM FIRESTORE ─────────────────────────────────
        let allTenants: any[] = [];
        let companyInfo: any = null;
        const urlTenant = url.searchParams.get('tenant_id');

        try {
            const { adminDb, MasterCollections } = await import('$lib/server/firebase-admin');
            const snap = await adminDb!.collection(MasterCollections.CONNECTIONS).get();
            const rawTenants = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    name: d.name || doc.id,
                    slug: d.slug || doc.id,
                    agent_url: d.agent_url,
                    agent_api_key: d.agent_api_key
                };
            });

            const profileSlug = userProfile?.company?.slug;

            if (profileSlug) {
                // SUBDOMAIN MODE
                companyInfo = rawTenants.find(t => t.id === profileSlug || t.slug === profileSlug);
                allTenants = companyInfo ? [companyInfo] : [];
            } else {
                // GLOBAL MODE (Admin)
                allTenants = rawTenants;
                const targetId = urlTenant;
                if (targetId) {
                    companyInfo = allTenants.find(t => t.id === targetId || t.slug === targetId);
                }
                if (!companyInfo && allTenants.length === 1) {
                    companyInfo = allTenants[0];
                }
            }
        } catch (e) {
            console.error('[CUSTOMERS] Firestore error:', e);
        }

        if (!companyInfo?.agent_url) {
            return {
                title: 'Clientes',
                customers: [],
                tenants: allTenants,
                context: null,
                requireTenantSelection: true,
                error: 'Selecciona una empresa para continuar.'
            };
        }

        // ─── 2. INIT AGENT CLIENT ────────────────────────────────────────────────
        const agentClient = new AgentClient({
            slug: companyInfo.slug,
            agent_url: companyInfo.agent_url,
            agent_api_key: companyInfo.agent_api_key
        }, locals.profile);

        // ─── 3. LOAD CATALOGS IN PARALLEL ───────────────────────────────────────
        let configServers: any[] = [];

        try {
            const configRes = await agentClient.getDatabaseConfig().catch(() => null);
            const configAny = configRes as any;
            configServers = configAny?.data?.servers || configAny?.servers || (Array.isArray(configAny) ? configAny : []);
        } catch (e) {
            console.error('[CUSTOMERS] Catalog fetch error:', e);
        }

        // ─── 4. BUILD BRANCH MAPS ───────────────────────────────────
        const profileBranches: string[] = userProfile?.allowed_branches || [];
        const isAdmin = profileBranches.length === 0;

        let firestoreBranches: any[] = [];
        const effectiveCompanyId = companyInfo?.id || companyInfo?.slug || urlTenant || '';
        
        let adminDbModule;
        try { adminDbModule = await import('$lib/server/firebase-admin'); } catch(e){}
        if (effectiveCompanyId && adminDbModule?.adminDb) {
            try {
                const fbSnap = await adminDbModule.adminDb.collection(adminDbModule.MasterCollections.CONNECTIONS)
                    .doc(effectiveCompanyId)
                    .collection('branches')
                    .get();
                firestoreBranches = fbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (err: any) {}
        }

        let allBranches = configServers.map((s: any) => {
            const fsConfig = firestoreBranches.find(fb => fb.id === s.id) || 
                             firestoreBranches.find(fb => fb.name?.trim().toLowerCase() === (s.name || s.nombre)?.trim().toLowerCase());
            const mappedCode = fsConfig?.co_sucur || fsConfig?.co_sucu || fsConfig?.co_sede || fsConfig?.sucursal || s.co_sucur || s.co_sucu || s.sucursal || '';
            return {
                id: s.id,
                name: s.name || s.nombre || s.description || s.id,
                is_default: fsConfig?.is_default || !!s.is_default || false,
                co_sucu: mappedCode
            };
        });

        const allowedBranches = isAdmin
            ? allBranches
            : allBranches.filter(b => profileBranches.includes(b.id));

        const urlBranchId = url.searchParams.get('branch_id');
        const defaultBranch = allowedBranches.find(b => b.is_default);
        
        const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId))
            ? urlBranchId
            : (defaultBranch?.id || allowedBranches[0]?.id || '');

        let selectedBranchObj = allowedBranches.find(b => b.id === branchId);

        // ─── 6. FETCH CUSTOMERS ───────────────────────────────────────────────────
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '20');

        let endpoint: string;
        if (search) {
            params.set('descripcion', search);
            if (branchId) {
                params.set('sede_id', branchId);
                params.set('sede', branchId);
            }
            endpoint = `/clientes/search?${params.toString()}`;
        } else {
            if (branchId) {
                params.set('sede_id', branchId);
                params.set('sede', branchId);
            }
            endpoint = `/clientes?${params.toString()}`;
        }

        const resData = await agentClient.request<any>(endpoint);
        const customers = (resData as any).data?.items || (resData as any).items || (resData as any).data || (Array.isArray(resData) ? resData : []);

        // ─── 7. FETCH ZONAS CATALOG ─────────────────────────────────────────────
        let zonas: any[] = [];
        try {
            const zonRes = await agentClient.getZonas().catch(() => null);
            const zonAny = zonRes as any;
            zonas = zonAny?.data || zonAny?.items || (Array.isArray(zonAny) ? zonAny : []);
        } catch (e) {
            console.error('[CUSTOMERS] Zonas fetch error:', e);
        }

        const context = {
            tenantId: companyInfo.id,
            branchId,
            branches: allowedBranches,
            finalBranchIds: allowedBranches.map(b => b.id),
            zonas
        };

        console.log('[CUSTOMERS LOAD] resData parsed pagination:', (resData as any).pagination);

        return {
            title: 'Clientes',
            customers: Array.isArray(customers) ? customers : [],
            pagination: (resData as any).pagination,
            error: (resData as any).success === false ? (resData as any).message : null,
            search,
            tenants: allTenants,
            context,
            requireTenantSelection: false
        };
    } catch (err) {
        console.error('[CUSTOMERS] Fatal load error:', err);
        return {
            title: 'Clientes',
            customers: [],
            tenants: [],
            context: null,
            requireTenantSelection: false,
            error: 'Error crítico al procesar la lista de clientes.'
        };
    }
});

export const actions: Actions = {
    saveCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        let company = (locals as any).profile?.company;
        const formData = await request.formData();
        const tenant_id = formData.get('tenant_id') as string;

        if (!company?.agent_url && tenant_id) {
            try {
                const { adminDb, MasterCollections } = await import('$lib/server/firebase-admin');
                const doc = await adminDb!.collection(MasterCollections.CONNECTIONS).doc(tenant_id).get();
                if (doc.exists) {
                    const data = doc.data();
                    company = {
                        slug: data?.slug || tenant_id,
                        agent_url: data?.agent_url,
                        agent_api_key: data?.agent_api_key
                    };
                }
            } catch (e) {
                console.error('[CUSTOMERS ACTION] Error fetching company from Firestore:', e);
            }
        }

        if (!company?.agent_url) {
            return fail(400, { message: 'No hay una empresa activa o configurada' });
        }

        const customerData = Object.fromEntries(formData);
        const isNew = formData.get('_isNew') === 'true';
        const branch_id = (formData.get('branch_id') as string) || '';

        // Las checkboxes HTML solo envian valor cuando estan marcadas;
        // cuando no estan marcadas no aparecen en el FormData.
        const contribuyente = formData.has('contribuyente');
        const contribu_e    = formData.has('contribuu_e') || formData.has('contribu_e');

        // Cast numeric and boolean fields for Agent
        const payload = {
            ...customerData,
            branch_id,
            contribuyente,
            contribu_e,
            porc_esp: parseFloat(formData.get('porc_esp') as string) || 0
        };

        const agent = new AgentClient(company, (locals as any).profile);

        // DEBUG: verificar que profit_user llega al agente
        const dbgProfile = (locals as any).profile;
        console.log('[SAVE CUSTOMER] profit_user del perfil:', dbgProfile?.profit_user);
        console.log('[SAVE CUSTOMER] profit_pass del perfil:', dbgProfile?.profit_pass ? '***' : 'NULL/VACIO');
        console.log('[SAVE CUSTOMER] isNew:', isNew, '| branch_id:', branch_id);

        const response = await agent.saveCustomer(payload, isNew, branch_id);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al guardar el cliente' });
        }

        // Process per-branch results
        const results = (response as any).results || [];
        const successSedes = results.filter((r: any) => r.success).map((r: any) => r.sede_nombre || r.sede_id);
        const failureSedes = results.filter((r: any) => !r.success).map((r: any) => `${r.sede_nombre || r.sede_id}: ${r.error}`);

        let message = isNew ? 'Cliente creado exitosamente.' : 'Cliente actualizado exitosamente.';
        if (successSedes.length > 0) {
            message += ` Registrado en: ${successSedes.join(', ')}.`;
        }
        if (failureSedes.length > 0) {
            message += ` Fallas en: ${failureSedes.join(', ')}.`;
        }

        return { 
            success: true, 
            message,
            branches: results 
        };
    }),

    deleteCustomer: protectAction('sales_customers', async ({ request, locals }) => {
        let company = (locals as any).profile?.company;
        const formData = await request.formData();
        const tenant_id = formData.get('tenant_id') as string;
        const co_cli = formData.get('co_cli') as string;

        if (!co_cli) return fail(400, { message: 'Código de cliente no proporcionado' });

        if (!company?.agent_url && tenant_id) {
            try {
                const { adminDb, MasterCollections } = await import('$lib/server/firebase-admin');
                const doc = await adminDb!.collection(MasterCollections.CONNECTIONS).doc(tenant_id).get();
                if (doc.exists) {
                    const data = doc.data();
                    company = {
                        slug: data?.slug || tenant_id,
                        agent_url: data?.agent_url,
                        agent_api_key: data?.agent_api_key
                    };
                }
            } catch (e) {
                console.error('[CUSTOMERS ACTION] Error fetching company from Firestore:', e);
            }
        }

        if (!company?.agent_url) return fail(400, { message: 'No hay una empresa activa o configurada' });

        const agent = new AgentClient(company, (locals as any).profile);
        const response = await agent.deleteCustomer(co_cli);

        if (!response.success) {
            return fail(500, { message: response.message || 'Error al eliminar el cliente' });
        }

        return { success: true, message: 'Cliente eliminado correctamente de todas las sedes.' };
    })
};

