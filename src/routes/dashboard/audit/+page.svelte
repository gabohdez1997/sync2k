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
    Shield,
    Eye,
    Info,
    ArrowRight,
    UserCog,
    Package,
    Store,
    Key,
    Minus,
    X,
    DollarSign
  } from "lucide-svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // ── States ─────────────────────────────────────────────────────────────────
  let searchQuery = $state("");
  let selectedBranch = $state<string | null>(null);
  let selectedAction = $state<string | null>(null);

  // States for Detail Modal
  let showDetailModal = $state(false);
  let selectedLog = $state<any>(null);

  const moduleInfo: Record<string, { label: string, icon: any, color: string }> = {
    'sec_branches':  { label: 'Sucursales', icon: Store, color: 'text-blue-400' },
    'sec_articles':  { label: 'Artículos', icon: Package, color: 'text-emerald-400' },
    'pur_articles':  { label: 'Artículos', icon: Package, color: 'text-emerald-400' },
    'cash_exchange': { label: 'Tasa de Cambio', icon: DollarSign, color: 'text-yellow-400' },
    'sec_users':     { label: 'Usuarios', icon: UserCog, color: 'text-indigo-400' },
    'sec_roles':     { label: 'Permisos y Roles', icon: Key, color: 'text-orange-400' },
    'sec_audit':     { label: 'Auditoría', icon: ClipboardList, color: 'text-zinc-400' },
    'auth_login':    { label: 'Sesión', icon: Shield, color: 'text-brand-400' },
    'auth_logout':   { label: 'Sesión', icon: Shield, color: 'text-zinc-500' }
  };

  // Computed / Filtered
  let filteredLogs = $derived(
    data.logs.filter((log: any) => {
      const matchesSearch = 
        log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.module?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesBranch = !selectedBranch || log.branch_id === selectedBranch;
      const matchesAction = !selectedAction || log.action === selectedAction;

      return matchesSearch && matchesBranch && matchesAction;
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
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatJSON(data: any): string {
    if (!data) return '';
    try {
      // Si ya es un objeto, lo formateamos. Si es string, intentamos parsearlo primero.
      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(data);
    }
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

    <!-- Branch Filter -->
    <Combobox
      options={[(data as any).branches || []].flat().map((b: any) => ({ value: b.id, label: b.name }))}
      bind:value={selectedBranch}
      placeholder="Todas las Sucursales"
      allLabel="Todas las Sucursales"
      icon={Building}
    />

    <!-- Action Filter -->
    <Combobox
      options={[
        { value: 'CREATE', label: 'Creación' },
        { value: 'UPDATE', label: 'Actualización' },
        { value: 'DELETE', label: 'Eliminación' },
        { value: 'TOGGLE_STATUS', label: 'Cambio Estado' },
        { value: 'LOGIN', label: 'Inicio Sesión' },
        { value: 'LOGOUT', label: 'Cierre Sesión' }
      ]}
      bind:value={selectedAction}
      placeholder="Todas las acciones"
      allLabel="Todas las acciones"
      icon={Tag}
    />
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
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Recurso Afectado</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Sede</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each filteredLogs as log (log.id)}
            {@const mInfo = moduleInfo[log.module] || { label: log.module, icon: Info, color: 'text-text-muted' }}
            <tr class="hover:bg-brand-500/5 transition-colors group">
              <td class="px-8 py-5">
                <div class="flex items-center gap-3 text-text-base whitespace-nowrap">
                   <Clock size={14} class="text-brand-500" />
                   <span class="text-sm font-medium">{formatDate(log.created_at)}</span>
                </div>
              </td>
              <td class="px-8 py-5">
                <div class="flex flex-col">
                  <span class="text-sm font-bold text-text-base">{log.user_email}</span>
                  <span class="text-[9px] text-text-muted font-mono">{log.source}</span>
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
                    <mInfo.icon size={14} class={mInfo.color} />
                    <span class="text-xs font-bold text-text-base uppercase tracking-tight">{mInfo.label}</span>
                  </div>
                  <span class="text-[10px] text-text-muted font-mono opacity-60">ID: {log.record_id || 'N/A'}</span>
                </div>
              </td>
              <td class="px-8 py-5">
                {#if log.branch_id}
                  <div class="flex items-center gap-2 text-brand-400 font-bold text-xs uppercase tracking-widest">
                    <Building size={14} />
                    {(log.branches as any)?.name || (Array.isArray(log.branches) ? (log.branches[0] as any)?.name : null) || 'Sede Local'}
                  </div>
                {:else}
                  <div class="flex items-center gap-2 text-brand-500/40 font-bold text-xs uppercase tracking-widest">
                    <Shield size={14} />
                    SISTEMA
                  </div>
                {/if}
              </td>
              <td class="px-8 py-5 text-right">
                <button 
                  onclick={() => { selectedLog = log; showDetailModal = true; }}
                  class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-brand-500/10 text-text-muted hover:text-brand-400 transition-all active:scale-95"
                  title="Ver detalles completos"
                >
                  <Eye size={18} />
                </button>
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

<!-- DETALLES MODAL -->
{#if showDetailModal && selectedLog}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" in:fade>
    <div 
      class="absolute inset-0 bg-black/90 backdrop-blur-md"
      onclick={() => (showDetailModal = false)}
      onkeydown={(e) => e.key === 'Escape' && (showDetailModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div 
      class="glass w-full max-w-3xl rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
      in:fly={{ y: 20, duration: 400 }}
    >
      <!-- Header -->
      <div class="p-8 border-b border-white/5 flex justify-between items-center bg-brand-500/5">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-400">
            <Info size={24} />
          </div>
          <div>
            <h2 class="text-2xl font-black tracking-tight">Detalles de la Acción</h2>
            <p class="text-text-muted text-sm">ID de Auditoría: {selectedLog.id}</p>
          </div>
        </div>
        <button onclick={() => (showDetailModal = false)} class="p-3 hover:bg-white/10 rounded-full text-text-muted transition-colors">
          <X size={24} />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-8 space-y-8 custom-scrollbar">
        <!-- Action Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-1">
            <p class="text-[10px] font-black uppercase tracking-widest text-text-muted">Acción</p>
            <p class="text-lg font-black text-brand-400">{selectedLog.action}</p>
          </div>
          <div class="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-1">
            <p class="text-[10px] font-black uppercase tracking-widest text-text-muted">Usuario</p>
            <p class="text-sm font-bold text-text-base truncate">{selectedLog.user_email}</p>
          </div>
          <div class="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-1">
            <p class="text-[10px] font-black uppercase tracking-widest text-text-muted">Fecha</p>
            <p class="text-sm font-bold text-text-base">{formatDate(selectedLog.created_at)}</p>
          </div>
        </div>

        <!-- Data Change (The "Diff" view) -->
        <div class="space-y-4">
          <div class="flex items-center gap-3 text-brand-400">
            <Database size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Cambios en los Datos</h3>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <!-- OLD DATA -->
             <div class="space-y-2">
               <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-4">Estado Anterior</label>
               <div class="bg-black/40 rounded-[32px] p-6 border border-white/5 min-h-[200px] font-mono text-[11px] overflow-auto max-h-60 custom-scrollbar leading-relaxed">
                  {#if selectedLog.old_data}
                    <pre class="text-red-400/80">{formatJSON(selectedLog.old_data)}</pre>
                  {:else}
                    <div class="h-full flex flex-col items-center justify-center text-text-muted/20">
                      <Minus size={32} />
                      <p>Sin datos previos</p>
                    </div>
                  {/if}
               </div>
             </div>

             <!-- NEW DATA -->
             <div class="space-y-2">
               <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-4">Nuevo Estado</label>
               <div class="bg-brand-500/[0.03] rounded-[32px] p-6 border border-brand-500/10 min-h-[200px] font-mono text-[11px] overflow-auto max-h-60 custom-scrollbar leading-relaxed">
                  {#if selectedLog.new_data}
                    <pre class="text-emerald-400/90">{formatJSON(selectedLog.new_data)}</pre>
                  {:else if selectedLog.metadata}
                    <pre class="text-blue-400/90">{formatJSON(selectedLog.metadata)}</pre>
                  {:else}
                    <div class="h-full flex flex-col items-center justify-center text-text-muted/20">
                      <Minus size={32} />
                      <p>Sin cambios registrados</p>
                    </div>
                  {/if}
               </div>
             </div>
          </div>
        </div>

        <!-- Additional Info -->
        <div class="p-6 rounded-3xl bg-brand-500/5 border border-brand-500/10 flex items-center justify-between">
          <div class="flex items-center gap-4">
             <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
               <Shield size={20} />
             </div>
             <div>
               <p class="text-xs font-bold text-text-base">Origen de la Acción</p>
               <p class="text-[10px] text-text-muted uppercase tracking-widest">{selectedLog.source || 'Cloud'}</p>
             </div>
          </div>
          <div class="text-right">
             <p class="text-xs font-bold text-text-base">Módulo</p>
             <p class="text-[10px] text-brand-400 font-black uppercase tracking-widest">{selectedLog.module}</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-8 border-t border-white/5 bg-black/20">
        <button 
          onclick={() => (showDetailModal = false)}
          class="w-full h-16 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all active:scale-95 text-text-base border border-transparent hover:border-white/10"
        >
          Cerrar Detalles
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
</style>
