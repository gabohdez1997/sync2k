// src/lib/server/settings.ts
import { getSupabaseAdmin } from './supabase';

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

interface CachedSettings {
  settings: SystemSettings;
  expiresAt: number;
}

let cachedSettings: CachedSettings | null = null;
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos de cache en memoria

export function clearSettingsCache() {
  cachedSettings = null;
}

/**
 * Obtiene la configuración del sistema desde Supabase (tabla system_settings)
 * Si la tabla no existe o falla, devuelve valores por defecto.
 */
export async function getSystemSettings(fetchFn?: typeof fetch): Promise<SystemSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.settings;
  }

  const supabaseAdmin = getSupabaseAdmin(fetchFn);
  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .single();

    if (error || !data) {
      // Si hay error (ej: tabla no existe) devolvemos defaults o el último cache válido
      return cachedSettings ? cachedSettings.settings : DEFAULT_SETTINGS;
    }

    const settings: SystemSettings = {
      ...DEFAULT_SETTINGS,
      ...data
    };
    cachedSettings = { settings, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return settings;
  } catch (err) {
    console.warn('[SETTINGS] Error fetching system settings, using defaults.');
    return cachedSettings ? cachedSettings.settings : DEFAULT_SETTINGS;
  }
}

/**
 * Actualiza o crea la configuración del sistema
 */
export async function updateSystemSettings(settings: Partial<SystemSettings>) {
  clearSettingsCache();
  const current = await getSystemSettings();
  const payload = { ...current, ...settings, updated_at: new Date().toISOString() };

  // Intentamos un upsert basado en una fila única (usando id 1 o similar si prefieres)
  // Para simplificar, asumimos que siempre hay una fila con id fijo o simplemente insertamos/actualizamos la primera
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('system_settings')
    .upsert({ id: 1, ...payload });

  if (error) throw new Error(error.message);
  clearSettingsCache();
  return payload;
}
