// src/routes/dashboard/audit/+page.server.ts
// Migrado de Firestore → Supabase (tabla audit_log)

import { protectLoad } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_audit', async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = 50;
  const search = url.searchParams.get('search') || '';
  const branchId = url.searchParams.get('branch_id') || '';
  const action = url.searchParams.get('action') || '';
  const startDate = url.searchParams.get('startDate') || '';
  const endDate = url.searchParams.get('endDate') || '';

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('audit_log')
    .select(`
      id, action, module, record_id,
      user_email, source, created_at,
      old_data, new_data, metadata,
      branch_id, branches(name)
    `, { count: 'exact' });

  // All filters server-side
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  if (action) {
    query = query.eq('action', action);
  }
  if (startDate) {
    query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
  }
  if (search) {
    const cleanSearch = search.trim().toLowerCase();
    const orParts = [
      `user_email.ilike.%${search}%`,
      `module.ilike.%${search}%`,
      `action.ilike.%${search}%`,
      `record_id.ilike.%${search}%`
    ];

    // Mapeo inteligente de términos comunes en español a slugs del sistema en inglés
    if (cleanSearch.includes('tasa') || cleanSearch.includes('cambio') || cleanSearch.includes('bcv') || cleanSearch.includes('dolar') || cleanSearch.includes('usd')) {
      orParts.push(`module.eq.cash_exchange`);
    }
    if (cleanSearch.includes('articulo') || cleanSearch.includes('producto')) {
      orParts.push(`module.eq.pur_articles`);
    }
    if (cleanSearch.includes('proveedor')) {
      orParts.push(`module.eq.pur_suppliers`);
      orParts.push(`module.eq.PROVEEDORES`);
    }
    if (cleanSearch.includes('compra') || cleanSearch.includes('orden')) {
      orParts.push(`module.eq.pur_orders`);
      orParts.push(`module.eq.ORDENES_COMPRA`);
    }
    if (cleanSearch.includes('cliente')) {
      orParts.push(`module.eq.sales_customers`);
      orParts.push(`module.eq.CLIENTES`);
    }
    if (cleanSearch.includes('linea')) {
      orParts.push(`module.eq.pur_lines`);
      orParts.push(`module.eq.pur_sublines`);
    }
    if (cleanSearch.includes('sublinea') || cleanSearch.includes('sub-linea')) {
      orParts.push(`module.eq.pur_sublines`);
    }
    if (cleanSearch.includes('categoria')) {
      orParts.push(`module.eq.pur_categories`);
    }
    if (cleanSearch.includes('sucursal')) {
      orParts.push(`module.eq.sec_branches`);
    }
    if (cleanSearch.includes('ubicacion')) {
      orParts.push(`module.eq.sec_articles`);
    }
    if (cleanSearch.includes('usuario')) {
      orParts.push(`module.eq.sec_users`);
    }
    if (cleanSearch.includes('rol') || cleanSearch.includes('permiso')) {
      orParts.push(`module.eq.sec_roles`);
    }
    if (cleanSearch.includes('auditor')) {
      orParts.push(`module.eq.sec_audit`);
    }
    if (cleanSearch.includes('recepcion') || cleanSearch.includes('recepciones') || cleanSearch.includes('nota de recepcion')) {
      orParts.push(`module.eq.inv_receipts`);
      orParts.push(`module.eq.NOTAS_RECEPCION`);
    }
    if (cleanSearch.includes('sesion') || cleanSearch.includes('inicio') || cleanSearch.includes('cierre') || cleanSearch.includes('login') || cleanSearch.includes('logout')) {
      orParts.push(`module.eq.auth_login`);
      orParts.push(`module.eq.auth_logout`);
    }

    query = query.or(orParts.join(','));
  }

  query = query
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data: logs, count, error } = await query;

  if (error) {
    console.error('[AUDIT] Error cargando logs:', error.message);
    return {
      logs: [],
      branches: [],
      pagination: { page, total: 0, totalPages: 0, limit }
    };
  }

  // Fetch branches for filter
  const { data: branches } = await supabaseAdmin.from('branches').select('id, name').order('name');

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return { 
    logs: logs ?? [],
    branches: branches ?? [],
    pagination: { page, total, totalPages, limit }
  };
});
