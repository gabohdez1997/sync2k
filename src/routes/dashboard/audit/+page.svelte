<!-- src/routes/dashboard/audit/+page.svelte -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { 
    ClipboardList, 
    Search,
    User,
    Calendar,
    Tag,
    Building,
    ExternalLink,
    Filter,
    Clock,
    Database,
    Shield
  } from "lucide-svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // ── States ─────────────────────────────────────────────────────────────────
  let searchQuery = $state("");
  let selectedTenant = $state<string | null>(null);
  let selectedAction = $state<string | null>(null);

  // Computed / Filtered
  let filteredLogs = $derived(
    data.logs.filter((log: any) => {
      const matchesSearch = 
        log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.entity?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTenant = !selectedTenant || log.tenant_id === selectedTenant;
      const matchesAction = !selectedAction || log.action === selectedAction;

      return matchesSearch && matchesTenant && matchesAction;
    })
  );

  const actionColors: Record<string, string> = {
    'CREATE': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    'UPDATE': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    'DELETE': 'bg-red-500/10 text-red-500 border-red-500/20',
    'TOGGLE_STATUS': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    'LOGIN': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    'LOGOUT': 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  };

  function formatDate(timestamp: string) {
    return new Date(timestamp).toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <ClipboardList class="text-brand-500" size={40} />
        Auditoría de Sistema
      </h1>
      <p class="text-text-muted mt-2 text-lg">Monitorea todas las acciones y cambios realizados en la plataforma.</p>
    </div>
  </div>

  <!-- Filters Bar -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <!-- Search -->
    <div class="relative md:col-span-2">
      <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
      <input 
        type="text" 
        bind:value={searchQuery}
        placeholder="Buscar por correo, acción o entidad..."
        class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
      />
    </div>

    <!-- Tenant Filter -->
    <div class="relative">
      <Building size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
      <select 
        bind:value={selectedTenant}
        class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all appearance-none cursor-pointer"
      >
        <option value={null}>Todas las empresas</option>
        {#each (data as any).tenants as tenant}
          <option value={tenant.id}>{tenant.name}</option>
        {/each}
      </select>
    </div>

    <!-- Action Filter -->
    <div class="relative">
      <Tag size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
      <select 
        bind:value={selectedAction}
        class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all appearance-none cursor-pointer"
      >
        <option value={null}>Todas las acciones</option>
        <option value="CREATE">Creación</option>
        <option value="UPDATE">Actualización</option>
        <option value="DELETE">Eliminación</option>
        <option value="TOGGLE_STATUS">Cambio Estado</option>
        <option value="LOGIN">Inicio Sesión</option>
        <option value="LOGOUT">Cierre Sesión</option>
      </select>
    </div>
  </div>

  <!-- Logs Table -->
  <div class="bg-surface-raised rounded-[32px] border border-border-subtle overflow-hidden shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-base/50">
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Fecha y Hora</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Usuario</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle text-center">Acción</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Entidad / Detalle</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Empresa</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each filteredLogs as log (log.id)}
            <tr class="hover:bg-brand-500/5 transition-colors group">
              <td class="px-8 py-5">
                <div class="flex items-center gap-3 text-text-base whitespace-nowrap">
                   <Clock size={14} class="text-brand-500" />
                   <span class="text-sm font-medium">{formatDate(log.timestamp)}</span>
                </div>
              </td>
              <td class="px-8 py-5">
                <div class="flex flex-col">
                  <span class="text-sm font-bold text-text-base">{log.user_email}</span>
                  <span class="text-[10px] text-text-muted font-mono">{log.uid}</span>
                </div>
              </td>
              <td class="px-8 py-5 text-center">
                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border {actionColors[log.action] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}">
                  {log.action}
                </span>
              </td>
              <td class="px-8 py-5">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-text-base uppercase tracking-tighter">{log.entity}:</span>
                    <span class="text-xs text-text-muted italic">{log.entity_id}</span>
                  </div>
                  {#if log.details}
                     <div class="text-[10px] text-text-muted opacity-60 bg-black/20 p-2 rounded-lg font-mono truncate max-w-xs">
                        {JSON.stringify(log.details)}
                     </div>
                  {/if}
                </div>
              </td>
              <td class="px-8 py-5">
                {#if log.tenant_id}
                  {@const tenant = data.tenants.find((t: any) => t.id === log.tenant_id)}
                  <div class="flex items-center gap-2 text-brand-400 font-bold text-xs uppercase tracking-widest">
                    <Building size={14} />
                    {tenant?.name || log.tenant_id}
                  </div>
                {:else}
                  <div class="flex items-center gap-2 text-text-muted opacity-40 font-bold text-xs uppercase tracking-widest">
                    <Shield size={14} />
                    GLOBAL
                  </div>
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-8 py-20 text-center text-text-muted opacity-50 italic">
                No se han registrado auditorías que coincidan con los filtros.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
