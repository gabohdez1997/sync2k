<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import { getTheme, toggleTheme } from "$lib/theme.svelte";
  import { auth } from "$lib/firebase";
  import { signInWithEmailAndPassword } from "firebase/auth";
  import { goto, invalidateAll } from "$app/navigation";

  import { Sun, Moon } from "lucide-svelte";

  // Errores de query param (ej: ?error=account_disabled)
  const queryError: Record<string, string> = {
    profile_not_found: "No se encontró el perfil de usuario.",
    account_disabled: "Tu cuenta ha sido desactivada.",
    no_permission: "No tienes permiso para acceder a esa sección.",
  };

  let queryErrorMsg = $derived(
    queryError[$page.url.searchParams.get("error") ?? ""] ?? null,
  );

  $effect(() => {
    if (queryErrorMsg) {
      toast.error(queryErrorMsg, { duration: 5000 });
    }
  });

  let loading = $state(false);
  let email = $state("");
  let password = $state("");
  let errorMessage = $state<string | null>(null);

  const firebaseErrors: Record<string, string> = {
    "auth/invalid-email": "El correo electrónico ingresado no es válido.",
    "auth/user-disabled": "Esta cuenta ha sido desactivada por el administrador.",
    "auth/user-not-found": "No se encontró ninguna cuenta con este correo.",
    "auth/wrong-password": "La contraseña ingresada es incorrecta.",
    "auth/too-many-requests": "Demasiados intentos fallidos. Por seguridad, inténtalo más tarde.",
    "auth/network-request-failed": "Error de conexión. Por favor, verifica tu internet.",
    "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
    "INVALID_LOGIN_CREDENTIALS": "Credenciales inválidas. Verifica tu correo y contraseña.",
  };

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    errorMessage = null;

    try {
      // 1. Iniciar sesión cliente con Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const idToken = await userCredential.user.getIdToken();

      // 2. Enviar ID token al servidor para crear la cookie de sesión SSR
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        throw new Error("Error al generar la sesión del servidor");
      }

      // 3. Redirigir al dashboard
      const redirectTo =
        $page.url.searchParams.get("redirectTo") || "/dashboard";
      await invalidateAll();
      await goto(redirectTo);
    } catch (err: any) {
      console.error("Login error", err);
      
      const code = err.code || (err.message?.includes('INVALID_LOGIN_CREDENTIALS') ? 'INVALID_LOGIN_CREDENTIALS' : 'default');
      errorMessage = firebaseErrors[code] || "Ocurrió un error al iniciar sesión. Intenta de nuevo.";
      
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Iniciar sesión — Sync2k</title>
</svelte:head>

<main
  class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
>
  <!-- Subtle animated blobs or gradients in background -->
  <div
    class="absolute -top-24 -left-24 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse"
  ></div>
  <div
    class="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"
  ></div>

  <!-- Theme toggle login -->
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
    <!-- Logo / Brand -->
    <div class="text-center space-y-2">
      <div class="flex items-baseline justify-center gap-0.5">
        <span class="text-brand-500 font-black tracking-tighter text-4xl leading-none drop-shadow-[0_0_20px_var(--color-brand-500)]">Sync</span>
        <span class="text-text-base font-black tracking-tighter text-4xl leading-none">2K</span>
      </div>
      <p class="text-xs font-semibold text-brand-400 uppercase tracking-[0.2em]">
        Panel Web Administrativo
      </p>
    </div>

    <!-- Card -->
    <div class="premium-card p-10">
      <form onsubmit={handleLogin} class="space-y-6">
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
            <a
              href="/auth/forgot-password"
              class="text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </a>
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
      © {new Date().getFullYear()} Sync2k. Todos los Derechos Reservados.
    </p>
  </div>
</main>
