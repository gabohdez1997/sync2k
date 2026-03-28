<!-- src/routes/dashboard/branches/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { 
    Plus, 
    Search, 
    MoreVertical, 
    Edit, 
    Trash2, 
    X,
    Database,
    Globe,
    Lock,
    User,
    CheckCircle2,
    Save,
    Loader2,
    Building,
    Store,
    MapPin,
    ChevronDown
  } from 'lucide-svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let searchTerm = $state("");
  let selectedTenantId = $state($page.url.searchParams.get('tenant_id') || "");
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
    data.branches.filter((b: any) => 
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (b.description && b.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  function getTenantName(tenant_id: string) {
    const tenant = data.tenants.find(t => t.id === tenant_id || t.slug === tenant_id);
    return tenant ? tenant.name : tenant_id;
  }

  function onTenantSelect() {
    if (selectedTenantId) {
      goto(`/dashboard/branches?tenant_id=${selectedTenantId}`, { invalidateAll: true });
    } else {
      goto('/dashboard/branches');
    }
  }

  function openNewModal() {
    editingBranch = {
      id: '',
      tenant_id: selectedTenantId || '', // Por defecto la empresa actual
      name: '',
      description: '',
      co_sucu: '',
      is_default: false,
      sql_config: { host: '', database: '', user: '', password: '' }
    };
    showModal = true;
  }

  function openEditModal(branch: any) {
    editingBranch = { ...branch, tenant_id: branch.tenant_id };
    showModal = true;
  }
</script>

<div class="flex flex-col gap-8">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Store size={40} class="text-brand-500" />
        Gestión de Sucursales
      </h1>
      <p class="text-text-muted mt-2 text-lg">Configura las conexiones SQL Server para cada instancia o sucursal.</p>
    </div>
    
    <button 
      onclick={openNewModal}
      disabled={!selectedTenantId}
      class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus size={20} />
      Nueva Sucursal
    </button>
  </div>

  <!-- Selector de Empresa y Buscador -->
  <div class="glass p-6 rounded-3xl border border-white/5 space-y-6">
    <div class="flex items-center gap-3 text-brand-400 mb-2">
      <Building size={20} />
      <h2 class="text-sm uppercase font-black tracking-widest">Selecciona una Empresa</h2>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div class="lg:col-span-1 relative">
        <select 
          bind:value={selectedTenantId}
          onchange={onTenantSelect}
          class="w-full h-14 glass px-4 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-hidden transition-all text-sm font-bold appearance-none bg-surface-raised cursor-pointer text-text-base"
        >
          <option value="" disabled selected={!selectedTenantId}>-- Seleccionar Empresa --</option>
          {#each data.tenants as tenant}
            <option value={tenant.slug || tenant.id} class="bg-surface-base">{tenant.name}</option>
          {/each}
        </select>
      </div>

      <div class="lg:col-span-2 h-14 relative">
        <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por nombre en la sucursal actual..."
          bind:value={searchTerm}
          disabled={!selectedTenantId}
          class="w-full h-full glass pl-12 pr-4 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-hidden transition-all text-sm disabled:opacity-50"
        />
      </div>

      <div class="glass rounded-2xl border border-white/5 p-4 flex items-center gap-4">
        <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
          <Store size={24} />
        </div>
        <div>
          <p class="text-[10px] uppercase font-bold text-text-muted tracking-widest">Conexiones</p>
          <p class="text-2xl font-black">{data.branches.length}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Grid de Sucursales -->
  {#if data.loadError}
    <div class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4">
      <div class="h-16 w-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl">
        <Store size={32} />
      </div>
      <div>
        <h3 class="text-xl font-bold text-red-500">Error Cargando Sucursales</h3>
        <p class="text-text-muted mt-2 max-w-xl mx-auto">{data.loadError}</p>
        <p class="text-xs text-text-muted/60 mt-4 font-mono">Verifica la URL, el puerto o la conexión al Cloudflared del Agente.</p>
      </div>
    </div>
  {:else if !selectedTenantId}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Store size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">Ninguna empresa seleccionada</h3>
        <p class="text-text-muted mt-2">Selecciona una empresa del menú desplegable para ver y gestionar sus sucursales directamente desde su Agente.</p>
      </div>
    </div>
  {:else if filteredBranches.length === 0}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Store size={48} class="text-brand-500/30" />
      <div>
        <h3 class="text-xl font-bold text-brand-400">Sin Sucursales Configuradas</h3>
        <p class="text-text-muted mt-2">El agente de la empresa seleccionada no reporta conexiones SQL actualmente.</p>
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
              class="p-2 hover:bg-white/10 rounded-xl text-text-muted hover:text-text-base transition"
            >
              <Edit size={18} />
            </button>
            <button 
              onclick={() => {
                branchToDelete = branch;
                showDeleteModal = true;
              }}
              class="p-2 hover:bg-red-500/10 rounded-xl text-text-muted hover:text-red-400 transition"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <h3 class="text-xl font-bold truncate">{branch.name}</h3>
        <div class="flex items-center gap-2 mb-6">
          <Building size={14} class="text-text-muted"/>
          <p class="text-xs text-text-muted truncate">{getTenantName(branch.tenant_id)}</p>
        </div>

        <div class="space-y-3">
          {#if branch.description}
            <div class="flex items-center gap-3 text-sm text-text-muted">
              <span class="truncate block w-full">{branch.description}</span>
            </div>
          {/if}
          <div class="flex items-center gap-3 text-xs text-brand-400 font-mono">
            <Database size={12} class="opacity-80" />
            <span class="truncate">
              {branch.sql_config.host}
              {#if branch.sql_config.database}
                <span class="opacity-50 mx-1">/</span> {branch.sql_config.database}
              {/if}
            </span>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-text-muted/50">
           <span>DB CONNECTION</span>
           <div class="flex items-center gap-1 text-green-500">
             <div class="h-1 w-1 rounded-full bg-green-500 animate-pulse"></div>
             CONFIGURADO
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
          <h2 class="text-2xl font-black tracking-tight">{editingBranch.id ? 'Editar Sucursal' : 'Nueva Sucursal'}</h2>
          <p class="text-text-muted text-sm capitalize">{editingBranch.id ? `ID: ${editingBranch.id}` : 'Asocia una sucursal a una empresa'}</p>
        </div>
        <button onclick={() => (showModal = false)} class="p-3 hover:bg-white/10 rounded-full text-text-muted transition-colors">
          <X size={24} />
        </button>
      </div>

      <form 
        method="POST" 
        action="?/saveBranch" 
        use:enhance={() => {
          isSaving = true;
          return async ({ result, update }) => {
            await update();
            isSaving = false;
            if (result.type === 'success') {
              showModal = false;
              toast.success(editingBranch?.id ? 'Sucursal actualizada' : 'Sucursal creada');
              editingBranch = null;
            } else if (result.type === 'failure' && result.data?.message) {
              toast.error(result.data.message as string);
            }
          };
        }}
        class="flex-1 overflow-auto p-8 space-y-8"
      >
        <input type="hidden" name="branchId" value={editingBranch.id} />

        <!-- Datos de Identidad -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Store size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Información de Sucursal</h3>
          </div>
          
          <div class="grid grid-cols-1 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="tenant_id">Empresa Asociada</label>
              <div class="relative">
                <Building class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <select 
                  name="tenant_id" 
                  bind:value={editingBranch.tenant_id} 
                  required
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 focus:bg-white/10 outline-hidden transition-all font-medium appearance-none"
                >
                  <option value="" disabled class="bg-surface-base text-text-muted">Selecciona una empresa...</option>
                  {#each data.tenants as tenant}
                    <option value={tenant.slug || tenant.id} class="bg-surface-base text-text-base">{tenant.name}</option>
                  {/each}
                </select>
                <ChevronDown class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40 pointer-events-none" size={18} />
              </div>
            </div>
            
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="name">Nombre de la Sucursal</label>
              <input 
                type="text" 
                name="name" 
                bind:value={editingBranch.name}
                required
                placeholder="Ej. Sucursal Principal"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 focus:bg-white/10 outline-hidden transition-all font-medium"
              />
            </div>

            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="description">Descripción (Opcional)</label>
              <input 
                type="text" 
                name="description" 
                bind:value={editingBranch.description}
                placeholder="Ubicación o notas adicionales"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 focus:bg-white/10 outline-hidden transition-all text-sm"
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label class="text-xs font-bold text-text-muted ml-1" for="co_sucu">Código Sucursal Profit</label>
                <div class="relative">
                   <MapPin class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                   <input 
                     type="text" 
                     name="co_sucu" 
                     bind:value={editingBranch.co_sucu}
                     placeholder="Ej. 01"
                     class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 transition-all font-mono"
                   />
                </div>
              </div>

              <div class="space-y-2 flex flex-col justify-end">
                <label class="flex items-center gap-3 cursor-pointer group h-14 bg-white/5 border border-white/10 rounded-2xl px-5 hover:bg-white/10 transition-all">
                  <input 
                    type="checkbox" 
                    name="is_default" 
                    bind:checked={editingBranch.is_default}
                    class="sr-only peer"
                  />
                  <div class="w-11 h-6 bg-white/10 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white/20 after:border-white/10 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:after:bg-white relative"></div>
                  <span class="text-sm font-bold text-text-muted group-hover:text-text-base transition-colors">Sucursal Predeterminada</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Conexión SQL -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Database size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Configuración SQL Server</h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlHost">IP / Host Servidor</label>
              <input 
                type="text" 
                name="sqlHost" 
                bind:value={editingBranch.sql_config.host}
                placeholder="192.168.1.10"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-hidden transition-all font-mono"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlDb">Nombre Base de Datos</label>
              <input 
                type="text" 
                name="sqlDb" 
                bind:value={editingBranch.sql_config.database}
                placeholder="Profit_Sync_2024"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-hidden transition-all font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlUser">Usuario SQL</label>
              <div class="relative">
                <User class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="text" 
                  name="sqlUser" 
                  bind:value={editingBranch.sql_config.user}
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-hidden transition-all font-mono"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlPass">Contraseña SQL</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="password" 
                  name="sqlPass" 
                  bind:value={editingBranch.sql_config.password}
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-hidden transition-all font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="pt-8 border-t border-white/5 flex gap-4">
           <button 
             type="button" 
             onclick={() => (showModal = false)}
             class="flex-1 h-16 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all active:scale-95"
           >
             Cancelar
           </button>
           <button 
             type="submit" 
             disabled={isSaving}
             class="flex-1 h-16 rounded-2xl font-bold bg-linear-to-tr from-brand-600 to-indigo-600 text-white shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
           >
             {#if isSaving}
               <Loader2 size={24} class="animate-spin" />
               Guardando...
             {:else}
               <Save size={24} />
               Guardar Sucursal
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

    <div class="glass w-full max-w-md rounded-[32px] border border-red-500/20 shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto">
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black text-text-base">¿Eliminar Sucursal?</h2>
          <p class="text-text-muted text-sm px-4">
            Esta acción es irreversible. Se eliminará la conexión <b>{branchToDelete?.name}</b> y todos sus datos asociados.
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
                toast.success('Sucursal eliminada correctamente');
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
          <input type="hidden" name="tenant_id" value={branchToDelete?.tenant_id} />
          
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
                 placeholder="Introduce tu clave aquí..."
                 class="w-full h-14 bg-red-500/5 border border-red-500/10 rounded-2xl pl-12 pr-4 focus:border-red-500 outline-hidden transition-all text-sm font-mono"
               />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button 
              type="button" 
              disabled={isDeleting}
              onclick={() => (showDeleteModal = false)}
              class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isDeleting || !deletePassword}
              class="flex-1 h-14 rounded-2xl font-black bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {#if isDeleting}
                <Loader2 size={18} class="animate-spin" />
                Eliminando...
              {:else}
                <Trash2 size={18} />
                Confirmar
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
