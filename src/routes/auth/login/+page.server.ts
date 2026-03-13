// src/routes/auth/login/+page.server.ts
// Action del login: autentica con Supabase y redirige al dashboard.

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Si el usuario ya está autenticado, no mostrar el login
export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (session) redirect(303, '/dashboard');
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const formData = await request.formData();
    const email    = formData.get('email')    as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email y contraseña son requeridos.' });
    }

    const { error } = await locals.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Mapear errores de Supabase a mensajes en español
      const errorMap: Record<string, string> = {
        'Invalid login credentials': 'Credenciales incorrectas. Verifica tu email y contraseña.',
        'Email not confirmed':        'Debes confirmar tu correo electrónico antes de iniciar sesión.',
        'Too many requests':          'Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.'
      };

      const message = errorMap[error.message] ?? 'Error al iniciar sesión. Intenta de nuevo.';
      return fail(400, { error: message });
    }

    // Login exitoso → redirigir al destino original o al dashboard
    const redirectTo = url.searchParams.get('redirectTo') ?? '/dashboard';
    redirect(303, redirectTo);
  }
};
