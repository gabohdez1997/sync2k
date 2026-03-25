<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  import { getTheme, toggleTheme } from '$lib/theme.svelte';
  import { 
    LayoutDashboard, 
    ShoppingBag, 
    DollarSign, 
    Package, 
    ShoppingCart, 
    ShieldCheck,
    ChevronDown, 
    ChevronRight,
    Users,
    Key,
    Cpu,
    FileText,
    ClipboardList,
    Receipt,
    Wallet,
    RotateCcw,
    Truck,
    XCircle,
    Menu,
    X,
    LogOut,
    Sun,
    Moon,
    RefreshCw,
    User,
    Building
  } from 'lucide-svelte';
  import { slide, fade } from 'svelte/transition';

  let { data, children }: { data: LayoutData, children: any } = $props();

  let profile = $derived(data.profile);
  let permissions = $derived(profile?.permissions ?? {});


  const navGroups = [
    { 
      id: 'dashboard',
      label: 'Dashboard', 
      icon: LayoutDashboard, 
      href: '/dashboard'
    },
    {
      id: 'sales',
      label: 'Ventas',
      icon: ShoppingBag,
      subItems: [
        { id: 'sales_customers', label: 'Clientes', href: '/dashboard/sales/customers', icon: Users },
        { id: 'sales_quotes', label: 'Cotizaciones', href: '/dashboard/sales/quotes', icon: FileText },
        { id: 'sales_orders', label: 'Pedidos', href: '/dashboard/sales/orders', icon: ClipboardList },
      ]
    },
    {
      id: 'cash',
      label: 'Caja',
      icon: DollarSign,
      subItems: [
        { id: 'cash_billing', label: 'Facturas / NE', href: '/dashboard/billing', icon: Receipt },
        { id: 'cash_payments', label: 'Cobros', href: '/dashboard/cash/payments', icon: Wallet },
        { id: 'cash_credits', label: 'Devoluciones / NC', href: '/dashboard/cash/credits', icon: RotateCcw },
      ]
    },
    {
      id: 'warehouse',
      label: 'Almacén',
      icon: Package,
      subItems: [
        { id: 'inv_shipping', label: 'Despacho', href: '/dashboard/inventory/shipping', icon: Truck },
        { id: 'inv_void', label: 'Anulación', href: '/dashboard/inventory/void', icon: XCircle },
      ]
    },
    {
      id: 'purchases',
      label: 'Compras',
      icon: ShoppingCart,
      subItems: [
        { id: 'pur_pending', label: 'Opciones por definir', href: '/dashboard/purchases/pending', icon: FileText },
      ]
    },
    {
      id: 'security',
      label: 'Seguridad',
      icon: ShieldCheck,
      subItems: [
        { id: 'sec_users', label: 'Usuarios', href: '/dashboard/users', icon: Users },
        { id: 'sec_roles', label: 'Roles y Permisos', href: '/dashboard/permissions', icon: Key },
        { id: 'sec_tenants', label: 'Empresas', href: '/dashboard/tenants', icon: Building },
        { id: 'sec_audit', label: 'Auditoría', href: '/dashboard/audit', icon: ClipboardList },
      ]
    }
  ];

  // Estado de grupos expandidos (solo para Desktop Sidebar y Móvil)
  let expandedGroups = $state<Record<string, boolean>>({
    sales: false,
    cash: false,
    warehouse: false,
    purchases: false,
    security: false
  });

  // Grupo actualmente en hover o persistente (para el sidebar contraído)
  let hoveredGroup = $state<string | null>(null);
  let stickyGroup = $state<string | null>(null);

  // Navegación móvil
  let activeMobileGroup = $state<any>(null);

  function toggleGroup(id: string) {
    expandedGroups[id] = !expandedGroups[id];
  }

  function handleGroupClick(group: any) {
    if (sidebarOpen) {
      toggleGroup(group.id);
    } else {
      // Toggle sticky state in collapsed mode (Desktop)
      if (group.subItems) {
        stickyGroup = (stickyGroup === group.id) ? null : group.id;
      } else {
        stickyGroup = null;
      }
    }
  }

  function handleMobileNav(group: any) {
    if (group.subItems) {
      activeMobileGroup = group;
      mobileMenuOpen = true;
    } else {
      mobileMenuOpen = false;
      // Navegación directa para items sin submenú
    }
  }

  let sidebarOpen = $state(true);
  let mobileMenuOpen = $state(false);

  function isActive(href: string | undefined) {
    if (!href) return false;
    if (href === $page.url.pathname) return true;
    if (href !== '/dashboard' && $page.url.pathname.startsWith(href)) return true;
    return false;
  }

  function getEffectiveHref(item: any) {
    const perms = profile?.permissions?.[item.id];
    if (!perms) return null;
    if (perms.read) return item.href;
    if (perms.create) return `${item.href}/new`; // Ruta de creación si no puede leer
    return null;
  }

  // Filtrar grupos por permisos dinámicos
  let visibleGroups = $derived.by(() => {
    return navGroups.map(group => {
      // Si es un item directo (como Dashboard)
      if (!group.subItems) {
        const href = getEffectiveHref(group);
        return href ? { ...group, href } : null;
      }

      // Si tiene subitems, filtramos cuáles son permitidos
      const allowedSubs = group.subItems
        .map(sub => {
          const href = getEffectiveHref(sub);
          return href ? { ...sub, href } : null;
        })
        .filter(Boolean);

      if (allowedSubs.length === 0) return null;
      return { ...group, subItems: allowedSubs };
    }).filter(Boolean);
  });
