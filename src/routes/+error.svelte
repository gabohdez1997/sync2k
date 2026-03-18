<script lang="ts">
  import { page } from "$app/state";
  import { fade, fly, scale } from "svelte/transition";
  import {
    Lock,
    SearchX,
    ServerCrash,
    AlertCircle,
    ArrowLeft,
    LayoutDashboard,
  } from "lucide-svelte";

  const status = page.status;
  const message = page.error?.message ?? "Ha ocurrido un error inesperado.";

  const errorConfig: Record<
    number,
    { title: string; desc: string; icon: any; color: string }
  > = {
    401: {
      title: "SESIÓN EXPIRADA",
      desc: "Tu acceso ha caducado. Es necesario volver a identificarse para continuar operando en el sistema.",
      icon: Lock,
      color: "text-amber-500",
    },
    403: {
      title: "ACCESO RESTRINGIDO",
      desc: "No cuentas con las credenciales o permisos necesarios para acceder a este módulo específico.",
      icon: Lock,
      color: "text-error-500",
    },
    404: {
      title: "PÁGINA NO ENCONTRADA",
      desc: "El recurso que buscas se ha esfumado en el ciberespacio o ha sido movido permanentemente.",
      icon: SearchX,
      color: "text-brand-500",
    },
    500: {
      title: "FALLO DE SISTEMA",
      desc: "Nuestros servidores han reportado un problema crítico. Nuestro equipo ha sido notificado.",
      icon: ServerCrash,
      color: "text-error-600",
    },
  };

  const config = errorConfig[status] || {
    title: "ERROR INESPERADO",
    desc: "Ha ocurrido algo verdaderamente inusual. Por favor, reporta esto si el problema persiste.",
    icon: AlertCircle,
    color: "text-text-muted",
  };
</script>

<div
  class="fixed inset-0 bg-surface-base flex items-center justify-center p-6 overflow-hidden select-none"
  in:fade
>
  <!-- WOW Background Ambient Effect: Giant Stroked Number -->
  <div
    class="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"
  >
    <span
      class="giant-stroke-text font-black tracking-tighter animate-float-slow"
    >
      {status}
    </span>
  </div>

  <!-- Ambient Cinematic Lighting Source -->
  <div
    class="absolute inset-0 pointer-events-none z-0 flex items-center justify-center {config.color}"
  >
    <div
      class="w-[100vw] h-[100vw] md:w-[55vw] md:h-[55vw] bg-current opacity-[0.08] dark:opacity-[0.15] blur-[140px] rounded-full transition-colors duration-1000 animate-pulse-glow"
    ></div>
  </div>

  <!-- Main Content Layer z-10 -->
  <div
    class="relative z-10 w-full max-w-5xl flex flex-col items-center text-center {config.color}"
  >
    <!-- Hero Ambient Icon -->
    <div
      in:scale={{ duration: 1000, delay: 200, start: 0.5, opacity: 0 }}
      class="relative mb-6 md:mb-10"
    >
      <!-- Glow ring behind icon -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div
          class="w-32 h-32 md:w-48 md:h-48 bg-current opacity-10 rounded-full blur-2xl animate-pulse-glow"
        ></div>
      </div>
      <config.icon
        size={104}
        strokeWidth={0.6}
        class="relative z-10 drop-shadow-[0_0_40px_currentColor] hidden md:block"
      />
      <config.icon
        size={80}
        strokeWidth={0.6}
        class="relative z-10 drop-shadow-[0_0_24px_currentColor] md:hidden"
      />
    </div>

    <!-- Error Subtitle Line -->
    <div
      in:fly={{ y: 20, duration: 800, delay: 400 }}
      class="flex items-center gap-5 mb-6 w-full max-w-xs md:max-w-md mx-auto"
    >
      <div class="h-px flex-1 bg-current opacity-20"></div>
      <span
        class="text-[10px] md:text-xs font-black tracking-[0.6em] uppercase text-text-muted"
        >Código {status}</span
      >
      <div class="h-px flex-1 bg-current opacity-20"></div>
    </div>

    <!-- Main Title -->
    <h1
      in:fly={{ y: 20, duration: 800, delay: 500 }}
      class="text-text-base text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95] mb-6 drop-shadow-sm uppercase px-4"
    >
      {config.title}
    </h1>

    <!-- Sophisticated Description -->
    <p
      in:fly={{ y: 20, duration: 800, delay: 600 }}
      class="text-text-muted text-base md:text-xl max-w-xl leading-relaxed font-light mb-12 px-4"
    >
      {config.desc}
      {#if message && status !== 404}
        <span
          class="block mt-4 text-[10px] md:text-xs font-mono font-bold tracking-[0.2em] opacity-50 uppercase text-current"
        >
          REF: {message}
        </span>
      {/if}
    </p>

    <!-- Buttons: stacked on mobile, side-by-side on desktop (md+) -->
    <div
      in:fly={{ y: 20, duration: 800, delay: 700 }}
      class="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3 md:gap-5 w-full max-w-xs md:max-w-none px-4"
    >
      <!-- Primary Action -->
      <a
        href="/dashboard"
        class="flex items-center justify-center gap-3 bg-brand-600 text-white px-10 md:px-12 py-4 md:py-5 rounded-full font-bold transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] shadow-[0_8px_32px_-8px_var(--color-brand-600)] hover:shadow-[0_16px_48px_-8px_var(--color-brand-500)] hover:bg-brand-500 group overflow-hidden relative"
      >
        <div
          class="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full"
        ></div>
        <LayoutDashboard
          size={18}
          class="relative z-10 group-hover:rotate-12 transition-transform duration-300 shrink-0"
        />
        <span
          class="relative z-10 uppercase tracking-widest text-[12px] md:text-[13px] font-bold"
          >Panel de Control</span
        >
      </a>

      <!-- Secondary Action -->
      <button
        onclick={() => history.back()}
        class="flex items-center justify-center gap-3 bg-transparent text-text-base border border-text-base/20 hover:border-text-base/50 hover:bg-white/5 px-10 md:px-12 py-4 md:py-5 rounded-full font-bold transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] group"
      >
        <ArrowLeft
          size={18}
          class="group-hover:-translate-x-1 transition-transform duration-300 shrink-0"
        />
        <span
          class="uppercase tracking-widest text-[12px] md:text-[13px] font-bold"
          >Volver Atrás</span
        >
      </button>
    </div>
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden !important;
    background: var(--surface-base);
  }

  /* El verdadero Efecto WOW de tipografía fantasma */
  .giant-stroke-text {
    font-size: clamp(20rem, 60vw, 85rem);
    line-height: 0.8;
    color: transparent;
    -webkit-text-stroke: 2px currentColor;
    opacity: 0.04;
    user-select: none;
    pointer-events: none;
  }

  :global(.dark) .giant-stroke-text {
    opacity: 0.08;
  }

  @keyframes float-slow {
    0%,
    100% {
      transform: translateY(0) scale(1.02);
    }
    50% {
      transform: translateY(-1.5%) scale(1);
    }
  }

  @keyframes pulse-glow {
    0%,
    100% {
      opacity: 0.08;
      transform: scale(1);
    }
    50% {
      opacity: 0.14;
      transform: scale(1.06);
    }
  }

  .animate-pulse-glow {
    animation: pulse-glow 6s ease-in-out infinite;
  }

  .animate-float-slow {
    animation: float-slow 12s ease-in-out infinite;
  }

  /* Clean interactions */
  :global(*) {
    -webkit-tap-highlight-color: transparent;
  }
</style>
