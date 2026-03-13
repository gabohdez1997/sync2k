// src/routes/dashboard/billing/+page.server.ts
// Ejemplo de uso de protectAction() y protectLoad()
//
// Este archivo demuestra el patrón recomendado para proteger
// tanto el load como las actions de una página con permisos.

import { protectAction, protectLoad } from '$lib/server/permissions';
import type { Actions, PageServerLoad } from './$types';

// ── Load protegido ────────────────────────────────────────────
// Solo usuarios con 'facturar' pueden acceder a esta página.
// Si no tienen el permiso, hooks.server.ts ya los habrá redirigido,
// pero esta capa agrega protección adicional a nivel de datos.
export const load: PageServerLoad = protectLoad('facturar', async ({ locals }) => {
  const { supabase, profile } = locals;

  // Aquí solo llegas si tienes el permiso 'facturar'
  const { data: invoices } = await supabase
    .from('invoices') // tabla de ejemplo
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    invoices: invoices ?? [],
    companyName: profile!.company?.name
  };
});

// ── Actions protegidas ────────────────────────────────────────
export const actions: Actions = {

  // Crear factura — requiere permiso 'facturar'
  crear: protectAction('facturar', async ({ request, locals }) => {
    const { supabase, profile } = locals;
    const formData = await request.formData();

    const { error } = await supabase.from('invoices').insert({
      company_id:  profile!.company!.id,
      created_by:  profile!.id,
      amount:      Number(formData.get('amount')),
      description: String(formData.get('description'))
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  }),

  // Anular factura — requiere el mismo permiso
  anular: protectAction('facturar', async ({ request, locals }) => {
    const { supabase } = locals;
    const formData = await request.formData();
    const id = String(formData.get('id'));

    const { error } = await supabase
      .from('invoices')
      .update({ status: 'anulada' })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  })
};
