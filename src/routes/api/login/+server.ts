// src/routes/api/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { email, password } = await request.json();

  if (!email || !password) {
    return json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
  }

  let isOfflineFallback = false;
  let localProfile = null;

  try {
    // ── 1. Intento Online (Supabase Cloud) ──
    const { data: authData, error: authError } = await locals.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Detección de fallo de red (Timeout o DNS)
      if (authError.message?.includes('fetch failed') || authError.message?.includes('Failed to fetch')) {
        throw new Error('OFFLINE');
      }

      console.error('[LOGIN ONLINE] Error:', authError.message);
      const errorMap: Record<string, string> = {
        'Invalid login credentials': 'El correo o la contraseña son incorrectos.',
        'Email not confirmed':       'Debes confirmar tu correo electrónico.',
        'Too many requests':         'Demasiados intentos. Espera unos minutos.',
      };
      const friendlyMsg = errorMap[authError.message] ?? Object.entries(errorMap).find(([k]) => authError.message.includes(k))?.[1] ?? 'Error al iniciar sesión. Verifica tus credenciales.';
      
      return json({ error: friendlyMsg }, { status: 401 });
    }

    if (!authData.user) {
      return json({ error: 'No se pudo obtener la sesión en linea' }, { status: 500 });
    }

    // Validar perfil Online
    const { supabaseAdmin } = await import('$lib/server/supabase');
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, active, full_name')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      await locals.supabase.auth.signOut();
      return json({ error: 'No se encontró tu perfil de usuario. Contacta al administrador.' }, { status: 403 });
    }
    if (!profile.active) {
      await locals.supabase.auth.signOut();
      return json({ error: 'Tu cuenta ha sido desactivada. Contacta al administrador.' }, { status: 403 });
    }

    // Online exitoso (Supabase SSR ya gestionó sus cookies internamente)
    // Limpiamos cualquier cookie offline residual para evitar confusiones
    cookies.delete('sync2k_local_session', { path: '/' });
    
    return json({ success: true, full_name: profile.full_name, mode: 'online' });

  } catch (err: any) {
    if (err.message !== 'OFFLINE' && !err.message?.includes('fetch failed') && !err.message?.includes('ETIMEDOUT')) {
      console.error('[LOGIN] Error crítico inmanejable:', err);
      return json({ error: 'Fallo catastrófico al contactar servidor de autenticación.' }, { status: 500 });
    }
    isOfflineFallback = true;
  }

  // ── 2. Intento Offline (PostgreSQL Local) ──
  if (isOfflineFallback) {
    console.warn('[LOGIN] 🔴 Sin internet. Iniciando Fallback a Base de Datos Local...');
    try {
      const { queryLocalDb } = await import('$lib/server/local-db');
      const bcrypt = (await import('bcryptjs')).default;
      
      const res = await queryLocalDb('SELECT id, full_name, password_hash, active FROM profiles WHERE email = $1', [email]);
      
      if (res.rows.length === 0) {
        return json({ error: 'Credenciales inválidas (Modo Local).' }, { status: 401 });
      }
      
      localProfile = res.rows[0];
      const isValid = await bcrypt.compare(password, localProfile.password_hash);
      
      if (!isValid) {
        return json({ error: 'Credenciales inválidas (Modo Local).' }, { status: 401 });
      }
      
      if (!localProfile.active) {
        return json({ error: 'Tu cuenta ha sido desactivada. (Modo Local)' }, { status: 403 });
      }

      // Firmar token JWS local
      const { SignJWT } = await import('jose');
      const { env } = await import('$env/dynamic/private');
      const LOCAL_JWT_SECRET = env.LOCAL_JWT_SECRET;
      const secretRaw = LOCAL_JWT_SECRET || 'secret_fallback';
      const secret = new TextEncoder().encode(secretRaw);

      const token = await new SignJWT({ sub: localProfile.id, email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

      // Establecer cookie offline explícita
      cookies.set('sync2k_local_session', token, {
        path: '/',
        httpOnly: true,
        secure: false, // Permitir login en red local HTTP
        maxAge: 60 * 60 * 24 // 24 horas
      });

      // Limpiamos cookies de Supabase rotas (opcional) para no tener colisiones en hooks
      cookies.delete('sb-rxtxzlzmxsjzicjuwbra-auth-token', { path: '/' });

      // Opcional: registrar en bitácora local usando la misma función, pero saltando supabase
      // Al ser login, el audit normal de 'LOGIN' lo manejará la UI en el OnMount o similar,
      // pero por ahora así está bien.

      return json({ success: true, full_name: localProfile.full_name, mode: 'local' });

    } catch (localErr: any) {
      console.error('[LOGIN OFFLINE] Error:', localErr);
      return json({ error: 'Sin conexión a internet y el servidor de respaldo local no responde.' }, { status: 500 });
    }
  }

  return json({ error: 'Estado inesperado' }, { status: 500 });
};
