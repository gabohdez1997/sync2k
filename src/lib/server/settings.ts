// src/lib/server/settings.ts
import { supabaseAdmin } from './supabase';

export interface SystemSettings {
  app_name: string;
  app_title: string;
  app_logo_url: string;
  app_logo_width: number;
  primary_color: string;
  footer_text: string;
  pwa_enabled: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  app_name: 'GalpeApp',
  app_title: 'GalpeApp | Gestión Inteligente',
  app_logo_url: '/logo.png',
  app_logo_width: 200,
  primary_color: '#3b82f6',
  footer_text: '© ' + new Date().getFullYear() + ' GalpeApp. Todos los Derechos Reservados.',
  pwa_enabled: true
};

/**
 * Obtiene la configuración del sistema desde Supabase (tabla system_settings)
 * Si la tabla no existe o falla, devuelve valores por defecto.
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .single();

    if (error || !data) {
      // Si hay error (ej: tabla no existe) devolvemos defaults
      return DEFAULT_SETTINGS;
    }

    return {
      ...DEFAULT_SETTINGS,
      ...data
    };
  } catch (err) {
    console.warn('[SETTINGS] Error fetching system settings, using defaults.');
    return DEFAULT_SETTINGS;
  }
}

/**
 * Actualiza o crea la configuración del sistema
 */
export async function updateSystemSettings(settings: Partial<SystemSettings>) {
  const current = await getSystemSettings();
  const payload = { ...current, ...settings, updated_at: new Date().toISOString() };

  // Intentamos un upsert basado en una fila única (usando id 1 o similar si prefieres)
  // Para simplificar, asumimos que siempre hay una fila con id fijo o simplemente insertamos/actualizamos la primera
  const { error } = await supabaseAdmin
    .from('system_settings')
    .upsert({ id: 1, ...payload });

  if (error) throw new Error(error.message);
  return payload;
}
