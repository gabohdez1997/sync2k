// src/routes/dashboard/settings/+page.server.ts
import { fail } from '@sveltejs/kit';
import { protectAction } from '$lib/server/permissions';
import { updateSystemSettings } from '$lib/server/settings';
import { supabaseAdmin } from '$lib/server/supabase';
import type { Actions } from './$types';

export const actions: Actions = {
  saveSettings: protectAction('sec_settings', async ({ request, locals }) => {
    const formData = await request.formData();
    const app_name = formData.get('app_name') as string;
    const app_title = formData.get('app_title') as string;
    const footer_text = formData.get('footer_text') as string;
    const app_logo_width = parseInt(formData.get('app_logo_width') as string) || 200;
    
    // Identificar archivo y URL actual
    const logoFile = formData.get('app_logo_file') as File;
    let app_logo_url = formData.get('app_logo_url_current') as string;

    if (!app_name || !app_title) {
       return fail(400, { error: 'El nombre y título de la app son obligatorios.' });
    }

    try {
      // 1. Manejar subida de archivo si existe
      if (logoFile && logoFile.size > 0) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `logo_${Date.now()}.${fileExt}`;
        const filePath = `public/${fileName}`;

        // Intentar subir al bucket 'branding'
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('branding')
          .upload(filePath, logoFile, {
            upsert: true,
            contentType: logoFile.type
          });

        if (uploadError) {
          console.error('[SETTINGS] Upload error:', uploadError);
          // Si el bucket no existe, intentar crearlo (fallback administrativo)
          if (uploadError.message?.includes('not found')) {
             await supabaseAdmin.storage.createBucket('branding', { public: true });
             // Reintentar subida
             const { data: retryData, error: retryError } = await supabaseAdmin.storage
                .from('branding')
                .upload(filePath, logoFile, { upsert: true });
             if (retryError) throw new Error('No se pudo crear el bucket o subir el archivo.');
             
             const { data } = supabaseAdmin.storage.from('branding').getPublicUrl(retryData?.path || filePath);
             app_logo_url = data.publicUrl;
          } else {
            throw uploadError;
          }
        } else {
          const { data } = supabaseAdmin.storage.from('branding').getPublicUrl(uploadData.path);
          app_logo_url = data.publicUrl;
        }
      }

      // 2. Actualizar configuración en la base de datos
      const updated = await updateSystemSettings({
        app_name,
        app_title,
        app_logo_url,
        app_logo_width,
        footer_text
      });

      return { success: true, settings: updated };
    } catch (err: any) {
      console.error('[SETTINGS] Error:', err);
      return fail(500, { error: 'Error al guardar ajustes: ' + err.message });
    }
  })
};
