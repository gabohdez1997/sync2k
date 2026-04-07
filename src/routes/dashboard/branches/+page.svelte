<!-- src/routes/dashboard/branches/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { 
    Plus, 
    Search, 
    Edit, 
    Trash2, 
    X,
    Database,
    Lock,
    Save,
    Loader2,
    Store,
    MapPin,
    Star
  } from 'lucide-svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let searchTerm = $state("");
  let showModal = $state(false);
  let editingBranch = $state<any>(null);
  let isSaving = $state(false);

  // Estados para Eliminación con Clave
  let showDeleteModal = $state(false);
  let branchToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Filtro reactivo
  let filteredBranches = $derived(
    data.branches.filter((b: any) => {
      const matchName = b.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCode = b.profit_branch_codes?.some((c: any) => c.code.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchName || matchCode;
    })
  );

  function openNewModal() {
    editingBranch = {
      id: '',
      name: '',
      agent_url: '',
      agent_token: '',
      profit_branch_codes: [],
      sql_config: { host: '', database: '', user: '', password: '' },
      active: true
    };
    showModal = true;
  }

  function openEditModal(branch: any) {
    editingBranch = { ...branch };
    if (!editingBranch.profit_branch_codes) {
      editingBranch.profit_branch_codes = [];
    }
    if (!editingBranch.sql_config) {
      editingBranch.sql_config = { host: '', database: '', user: '', password: '' };
    }
    showModal = true;
  }

  function addBranchCode() {
    // Si es el primero, lo marcamos predeterminado automáticamente
    const isFirst = editingBranch.profit_branch_codes.length === 0;
    editingBranch.profit_branch_codes = [...editingBranch.profit_branch_codes, { code: '', is_default: isFirst }];
  }

  function removeBranchCode(index: number) {
    editingBranch.profit_branch_codes = editingBranch.profit_branch_codes.filter((_: any, i: number) => i !== index);
    // Si eliminamos el default, asignar al primero que quede
    if (editingBranch.profit_branch_codes.length > 0 && !editingBranch.profit_branch_codes.some((c: any) => c.is_default)) {
      editingBranch.profit_branch_codes[0].is_default = true;
    }
  }

  function setDefaultCode(index: number) {
    editingBranch.profit_branch_codes = editingBranch.profit_branch_codes.map((c: any, i: number) => ({
      ...c,
      is_default: i === index
    }));
  }
</script>

<div class="flex flex-col gap-8">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Store size={40} class="text-brand-500" />
        Gestión de Nodos / Agentes
      </h1>
      <p class="text-text-muted mt-2 text-lg">Configura las conexiones (URLs y Tokens) hacia los agentes locales de Profit.</p>
    </div>
    
    <button 
      onclick={openNewModal}
      class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-brand-500/20 transition-all active:scale-95"
    >
      <Plus size={20} />
      Nuevo Agente
    </button>
  </div>

  <!-- Buscador y Filtros -->
  <div class="relative max-w-md">
    <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
    <input 
      type="text" 
      bind:value={searchTerm}
      placeholder="Buscar ramas o agentes por nombre o código..."
      class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
    />
  </div>

  <!-- Grid de Sucursales -->
  {#if data.loadError}
    <div class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4">
      <div class="h-16 w-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl">
        <Store size={32} />
      </div>
      <div>
        <h3 class="text-xl font-bold text-red-500">Error Cargando Nodos</h3>
        <p class="text-text-muted mt-2 max-w-xl mx-auto">{data.loadError}</p>
      </div>
    </div>
  {:else if filteredBranches.length === 0}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Store size={48} class="text-brand-500/30" />
      <div>
        <h3 class="text-xl font-bold text-brand-400">Sin Agentes Configurados</h3>
        <p class="text-text-muted mt-2">No hay agentes guardados que coincidan con la búsqueda.</p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {#each filteredBranches as branch}
      <div class="glass relative group rounded-3xl border border-white/5 overflow-hidden p-6 hover:border-brand-500/30 transition-all hover:shadow-2xl hover:shadow-brand-500/5">
        <div class="flex justify-between items-start mb-4">
          <div class="h-12 w-12 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 shadow-lg shadow-brand-500/10 overflow-hidden">
             <Store size={24} />
          </div>
          <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onclick={() => openEditModal(branch)}
              class="p-2 hover:bg-white/10 rounded-xl text-text-muted hover:text-brand-400 transition"
              title="Editar"
            >
              <Edit size={18} />
            </button>
            <button 
              onclick={() => {
                branchToDelete = branch;
                showDeleteModal = true;
              }}
              class="p-2 hover:bg-red-500/10 rounded-xl text-text-muted hover:text-red-400 transition"
              title="Eliminar"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <h3 class="text-xl font-bold truncate">{branch.name}</h3>
        
        <div class="flex flex-col gap-2 mb-6 mt-4">
          <p class="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-2">
            <MapPin size={12} /> Códigos Profit Plus
          </p>
          {#if !branch.profit_branch_codes || branch.profit_branch_codes.length === 0}
            <span class="text-xs text-text-muted/50 italic py-1">Sin códigos asociados</span>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each branch.profit_branch_codes as pcode}
                <span class="px-2.5 py-1 rounded-lg text-xs font-mono border flex items-center gap-1
                  {pcode.is_default ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'bg-white/5 text-text-muted border-white/10'}">
                  {#if pcode.is_default}
                    <Star size={10} class="fill-current" />
                  {/if}
                  {pcode.code || '???'}
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-3 text-xs text-brand-400 font-mono bg-black/20 p-2 rounded-xl border border-black/40">
            <Database size={12} class="opacity-80 shrink-0" />
            <span class="truncate">
              {branch.agent_url || 'Sin URL configurada'}
            </span>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-text-muted/50">
           <span>ESTADO AGENTE LOCAL</span>
           <div class="flex items-center gap-1 {branch.active ? 'text-green-500' : 'text-zinc-500'}">
             <div class="h-1 w-1 rounded-full {branch.active ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}"></div>
             {branch.active ? 'ACTIVO' : 'INACTIVO'}
           </div>
        </div>
      </div>
    {/each}
    </div>
  {/if}
</div>

<!-- Modal Form -->
{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
    <div 
      class="absolute inset-0 bg-black/80 backdrop-blur-xl" 
      onclick={() => (showModal = false)}
      onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
      role="button"
      tabindex="-1"
    ></div>
    
    <div 
      class="glass w-full max-w-2xl rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
    >
      <div class="p-8 border-b border-white/5 flex justify-between items-center bg-brand-500/5">
        <div>
          <h2 class="text-2xl font-black tracking-tight">{editingBranch.id ? 'Editar Agente Local' : 'Nuevo Agente Local'}</h2>
          <p class="text-text-muted text-sm capitalize">{editingBranch.id ? `ID Sys: ${editingBranch.id.substring(0,8)}...` : 'Asocia un nuevo endpoint de datos Profit'}</p>
        </div>
        <button onclick={() => (showModal = false)} class="p-3 hover:bg-white/10 rounded-full text-text-muted transition-colors">
          <X size={24} />
        </button>
      </div>

      <form 
        method="POST" 
        action="?/saveBranch" 
        use:enhance={({ formData }) => {
          // Serializar el array de códigos JSON y la configuración SQL antes de enviar
          formData.set('profit_branch_codes', JSON.stringify(editingBranch.profit_branch_codes));
          formData.set('sql_config', JSON.stringify(editingBranch.sql_config));
          
          isSaving = true;
          return async ({ result, update }) => {
            await update();
            isSaving = false;
            if (result.type === 'success') {
              showModal = false;
              toast.success(editingBranch?.id ? 'Agente actualizado' : 'Agente creado');
              editingBranch = null;
            } else if (result.type === 'failure' && result.data?.message) {
              toast.error(result.data.message as string);
            }
          };
        }}
        class="flex-1 overflow-auto p-8 space-y-8 custom-scrollbar"
      >
        <input type="hidden" name="branchId" value={editingBranch.id} />

        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Store size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Identidad</h3>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2 lg:col-span-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="name">Nombre / Alias del Agente</label>
              <input 
                type="text" 
                name="name" 
                bind:value={editingBranch.name}
                required
                placeholder="Ej. Sede Principal"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 focus:bg-white/10 outline-none transition-all font-medium"
              />
            </div>

            <div class="space-y-2 lg:col-span-2">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-bold text-text-muted ml-1 flex items-center gap-2">
                  <MapPin size={14} /> Códigos Sucursal Profit
                </label>
                <button 
                  type="button" 
                  onclick={addBranchCode}
                  class="text-[10px] font-bold uppercase tracking-widest text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-lg hover:bg-brand-500/20 transition-all flex items-center gap-1"
                >
                  <Plus size={12} /> Añadir
                </button>
              </div>

              {#if editingBranch.profit_branch_codes.length === 0}
                <div class="w-full bg-black/20 border border-white/5 border-dashed rounded-2xl p-6 text-center text-text-muted/50 text-sm">
                  Ningún código agreado. Has clic en "Añadir" para vincular una sucursal Profit.
                </div>
              {:else}
                <div class="space-y-3">
                  {#each editingBranch.profit_branch_codes as pcode, i}
                    <div class="w-full bg-surface-base border border-white/5 rounded-2xl p-3 flex gap-4 items-center">
                      <button 
                        type="button"
                        onclick={() => setDefaultCode(i)}
                        title="Marcar como Predeterminado principal"
                        class="shrink-0 h-10 w-10 flex items-center justify-center rounded-xl transition-all {pcode.is_default ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-text-muted hover:text-amber-500/50 hover:bg-white/10'}"
                      >
                        <Star size={18} class={pcode.is_default ? 'fill-current' : ''} />
                      </button>
                      <input 
                        type="text" 
                        bind:value={pcode.code}
                        placeholder="CÓDIGO (Ej. CAR-01)"
                        required
                        class="flex-1 h-10 bg-transparent outline-none font-mono uppercase text-sm"
                      />
                      <button 
                        type="button"
                        onclick={() => removeBranchCode(i)}
                        title="Eliminar código"
                        class="shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
              <p class="text-[10px] text-text-muted/60 ml-2 mt-2 italic">Marca con una estrella el código que se seleccionará por defecto en los formularios y documentos.</p>
            </div>

            <div class="space-y-2 lg:col-span-2 flex flex-col pt-2">
              <label class="flex items-center gap-3 cursor-pointer group w-max p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all">
                <input 
                  type="checkbox" 
                  name="active" 
                  bind:checked={editingBranch.active}
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-x-0.5 after:bg-white/20 after:border-white/10 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 peer-checked:after:bg-white relative"></div>
                <span class="text-sm font-bold text-text-muted group-hover:text-text-base transition-colors">Agente Habilitado para Conexiones</span>
              </label>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Database size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Configuración SQL Server (Agente)</h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlHost">Servidor / IP Instancia</label>
              <input 
                type="text" 
                bind:value={editingBranch.sql_config.host}
                placeholder="192.168.1.10\SQLEXPRESS"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-none transition-all font-mono"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlDb">Nombre Base de Datos</label>
              <input 
                type="text" 
                bind:value={editingBranch.sql_config.database}
                placeholder="Profit_Galpe"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlUser">Usuario 'sa' o Autorizado</label>
              <div class="relative">
                <Store class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="text" 
                  bind:value={editingBranch.sql_config.user}
                  placeholder="sa"
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-none transition-all font-mono"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlPass">Contraseña Motor SQL</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="password" 
                  bind:value={editingBranch.sql_config.password}
                  placeholder="••••••••"
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-none transition-all font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Database size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Conexión Remota (Tailscale / HTTP)</h3>
          </div>

          <div class="grid grid-cols-1 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="agent_url">URL del Agente Local</label>
              <input 
                type="text" 
                name="agent_url" 
                bind:value={editingBranch.agent_url}
                placeholder="https://profit-sede1.tailscale.net"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-none transition-all font-mono"
              />
            </div>
            
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="agent_token">Token de Autenticación (Bearer)</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="password" 
                  name="agent_token" 
                  bind:value={editingBranch.agent_token}
                  placeholder="••••••••••••••••••••••••••••••"
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-none transition-all font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="pt-8 border-t border-white/5 flex gap-4">
           <button 
             type="button" 
             onclick={() => (showModal = false)}
             class="flex-1 h-16 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all active:scale-95 text-text-base border border-transparent hover:border-white/10"
           >
             Cancelar
           </button>
           <button 
             type="submit" 
             disabled={isSaving}
             class="flex-1 h-16 rounded-2xl font-bold bg-brand-600 text-white shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
           >
             {#if isSaving}
               <Loader2 size={24} class="animate-spin" />
               Aplicando...
             {:else}
               <Save size={24} />
               Guardar Agente
             {/if}
           </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal de Confirmación de Eliminación -->
{#if showDeleteModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div 
      class="absolute inset-0 bg-black/90 backdrop-blur-md"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) => e.key === 'Escape' && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div class="glass w-full max-w-md rounded-[32px] border border-red-500/20 shadow-2xl relative z-10 overflow-hidden">
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto">
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black text-text-base">¿Desvincular Nodo?</h2>
          <p class="text-text-muted text-sm px-4">
            Se eliminará el acceso para <b>{branchToDelete?.name}</b>. Los datos de Profit Plus no se verán afectados.
          </p>
        </div>

        <form 
          method="POST" 
          action="?/deleteBranch"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;
              if (result.type === 'success') {
                showDeleteModal = false;
                toast.success('Nodo eliminado correctamente');
                branchToDelete = null;
                deletePassword = "";
              } else if (result.type === 'failure' && result.data?.message) {
                toast.error(result.data.message as string);
              }
            };
          }}
          class="space-y-4"
        >
          <input type="hidden" name="branchId" value={branchToDelete?.id} />
          
          <div class="space-y-2 text-left">
            <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-4" for="confirm_password">
              Confirma con tu contraseña
            </label>
            <div class="relative group">
               <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-red-500 transition-colors" size={18} />
               <input 
                 type="password" 
                 id="confirm_password"
                 name="password"
                 required
                 bind:value={deletePassword}
                 placeholder="Introduce tu clave web..."
                 class="w-full h-14 bg-red-500/5 border border-red-500/10 rounded-2xl pl-12 pr-4 focus:border-red-500 outline-none transition-all text-sm font-mono"
               />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button 
              type="button" 
              disabled={isDeleting}
              onclick={() => (showDeleteModal = false)}
              class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-sm text-text-base"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isDeleting || !deletePassword}
              class="flex-1 h-14 rounded-2xl font-black bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {#if isDeleting}
                <Loader2 size={18} class="animate-spin" />
                Dando de baja...
              {:else}
                <Trash2 size={18} />
                Desvincular
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
</style>
