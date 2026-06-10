<!-- src/routes/dashboard/security/printers/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from 'svelte/transition';
  import { 
    Printer, Plus, Edit2, Trash2, ShieldCheck, 
    RefreshCw, CheckCircle2, AlertTriangle, Store, Play
  } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import Combobox from '$lib/components/ui/Combobox.svelte';

  let { data } = $props();

  let name = $state('');
  let ipAddress = $state('');
  let port = $state('9100');
  let branchId = $state('');
  let isActive = $state(true);
  let editingId = $state<string | null>(null);

  // Subline selection state
  let selectedSublines = $state<string[]>([]);
  let sublineSearchQuery = $state('');

  let filteredSublinesForUI = $derived(
    (data.sublines || []).filter((sub: any) => {
      const query = sublineSearchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        (sub.co_subl || '').toLowerCase().includes(query) || 
        (sub.subl_des || '').toLowerCase().includes(query)
      );
    })
  );

  let isSubmitting = $state(false);
  let isTesting = $state<Record<string, boolean>>({});

  function resetForm() {
    name = '';
    ipAddress = '';
    port = '9100';
    branchId = data.branches[0]?.id || '';
    isActive = true;
    editingId = null;
    selectedSublines = [];
    sublineSearchQuery = '';
  }

  // Pre-load first branch ID
  $effect(() => {
    if (data.branches && data.branches.length > 0 && !branchId) {
      branchId = data.branches[0].id;
    }
  });

  function selectPrinterForEdit(p: any) {
    name = p.name;
    ipAddress = p.ip_address;
    port = String(p.port);
    branchId = p.branch_id;
    isActive = p.is_active;
    editingId = p.id;
    selectedSublines = p.sublines || [];
    sublineSearchQuery = '';
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!name || !ipAddress || !branchId) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    isSubmitting = true;
    const formData = new FormData();
    if (editingId) formData.set('printerId', editingId);
    formData.set('name', name);
    formData.set('ip_address', ipAddress);
    formData.set('port', port);
    formData.set('branch_id', branchId);
    formData.set('is_active', String(isActive));
    formData.set('sublines', JSON.stringify(selectedSublines));

    try {
      const response = await fetch('?/savePrinter', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.type === 'success') {
        toast.success(editingId ? 'Impresora actualizada' : 'Impresora creada con éxito');
        resetForm();
        await invalidateAll();
      } else {
        const errorData = result.data ? JSON.parse(result.data) : {};
        toast.error(errorData.message || 'Error al guardar impresora');
      }
    } catch (err: any) {
      toast.error('Error de servidor: ' + err.message);
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDelete(printerId: string) {
    if (!confirm('¿Seguro que deseas eliminar esta impresora?')) return;

    const formData = new FormData();
    formData.set('printerId', printerId);

    try {
      const response = await fetch('?/deletePrinter', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.type === 'success') {
        toast.success('Impresora eliminada');
        if (editingId === printerId) resetForm();
        await invalidateAll();
      } else {
        const errorData = result.data ? JSON.parse(result.data) : {};
        toast.error(errorData.message || 'Error al eliminar impresora');
      }
    } catch (err: any) {
      toast.error('Error de servidor: ' + err.message);
    }
  }

  async function testPrinterConnection(p: any) {
    isTesting[p.id] = true;
    try {
      const response = await fetch(`/api/agent/printers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: p.branch_id,
          ip_address: p.ip_address,
          port: p.port
        })
      });
      const result = await response.json();

      if (result.success) {
        toast.success(`Conexión exitosa con ${p.name} (${p.ip_address})`);
      } else {
        toast.error(result.message || 'No se pudo conectar a la impresora.');
      }
    } catch (err: any) {
      toast.error('Error al probar conexión: ' + err.message);
    } finally {
      isTesting[p.id] = false;
    }
  }

  function getBranchName(id: string) {
    const b = data.branches.find((br: any) => br.id === id);
    return b ? b.name : 'Desconocida';
  }
</script>

<div class="space-y-8" in:fade>
  
  <!-- HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Printer size={40} class="text-brand-500" />
        Configuración de Impresoras
      </h1>
      <p class="text-text-muted mt-2 text-lg">Define y administra las impresoras de la red de cada sucursal.</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    
    <!-- LEFT: PRINTERS LIST -->
    <div class="lg:col-span-2 space-y-6">
      <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
        <div class="p-6 border-b border-border-subtle bg-surface-soft/40">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Printer size={16} />
            Impresoras en Red
          </h3>
        </div>

        {#if data.printers.length === 0}
          <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
            <Printer size={48} class="text-text-muted/30" />
            <h4 class="text-lg font-bold text-text-muted">No hay impresoras registradas</h4>
            <p class="text-xs text-text-muted/50 max-w-xs">Registra una impresora térmica ESC/POS con su IP y puerto para habilitar la facturación de caja.</p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                  <th class="px-6 py-4">Impresora</th>
                  <th class="px-6 py-4">Sucursal</th>
                  <th class="px-6 py-4">Dirección IP</th>
                  <th class="px-6 py-4">Sub-Líneas</th>
                  <th class="px-6 py-4 text-center">Estado</th>
                  <th class="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle text-sm">
                {#each data.printers as p (p.id)}
                  <tr class="hover:bg-surface-soft/60 transition-colors">
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-3">
                        <div class="p-2 rounded-lg bg-brand-500/10 text-brand-500">
                          <Printer size={16} />
                        </div>
                        <span class="font-bold text-text-base">{p.name}</span>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-text-muted font-bold">
                      {getBranchName(p.branch_id)}
                    </td>
                    <td class="px-6 py-4 text-text-muted font-mono font-bold">
                      {p.ip_address}:{p.port}
                    </td>
                    <td class="px-6 py-4 text-xs font-bold text-text-muted max-w-[200px] truncate">
                      {#if !p.sublines || p.sublines.length === 0}
                        <span class="text-amber-400/80 italic">Todas (Nueva/Cualquiera)</span>
                      {:else}
                        {p.sublines.join(', ')}
                      {/if}
                    </td>
                    <td class="px-6 py-4 text-center">
                      {#if p.is_active}
                        <span class="px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 text-[10px] font-black border border-green-500/20">ACTIVA</span>
                      {:else}
                        <span class="px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[10px] font-black border border-red-500/20">INACTIVA</span>
                      {/if}
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <button 
                          onclick={() => testPrinterConnection(p)}
                          disabled={isTesting[p.id]}
                          class="p-2 bg-surface-soft border border-border-subtle text-brand-400 hover:text-brand-300 rounded-lg transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                          title="Probar Conexión"
                        >
                          {#if isTesting[p.id]}
                            <RefreshCw size={14} class="animate-spin" />
                          {:else}
                            <Play size={14} fill="currentColor" />
                          {/if}
                        </button>
                        <button 
                          onclick={() => selectPrinterForEdit(p)}
                          class="p-2 bg-surface-soft border border-border-subtle text-text-muted hover:text-text-base rounded-lg transition-all active:scale-95 cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onclick={() => handleDelete(p.id)}
                          class="p-2 bg-surface-soft border border-border-subtle text-red-500 hover:text-red-400 rounded-lg transition-all active:scale-95 cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT: CONFIG FORM -->
    <div class="lg:col-span-1">
      <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6 sticky top-24">
        <h3 class="text-lg font-black tracking-tight text-text-base flex items-center gap-2 border-b border-border-subtle pb-4">
          <ShieldCheck size={20} class="text-brand-500" />
          {editingId ? 'Editar Impresora' : 'Registrar Impresora'}
        </h3>

        <form onsubmit={handleSave} class="space-y-4">
          <div class="space-y-1.5">
            <label for="p_name" class="text-[10px] font-black uppercase tracking-widest text-text-muted">Nombre de la Impresora</label>
            <input 
              id="p_name"
              type="text" 
              bind:value={name} 
              placeholder="Ej. Caja Principal, Despacho"
              class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
              required 
            />
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2 space-y-1.5">
              <label for="p_ip" class="text-[10px] font-black uppercase tracking-widest text-text-muted">IP de Impresora</label>
              <input 
                id="p_ip"
                type="text" 
                bind:value={ipAddress} 
                placeholder="Ej. 192.168.90.10"
                class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold font-mono text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
                required 
              />
            </div>
            <div class="col-span-1 space-y-1.5">
              <label for="p_port" class="text-[10px] font-black uppercase tracking-widest text-text-muted">Puerto</label>
              <input 
                id="p_port"
                type="text" 
                bind:value={port} 
                placeholder="9100"
                class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold font-mono text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
                required 
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="p_branch" class="text-[10px] font-black uppercase tracking-widest text-text-muted">Sucursal</label>
            <div class="w-full relative">
              <select 
                id="p_branch"
                bind:value={branchId}
                class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold text-text-base focus:outline-none focus:border-brand-500/50 transition-all cursor-pointer appearance-none"
              >
                {#each data.branches as b}
                  <option value={b.id}>{b.name}</option>
                {/each}
              </select>
              <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted">
                <Store size={14} />
              </div>
            </div>
          </div>

          <!-- Sublineas a imprimir -->
          <div class="space-y-1.5">
            <label class="text-[10px] font-black uppercase tracking-widest text-text-muted">Sub-Líneas Permitidas</label>
            <div class="border border-border-subtle rounded-xl bg-surface-soft p-3 space-y-3">
              <input 
                type="text" 
                placeholder="Buscar sub-línea..." 
                bind:value={sublineSearchQuery}
                class="w-full h-9 bg-surface-strong border border-border-subtle rounded-lg px-3 text-xs font-bold text-text-base focus:outline-none focus:border-brand-500/50 placeholder:text-text-muted/40"
              />
              <div class="max-h-48 overflow-y-auto space-y-2 pr-1 select-none scrollbar-thin">
                {#each filteredSublinesForUI as sub}
                  <label class="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-base cursor-pointer">
                    <input 
                      type="checkbox" 
                      value={sub.co_subl.trim()}
                      checked={selectedSublines.includes(sub.co_subl.trim())}
                      onchange={(e) => {
                        const target = e.target as HTMLInputElement;
                        const code = sub.co_subl.trim();
                        if (target.checked) {
                          if (!selectedSublines.includes(code)) {
                            selectedSublines = [...selectedSublines, code];
                          }
                        } else {
                          selectedSublines = selectedSublines.filter(s => s !== code);
                        }
                      }}
                      class="w-3.5 h-3.5 rounded border-border-subtle text-brand-500 focus:ring-brand-500 bg-black/20 cursor-pointer"
                    />
                    <span class="truncate" title="{sub.co_subl.trim()} - {sub.subl_des.trim()}">
                      {sub.co_subl.trim()} - {sub.subl_des.trim()}
                    </span>
                  </label>
                {/each}
                {#if filteredSublinesForUI.length === 0}
                  <p class="text-[10px] text-text-muted/50 text-center py-4">No se encontraron sub-líneas</p>
                {/if}
              </div>
            </div>
            <p class="text-[9px] text-text-muted/60 ml-1 italic leading-normal">
              Si no seleccionas ninguna, la impresora imprimirá todas las sub-líneas (incluyendo sub-líneas nuevas no asignadas).
            </p>
          </div>

          <div class="flex items-center gap-3 py-2">
            <input 
              id="p_active"
              type="checkbox" 
              bind:checked={isActive} 
              class="w-4 h-4 rounded border-border-subtle text-brand-500 focus:ring-brand-500 bg-black/20 cursor-pointer"
            />
            <label for="p_active" class="text-xs font-bold text-text-muted select-none cursor-pointer">Impresora activa y habilitada</label>
          </div>

          <div class="pt-4 flex gap-3">
            <button 
              type="submit" 
              disabled={isSubmitting}
              class="flex-1 h-12 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20"
            >
              {#if isSubmitting}
                <RefreshCw size={16} class="animate-spin" />
              {/if}
              Guardar
            </button>
            <button 
              type="button" 
              onclick={resetForm}
              class="px-5 h-12 bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-base font-bold rounded-xl transition-all"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>

</div>
