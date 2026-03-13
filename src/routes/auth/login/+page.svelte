<!-- src/routes/auth/login/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { toast } from 'svelte-sonner'; // o tu librería de toasts preferida
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  // Mostrar toast automáticamente si el action retorna un error
  $effect(() => {
    if (form?.error) {
      toast.error(form.error, { duration: 5000 });
    }
  });

  // Errores de query param (ej: ?error=account_disabled)
  const queryError: Record<string, string> = {
    profile_not_found: 'No se encontró el perfil de usuario.',
    account_disabled:  'Tu cuenta ha sido desactivada.',
    no_permission:     'No tienes permiso para acceder a esa sección.'
  };

  let queryErrorMsg = $derived(queryError[$page.url.searchParams.get('error') ?? ''] ?? null);

  $effect(() => {
    if (queryErrorMsg) {
      toast.error(queryErrorMsg, { duration: 5000 });
    }
  });

  let loading = false;
</script>

<svelte:head>
  <title>Iniciar sesión — Sync2k</title>
</svelte:head>

<main class="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
  <div class="w-full max-w-sm space-y-8">

    <!-- Logo / Brand -->
    <div class="text-center">
      <span class="text-3xl font-bold tracking-tight text-white">
        Sync<span class="text-indigo-400">2k</span>
      </span>
      <p class="mt-2 text-sm text-zinc-400">Panel Administrativo</p>
    </div>

    <!-- Card -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
      <h1 class="text-xl font-semibold text-white mb-6">Iniciar sesión</h1>

      <form
        method="POST"
        use:enhance={({ formData }) => {
          loading = true;
          return async ({ result, update }) => {
            loading = false;
            // `update` aplica el resultado del action a `form`
            await update();
          };
        }}
        class="space-y-5"
      >
        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-zinc-300 mb-1.5">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3.5 py-2.5
                   text-white placeholder-zinc-500 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                   transition"
            placeholder="tu@empresa.com"
          />
        </div>

        <!-- Contraseña -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="password" class="block text-sm font-medium text-zinc-300">
              Contraseña
            </label>
            <a href="/auth/forgot-password" class="text-xs text-indigo-400 hover:text-indigo-300 transition">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3.5 py-2.5
                   text-white placeholder-zinc-500 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                   transition"
            placeholder="••••••••"
          />
        </div>

        <!-- Error inline (accesibilidad) -->
        {#if form?.error}
          <p class="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
            {form.error}
          </p>
        {/if}

        <!-- Submit -->
        <button
          type="submit"
          disabled={loading}
          class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60
                 text-white font-medium text-sm rounded-lg py-2.5 px-4
                 transition-colors duration-150 flex items-center justify-center gap-2"
        >
          {#if loading}
            <span class="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            Iniciando sesión…
          {:else}
            Iniciar sesión
          {/if}
        </button>
      </form>
    </div>

    <p class="text-center text-xs text-zinc-600">
      © {new Date().getFullYear()} Sync2k · Todos los derechos reservados
    </p>
  </div>
</main>
