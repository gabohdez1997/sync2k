<!-- src/routes/+page.svelte — Login con Supabase Auth -->
<script lang="ts">
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import { getTheme, toggleTheme } from "$lib/theme.svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { Sun, Moon } from "lucide-svelte";

  let { data } = $props();

  // Errores de query param (ej: ?error=profile_not_found)
  const queryError: Record<string, string> = {
    profile_not_found:
      "No se encontró el perfil de usuario. Contacta al administrador.",
    account_disabled: "Tu cuenta ha sido desactivada.",
    no_permission: "No tienes permiso para acceder a esa sección.",
  };

  let queryErrorMsg = $derived(
    queryError[$page.url.searchParams.get("error") ?? ""] ?? null,
  );

  $effect(() => {
    if (queryErrorMsg) toast.error(queryErrorMsg, { duration: 6000 });
  });

  let loading = $state(false);
  let email = $state("");
  let password = $state("");
  let errorMessage = $state<string | null>(null);

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    errorMessage = null;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorMessage = data.error ?? "Error al iniciar sesión.";
        toast.error(errorMessage!);
        return;
      }

      // Sesión creada — invalidar y redirigir
      await invalidateAll();
      const redirectTo =
        $page.url.searchParams.get("redirectTo") || "/dashboard";
      await goto(redirectTo);
    } catch {
      errorMessage = "Error de conexión. Verifica tu internet.";
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Iniciar sesión — {data.systemSettings?.app_name ?? "GalpeApp"}</title>
</svelte:head>

<main
  class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
>
  <!-- Background blobs -->
  <div
    class="absolute -top-24 -left-24 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse"
  ></div>
  <div
    class="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"
  ></div>

  <!-- Theme toggle -->
  <div class="absolute top-6 right-6">
    <button
      onclick={toggleTheme}
      class="glass p-2.5 rounded-full text-text-muted hover:text-text-base transition-all duration-300 shadow-lg active:scale-90"
      title="Cambiar tema"
    >
      {#if getTheme() === "dark"}
        <Sun size={20} />
      {:else}
        <Moon size={20} />
      {/if}
    </button>
  </div>

  <div class="w-full max-w-sm space-y-10 relative z-10">
    <!-- Logo -->
    <div class="text-center space-y-4">
      {#if data.systemSettings?.app_logo_url}
        <img
          src={data.systemSettings.app_logo_url}
          alt="Logo"
          style="width: {data.systemSettings.app_logo_width ?? 200}px; height: auto;"
          class="mx-auto drop-shadow-2xl mb-2"
        />
      {:else}
        <div class="flex items-baseline justify-center gap-0.5">
          <span
            class="text-brand-500 font-black tracking-tighter text-4xl leading-none drop-shadow-[0_0_20px_var(--color-brand-500)]"
            >Galpe</span
          >
          <span
            class="text-text-base font-black tracking-tighter text-4xl leading-none"
            >App</span
          >
        </div>
      {/if}
      <p
        class="text-xs font-semibold text-brand-400 uppercase tracking-[0.2em]"
      >
        Panel Web Administrativo
      </p>
    </div>

    <!-- Card -->
    <div class="premium-card p-10">
      <form onsubmit={handleLogin} method="POST" class="space-y-6">
        <!-- Email -->
        <div class="space-y-1.5">
          <label
            for="email"
            class="block text-xs font-semibold text-text-muted uppercase tracking-wider ml-1"
          >
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
            class="w-full rounded-xl bg-surface-raised/50 border border-border-subtle px-4 py-3
                   text-text-base placeholder-text-muted/50 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500
                   transition-all duration-200"
            placeholder="tu@empresa.com"
          />
        </div>

        <!-- Contraseña -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between mb-0.5 ml-1">
            <label
              for="password"
              class="block text-xs font-semibold text-text-muted uppercase tracking-wider"
            >
              Contraseña
            </label>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            required
            class="w-full rounded-xl bg-surface-raised/50 border border-border-subtle px-4 py-3
                   text-text-base placeholder-text-muted/50 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500
                   transition-all duration-200"
            placeholder="••••••••"
          />
        </div>

        {#if errorMessage}
          <p
            class="text-[13px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1"
          >
            {errorMessage}
          </p>
        {/if}

        <!-- Submit -->
        <button
          type="submit"
          id="btn-login"
          disabled={loading}
          class="btn-premium w-full flex items-center justify-center gap-2"
        >
          {#if loading}
            <span
              class="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
            ></span>
            Verificando...
          {:else}
            Iniciar Sesión
          {/if}
        </button>
      </form>
    </div>

    <p class="text-center text-[11px] text-text-muted font-medium opacity-60">
      {data.systemSettings?.footer_text ??
        `© ${new Date().getFullYear()} GalpeApp. Todos los Derechos Reservados.`}
    </p>
  </div>
</main>
