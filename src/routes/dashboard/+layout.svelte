<!-- src/routes/dashboard/+layout.svelte -->
<!-- Layout del dashboard: sidebar dinámico según permisos del usuario -->
<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData, children: any } = $props();

  // Datos del perfil ya vienen tipados desde +layout.server.ts
  let profile = $derived(data.profile);
  let permissions = $derived(profile?.permissions ?? []);

  // Ítems del sidebar con su permiso requerido
  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: '◈', permission: null },
    { label: 'Facturación', href: '/dashboard/billing', icon: '◎', permission: 'facturar' },
    { label: 'Inventario', href: '/dashboard/inventory', icon: '⬡', permission: 'consultar_stock' },
    { label: 'Reportes', href: '/dashboard/reports', icon: '◉', permission: 'ver_reportes' },
    { label: 'Usuarios', href: '/dashboard/users', icon: '⬟', permission: 'gestionar_usuarios' },
    { label: 'Configuración', href: '/dashboard/settings', icon: '◫', permission: 'gestionar_empresa' }
  ] as const;

  // Filtrar ítems según permisos del usuario
  let visibleItems = $derived(navItems.filter(
    (item) => item.permission === null || permissions.includes(item.permission)
  ));

  // Detectar ruta activa
  function isActive(href: string) {
    return $page.url.pathname === href ||
           (href !== '/dashboard' && $page.url.pathname.startsWith(href));
  }

  let sidebarOpen = $state(true);
</script>

<div class="min-h-screen bg-zinc-950 flex">

  <!-- ── Sidebar ──────────────────────────────────────────── -->
  <aside
    class="flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-300"
    class:w-56={sidebarOpen}
    class:w-16={!sidebarOpen}
  >
    <!-- Brand -->
    <div class="h-16 flex items-center px-4 border-b border-zinc-800 gap-3 shrink-0">
      <span class="text-lg font-bold text-white shrink-0">
        S<span class="text-indigo-400">2k</span>
      </span>
      {#if sidebarOpen}
        <span class="text-sm font-semibold text-zinc-300 truncate">Sync2k</span>
      {/if}
      <button
        onclick={() => (sidebarOpen = !sidebarOpen)}
        class="ml-auto text-zinc-500 hover:text-white transition"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? '←' : '→'}
      </button>
    </div>

    <!-- Empresa -->
    {#if profile?.company && sidebarOpen}
      <div class="px-4 py-3 border-b border-zinc-800">
        <p class="text-xs text-zinc-500 uppercase tracking-widest mb-0.5">Empresa</p>
        <p class="text-sm font-medium text-white truncate">{profile.company.name}</p>
      </div>
    {/if}

    <!-- Navegación -->
    <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto">
      {#each visibleItems as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group"
          class:bg-indigo-600={isActive(item.href)}
          class:text-white={isActive(item.href)}
          class:text-zinc-400={!isActive(item.href)}
          class:hover:bg-zinc-800={!isActive(item.href)}
          class:hover:text-white={!isActive(item.href)}
          title={!sidebarOpen ? item.label : undefined}
        >
          <span class="text-base shrink-0">{item.icon}</span>
          {#if sidebarOpen}
            <span class="truncate">{item.label}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <!-- Footer: Usuario -->
    <div class="p-3 border-t border-zinc-800">
      <div class="flex items-center gap-2.5">
        {#if profile?.avatar_url}
          <img
            src={profile.avatar_url}
            alt="Avatar"
            class="h-8 w-8 rounded-full object-cover shrink-0"
          />
        {:else}
          <div class="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
        {/if}
        {#if sidebarOpen}
          <div class="min-w-0">
            <p class="text-sm font-medium text-white truncate">{profile?.full_name ?? 'Usuario'}</p>
            <p class="text-xs text-zinc-500 truncate capitalize">
              {profile?.roles.map((r) => r.name).join(', ') ?? ''}
            </p>
          </div>
          <form method="POST" action="/auth/logout" class="ml-auto shrink-0">
            <button
              type="submit"
              class="text-zinc-500 hover:text-red-400 transition text-xs"
              title="Cerrar sesión"
            >
              ✕
            </button>
          </form>
        {/if}
      </div>
    </div>
  </aside>

  <!-- ── Main Content ──────────────────────────────────────── -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Header -->
    <header class="h-16 flex items-center px-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
      <h1 class="text-sm font-semibold text-zinc-300">
        {visibleItems.find((i) => isActive(i.href))?.label ?? 'Dashboard'}
      </h1>
    </header>

    <!-- Page Content -->
    <main class="flex-1 p-6 overflow-auto">
      {@render children?.()}
    </main>
  </div>
</div>
