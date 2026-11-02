// src/routes/dashboard/system/integrations/+page.server.ts
import { fail } from '@sveltejs/kit';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import {
  getAllIntegrations,
  getIntegration,
  saveIntegration,
  testIntegrationConnection,
  type IntegrationConfig
} from '$lib/server/integrations';
import { logAction } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('sec_integrations', async ({ fetch, locals }) => {
  const profile = locals.profile;
  const canUpdate = hasPermission(profile, 'sec_integrations', 'update');
  const canExecute = hasPermission(profile, 'sec_integrations', 'others');

  const integrations = await getAllIntegrations(fetch);

  return {
    integrations,
    canUpdate,
    canExecute
  };
});

export const actions: Actions = {
  save: protectAction('sec_integrations', async ({ request, fetch, locals }) => {
    const formData = await request.formData();
    const id = (formData.get('id') as string)?.trim();
    const environment = formData.get('environment') as 'sandbox' | 'production' | 'demo';
    const baseUrl = (formData.get('base_url') as string)?.trim();
    const isActive = formData.get('is_active') === 'true';
    const rawCredentials = formData.get('credentials') as string;
    const rawOptions = formData.get('options') as string;

    if (!id) {
      return fail(400, { error: 'Identificador de integración requerido.' });
    }

    let credentials: Record<string, any> = {};
    let options: Record<string, any> = {};

    try {
      if (rawCredentials) credentials = JSON.parse(rawCredentials);
    } catch {
      return fail(400, { error: 'Credenciales con formato JSON inválido.' });
    }

    try {
      if (rawOptions) options = JSON.parse(rawOptions);
    } catch {
      return fail(400, { error: 'Opciones adicionales con formato JSON inválido.' });
    }

    try {
      const updated = await saveIntegration(
        id,
        {
          environment,
          base_url: baseUrl,
          is_active: isActive,
          credentials,
          options
        },
        fetch
      );

      await logAction({
        uid: locals.profile.id,
        user_email: locals.profile.email || 'system',
        action: 'UPDATE',
        module: 'api_integrations',
        record_id: id,
        new_data: { is_active: isActive, environment, base_url: baseUrl },
        branch_id: locals.profile.allowed_branches?.[0]?.id || undefined
      });

      return { success: true, message: `Integración ${updated.name} guardada correctamente.`, integration: updated };
    } catch (err: any) {
      return fail(500, { error: `Error al guardar: ${err.message}` });
    }
  }, 'update'),

  toggle: protectAction('sec_integrations', async ({ request, fetch, locals }) => {
    const formData = await request.formData();
    const id = (formData.get('id') as string)?.trim();
    const isActive = formData.get('is_active') === 'true';

    if (!id) return fail(400, { error: 'ID requerido.' });

    try {
      const updated = await saveIntegration(id, { is_active: isActive }, fetch);

      await logAction({
        uid: locals.profile.id,
        user_email: locals.profile.email || 'system',
        action: 'TOGGLE_STATUS',
        module: 'api_integrations',
        record_id: id,
        new_data: { is_active: isActive },
        branch_id: locals.profile.allowed_branches?.[0]?.id || undefined
      });

      return { success: true, message: `${updated.name} ${isActive ? 'activada' : 'desactivada'}.`, integration: updated };
    } catch (err: any) {
      return fail(500, { error: `Error al cambiar estado: ${err.message}` });
    }
  }, 'update'),

  test: protectAction('sec_integrations', async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = (formData.get('id') as string)?.trim();
    const rawCredentials = formData.get('credentials') as string;

    if (!id) return fail(400, { error: 'ID requerido para prueba de conexión.' });

    let credentialsOverride: Record<string, any> | undefined;
    if (rawCredentials) {
      try {
        credentialsOverride = JSON.parse(rawCredentials);
      } catch {}
    }

    const result = await testIntegrationConnection(id, credentialsOverride, fetch);
    return { testResult: result, integrationId: id };
  }, 'others')
};