</script>

<div class="min-h-svh md:h-svh md:overflow-hidden bg-surface-base flex flex-col md:flex-row font-sans text-text-base transition-colors duration-500">

  <!-- ── Mobile Top Bar ───────────────────────────────────── -->
  <div class="md:hidden h-16 flex items-center px-4 glass sticky top-0 z-50">
    <div class="flex items-center font-black text-2xl tracking-tighter">
      <span class="text-brand-500">Sync</span>
      <span class="text-text-base">2K</span>
    </div>
  </div>

  <!-- ── Desktop Sidebar ───────────────────────────────────── -->
  <aside
    class="hidden md:flex flex-col glass transition-all duration-300 sticky top-0 h-screen z-40"
    class:w-64={sidebarOpen}
    class:w-20={!sidebarOpen}
  >
    <!-- Brand -->
    <div class="h-16 flex items-center px-4 border-b border-border-subtle gap-3 shrink-0">
      <div class="flex items-center font-black text-2xl tracking-tighter shrink-0 transition-opacity {sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}">
        <span class="text-brand-500">Sync</span>
        <span class="text-text-base">2K</span>
      </div>
      {#if !sidebarOpen}
        <div class="flex items-center font-black text-xl tracking-tighter shrink-0 mx-auto text-brand-500">
          S
        </div>
      {/if}
      <button
        onclick={() => (sidebarOpen = !sidebarOpen)}
        class="ml-auto p-1.5 text-text-muted hover:text-text-base rounded-lg hover:bg-white/5 transition"
      >
        <ChevronRight size={18} class="transition-transform {sidebarOpen ? 'rotate-180' : ''}" />
      </button>
    </div>

    <!-- Navigation -->
    <nav 
      class="flex-1 p-3 space-y-1 custom-scrollbar transition-all"
      class:overflow-y-auto={sidebarOpen}
      class:overflow-visible={!sidebarOpen}
    >
      {#each visibleGroups as group}
        {#if group && !group.subItems}
          <a
            href={group.href}
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative {isActive(group.href) ? 'bg-brand-600 text-white' : 'text-text-muted hover:bg-white/5 hover:text-text-base'}"
          >
            <group.icon size={20} class="shrink-0 opacity-80 group-hover:opacity-100" />
            {#if sidebarOpen}
              <span class="truncate">{group.label}</span>
            {/if}
          </a>
        {:else if group}
          <div 
            class="relative"
          >
            <button
              onclick={() => handleGroupClick(group)}
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group {(expandedGroups[group.id] && sidebarOpen) || (stickyGroup === group.id && !sidebarOpen) ? 'bg-brand-500/10 text-brand-400' : 'text-text-muted hover:bg-white/5 hover:text-text-base'}"
            >
              <group.icon size={20} class="shrink-0 opacity-80 group-hover:opacity-100" />
              {#if sidebarOpen}
                <span class="truncate">{group.label}</span>
                <ChevronDown 
                  size={14} 
                  class="ml-auto transition-transform duration-200 {expandedGroups[group.id] ? 'rotate-180' : ''}" 
                />
              {/if}
            </button>
            
            <!-- Accordion Submenu (Sidebar Open) -->
            {#if sidebarOpen && expandedGroups[group.id]}
              <div class="pl-9 space-y-1 mt-1" transition:slide>
                {#each group.subItems ?? [] as sub}
                  {#if sub}
                    <a
                      href={sub.href}
                      class="flex items-center gap-2.5 py-2 text-xs font-medium transition-colors hover:text-brand-400"
                      class:text-brand-500={isActive(sub.href)}
                      class:text-text-muted={!isActive(sub.href)}
                    >
                      <sub.icon size={14} class="opacity-60" />
                      {sub.label}
                    </a>
                  {/if}
                {/each}
              </div>
            {/if}

            <!-- Flyout Submenu (Sidebar Collapsed) -->
            {#if !sidebarOpen && stickyGroup === group.id}
              <div 
                class="absolute left-full top-0 ml-6 w-48 bg-surface-raised border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/20"
                transition:fade={{ duration: 150 }}
              >
                <div class="p-2 border-b border-border-subtle bg-brand-500/10 mb-1">
                  <span class="text-[10px] uppercase font-bold text-brand-400 tracking-wider p-2">{group.label}</span>
                </div>
                <div class="p-1 space-y-0.5">
                  {#each group.subItems ?? [] as sub}
                    {#if sub}
                      <a
                        href={sub.href}
                        onclick={() => { stickyGroup = null; }}
                        class="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-brand-500/10"
                        class:text-brand-400={isActive(sub.href)}
                        class:text-text-muted={!isActive(sub.href)}
                      >
                        <sub.icon size={14} class="opacity-60" />
                        {sub.label}
                      </a>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </nav>

    <!-- Footer Profile -->
    <div class="p-4 border-t border-border-subtle bg-black/20">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-full bg-linear-to-tr from-brand-600 to-blue-400 flex items-center justify-center text-white font-bold shrink-0 shadow-lg">
          {profile?.full_name?.[0] ?? 'U'}
        </div>
        {#if sidebarOpen}
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold truncate text-text-base">{profile?.full_name ?? 'Usuario'}</p>
            <a 
              href="/dashboard/profile" 
              class="text-[10px] text-brand-400 hover:text-brand-300 truncate uppercase tracking-tighter font-bold transition-colors"
            >
              Editar mis datos
            </a>
          </div>
          <form method="POST" action="/auth/logout">
            <button class="p-2 text-text-muted hover:text-red-400 transition" title="Salir">
              <LogOut size={16} />
            </button>
          </form>
        {/if}
      </div>
    </div>
  </aside>

  <!-- ── Mobile Bottom Sheet (Navigation & Account) ────────── -->
  {#if mobileMenuOpen}
    <div 
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden" 
      onclick={() => (mobileMenuOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
      role="button"
      tabindex="-1"
      transition:fade
    >
      <div 
        class="absolute bottom-0 left-0 right-0 glass flex flex-col p-6 space-y-6 shadow-2xl rounded-t-[32px] border-t border-white/10"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="presentation"
        transition:slide={{ axis: 'y', duration: 300 }}
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-brand-500/10 rounded-lg text-brand-400">
              {#if activeMobileGroup === 'account'}
                <User size={20} />
              {:else if activeMobileGroup}
                <activeMobileGroup.icon size={20} />
              {/if}
            </div>
            <span class="font-bold text-xl tracking-tight text-text-base">
              {activeMobileGroup === 'account' ? 'Mi Cuenta' : (activeMobileGroup?.label ?? 'Menú')}
            </span>
          </div>
          <button onclick={() => (mobileMenuOpen = false)} class="p-2 text-text-muted hover:text-text-base">
            <X size={24} />
          </button>
        </div>

        <nav class="grid grid-cols-1 gap-1 pb-4">
          {#if activeMobileGroup === 'account'}
            <a 
              href="/dashboard/profile" 
              onclick={() => (mobileMenuOpen = false)}
              class="flex items-center gap-4 p-4 rounded-2xl bg-white/10 text-text-base text-lg font-medium active:bg-brand-500 active:text-white transition-all border border-white/5"
            >
              <div class="p-2 rounded-xl bg-white/5">
                <User size={20} class="opacity-70" />
              </div>
              Editar mis datos
            </a>
            
            <button 
              onclick={() => { toggleTheme(); mobileMenuOpen = false; }}
              class="flex items-center gap-4 p-4 rounded-2xl bg-white/10 text-text-base text-lg font-medium active:bg-brand-500 active:text-white transition-all border border-white/5 text-left"
            >
              <div class="p-2 rounded-xl bg-white/5">
                {#if getTheme() === 'dark'} <Sun size={20} /> {:else} <Moon size={20} /> {/if}
              </div>
              Modo {getTheme() === 'dark' ? 'Claro' : 'Oscuro'}
            </button>

            <form method="POST" action="/auth/logout" class="mt-4 pt-4 border-t border-border-subtle">
              <button class="w-full flex items-center gap-4 p-4 rounded-2xl text-red-400 font-bold bg-red-500/10 active:bg-red-500 active:text-white transition-all">
                 <LogOut size={20} />
                 Cerrar Sesión
              </button>
            </form>
          {:else}
            {#if activeMobileGroup?.subItems}
              {#each activeMobileGroup.subItems as sub}
                <a 
                  href={sub.href} 
                  onclick={() => (mobileMenuOpen = false)}
                  class="flex items-center gap-4 p-4 rounded-2xl bg-white/10 text-text-base text-lg font-medium active:bg-brand-500 active:text-white transition-all border border-white/5"
                >
                  <div class="p-2 rounded-xl bg-white/5">
                    <sub.icon size={20} class="opacity-70" />
                  </div>
                  {sub.label}
                </a>
              {/each}
            {/if}
          {/if}
        </nav>
      </div>
    </div>
  {/if}

  <!-- ── Main Content ──────────────────────────────────────── -->
  <div class="md:flex-1 flex flex-col min-w-0">
    <header class="hidden md:flex h-16 items-center px-8 border-b border-border-subtle glass sticky top-0 z-30 justify-between">
      <div class="flex items-center gap-2 text-text-muted text-sm">
        <LayoutDashboard size={14} />
        <span>/</span>
        <span class="text-text-base font-semibold">
          {navGroups.flatMap(g => g.subItems ? [g, ...g.subItems] : [g]).find(i => isActive(i.href || ''))?.label ?? 'Resumen'}
        </span>
      </div>
      <button
        onclick={toggleTheme}
        class="p-2 text-text-muted hover:text-text-base transition-colors rounded-full hover:bg-white/5"
      >
        {#if getTheme() === 'dark'} <Sun size={20} /> {:else} <Moon size={20} /> {/if}
      </button>
    </header>

    <main class="md:flex-1 p-4 md:p-8 md:overflow-y-auto relative md:overscroll-contain touch-auto">
      <div class="max-w-7xl mx-auto pb-20 md:pb-0">
        {@render children?.()}
      </div>
    </main>

    <!-- ── Mobile Bottom Nav ──────────────────────────────────── -->
    <nav class="md:hidden h-20 glass fixed bottom-0 left-0 right-0 flex items-center justify-around px-4 z-40 border-t border-border-subtle pb-4">
      {#each visibleGroups as group}
        {#if group}
          {@const groupHref = group.href || ''}
          {#if group.subItems}
            <button 
              onclick={() => handleMobileNav(group)}
              class="flex flex-col items-center gap-1 p-2 transition-all relative"
              class:text-brand-400={isActive(groupHref) || (mobileMenuOpen && activeMobileGroup?.id === group.id)}
              class:text-text-muted={!isActive(groupHref) && !(mobileMenuOpen && activeMobileGroup?.id === group.id)}
            >
              <group.icon size={22} />
              <span class="text-[10px] font-bold uppercase tracking-tighter">{group.label}</span>
              {#if isActive(groupHref)}
                <div class="absolute -top-1 w-1 h-1 bg-brand-500 rounded-full"></div>
              {/if}
            </button>
          {:else}
            <a 
              href={groupHref} 
              class="flex flex-col items-center gap-1 p-2 transition-all relative"
              class:text-brand-400={isActive(groupHref)}
              class:text-text-muted={!isActive(groupHref)}
            >
              <group.icon size={22} />
              <span class="text-[10px] font-bold uppercase tracking-tighter">{group.label}</span>
              {#if isActive(groupHref)}
                <div class="absolute -top-1 w-1 h-1 bg-brand-500 rounded-full"></div>
              {/if}
            </a>
          {/if}
        {/if}
      {/each}
      
      <!-- Account/Theme button on Mobile -->
      <button 
        onclick={() => { activeMobileGroup = 'account'; mobileMenuOpen = true; }}
        class="flex flex-col items-center gap-1 p-2 transition-all relative"
        class:text-brand-400={mobileMenuOpen && activeMobileGroup === 'account'}
        class:text-text-muted={!(mobileMenuOpen && activeMobileGroup === 'account')}
      >
        <User size={22} />
        <span class="text-[10px] font-bold uppercase tracking-tighter">Cuenta</span>
      </button>
    </nav>
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  
  :global(.glass) {
    background: var(--glass-bg);
    backdrop-filter: blur(var(--blur-glass));
    -webkit-backdrop-filter: blur(var(--blur-glass));
    border-color: var(--border-color);
  }
</style>

