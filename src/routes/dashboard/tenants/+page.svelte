<!-- src/routes/dashboard/tenants/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { 
    Building, 
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
    Cpu,
    Hash,
    ImagePlus
  } from 'lucide-svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let searchTerm = $state("");
  let showModal = $state(false);
  let editingTenant = $state<any>(null);
  let isSaving = $state(false);

  // Estados para Eliminación con Clave
  let showDeleteModal = $state(false);
  let tenantToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Filtro reactivo
  let filteredTenants = $derived(
    data.tenants.filter((t: any) => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  function openNewModal() {
    editingTenant = {
      id: '',
      name: '',
      slug: '',
      rif: '',
      logo: '',
      tunnel_token: '',
      agent_url: '',
      agent_api_key: '',
      sql_config: { host: '', database: '', user: '', password: '' }
    };
    showModal = true;
  }

  function openEditModal(tenant: any) {
    editingTenant = { ...tenant };
    showModal = true;
  }

  // Manejo de respuesta del form
  $effect(() => {
    if (form?.success) {
      if (showModal) {
        showModal = false;
        toast.success(editingTenant?.id ? 'Empresa actualizada' : 'Empresa creada');
        editingTenant = null;
      }
      if (showDeleteModal) {
        showDeleteModal = false;
        toast.success('Empresa eliminada correctamente');
        tenantToDelete = null;
        deletePassword = "";
      }
    } else if (form?.message) {
      toast.error(form.message);
      isDeleting = false;
    }
  });
</script>

<div class="flex flex-col gap-8">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Building size={40} class="text-brand-500" />
        Gestión de Empresas
      </h1>
      <p class="text-text-muted mt-2 text-lg">Configura las conexiones SQL Server para cada tenant del sistema.</p>
    </div>
    
    <button 
      onclick={openNewModal}
      class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-brand-500/20 transition-all active:scale-95"
    >
      <Plus size={20} />
      Nueva Empresa
    </button>
  </div>

  <!-- Search and Stats -->
  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <div class="lg:col-span-3 h-14 relative">
      <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
      <input 
        type="text" 
        placeholder="Buscar por nombre o identificador..."
        bind:value={searchTerm}
        class="w-full h-full glass pl-12 pr-4 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-hidden transition-all text-lg"
      />
    </div>
    <div class="glass rounded-2xl border border-white/5 p-4 flex items-center gap-4">
      <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
        <CheckCircle2 size={24} />
      </div>
      <div>
        <p class="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Activas</p>
        <p class="text-2xl font-black">{data.tenants.length}</p>
      </div>
    </div>
  </div>

  <!-- Grid de Empresas -->
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {#each filteredTenants as tenant}
      <div class="glass relative group rounded-3xl border border-white/5 overflow-hidden p-6 hover:border-brand-500/30 transition-all hover:shadow-2xl hover:shadow-brand-500/5">
        <div class="flex justify-between items-start mb-4">
          <div class="h-12 w-12 rounded-2xl bg-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 overflow-hidden">
            {#if tenant.logo}
              <img src={tenant.logo} alt={tenant.name} class="w-full h-full object-cover" />
            {:else}
              <Building size={24} />
            {/if}
          </div>
          <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onclick={() => openEditModal(tenant)}
              class="p-2 hover:bg-white/10 rounded-xl text-text-muted hover:text-text-base transition"
            >
              <Edit size={18} />
            </button>
            <button 
              onclick={() => {
                tenantToDelete = tenant;
                showDeleteModal = true;
              }}
              class="p-2 hover:bg-red-500/10 rounded-xl text-text-muted hover:text-red-400 transition"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <h3 class="text-xl font-bold truncate">{tenant.name}</h3>
        <div class="flex items-center gap-2 mb-6">
          <p class="text-sm text-brand-400 font-mono">@{tenant.slug}</p>
          {#if tenant.rif}
            <span class="text-[10px] text-text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5 uppercase font-bold tracking-tighter">
              {tenant.rif}
            </span>
          {/if}
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-3 text-sm text-text-muted">
            <Globe size={14} class="opacity-50" />
            <span class="truncate">{tenant.agent_url || 'Sin URL de Agente'}</span>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-text-muted/50">
           <span>SQL SERVER READY</span>
           <div class="flex items-center gap-1 text-green-500">
             <div class="h-1 w-1 rounded-full bg-green-500 animate-pulse"></div>
             ACTIVO
           </div>
        </div>
      </div>
    {/each}
  </div>
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
          <h2 class="text-2xl font-black tracking-tight">{editingTenant.id ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
          <p class="text-text-muted text-sm capitalize">{editingTenant.id ? `ID: ${editingTenant.id}` : 'Configura una nueva instancia de Sync2k'}</p>
        </div>
        <button onclick={() => (showModal = false)} class="p-3 hover:bg-white/10 rounded-full text-text-muted transition-colors">
          <X size={24} />
        </button>
      </div>

      <form 
        method="POST" 
        action="?/saveTenant" 
        use:enhance={() => {
          isSaving = true;
          return async ({ update }) => {
            await update();
            isSaving = false;
          };
        }}
        class="flex-1 overflow-auto p-8 space-y-8"
      >
        <input type="hidden" name="tenantId" value={editingTenant.id} />
        <input type="hidden" name="logo" value={editingTenant.logo} />

        <!-- Logo de la Empresa -->
        <div class="flex flex-col items-center gap-4 py-4">
          <div class="relative group">
            <div class="h-32 w-32 rounded-[32px] bg-brand-500/10 border-2 border-dashed border-brand-500/30 flex items-center justify-center overflow-hidden transition-all group-hover:border-brand-500/50">
              {#if editingTenant.logo}
                <img src={editingTenant.logo} alt="Logo" class="w-full h-full object-cover" />
                <button 
                  type="button"
                  onclick={() => (editingTenant.logo = '')}
                  class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                >
                  <Trash2 size={24} />
                </button>
              {:else}
                <div class="flex flex-col items-center gap-2 text-brand-500/40">
                  <ImagePlus size={32} />
                  <span class="text-[10px] font-black uppercase tracking-widest text-center px-4">Subir Logo</span>
                </div>
              {/if}
            </div>
            <input 
              type="file" 
              accept="image/*"
              class="absolute inset-0 opacity-0 cursor-pointer"
              onchange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (re) => {
                    editingTenant.logo = re.target?.result as string;
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <p class="text-[10px] text-text-muted uppercase font-bold tracking-tighter">Click para seleccionar imagen</p>
        </div>

        <!-- Datos de Identidad -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-400">
            <Building size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Identificación</h3>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="name">Nombre de la Empresa</label>
              <input 
                type="text" 
                name="name" 
                bind:value={editingTenant.name}
                placeholder="Ej. Comercializadora Sync"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 focus:bg-white/10 outline-hidden transition-all font-medium"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="rif">RIF / Identificación Fiscal</label>
              <div class="relative">
                <Hash class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                <input 
                  type="text" 
                  name="rif" 
                  bind:value={editingTenant.rif}
                  placeholder="J-12345678-0"
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 transition-all uppercase"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="slug">Slug / Subdominio</label>
              <div class="relative">
                <input 
                  type="text" 
                  name="slug" 
                  bind:value={editingTenant.slug}
                  readonly={!!editingTenant.id}
                  placeholder="ej-comercializadora"
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 focus:bg-white/10 outline-hidden transition-all font-mono readonly:opacity-50 readonly:cursor-not-allowed"
                />
                {#if !editingTenant.id}
                  <p class="text-[10px] text-text-muted mt-1 ml-1 lowercase">Se usará como: <b>{editingTenant.slug || '...'}.sync2k.com</b></p>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Configuración del Agente -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-indigo-400">
            <Cpu size={18} />
            <h3 class="text-xs uppercase font-black tracking-widest">Agente Sync2k (Cloudflare Tunnel)</h3>
          </div>
          
          <div class="bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-6 space-y-4">
            <div class="space-y-2">
              <label class="text-xs font-bold text-indigo-300 ml-1" for="agent_url">URL del Agente (Cloudflare Tunnel)</label>
              <div class="relative">
                <Globe class="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400/40" size={18} />
                <input 
                  type="text" 
                  name="agent_url" 
                  bind:value={editingTenant.agent_url}
                  placeholder="https://empresa.sync2k.com"
                  class="w-full h-14 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl pl-12 pr-5 focus:border-indigo-500 outline-hidden transition-all text-sm"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-bold text-indigo-300 ml-1" for="agent_api_key">Agent API Key</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400/40" size={18} />
                <input 
                  type="password" 
                  name="agent_api_key" 
                  bind:value={editingTenant.agent_api_key}
                  placeholder="Pegue la clave secreta del agente aquí..."
                  class="w-full h-14 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl pl-12 pr-5 focus:border-indigo-500 outline-hidden transition-all text-sm font-mono"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-bold text-indigo-300 ml-1" for="tunnel_token">Cloudflare Tunnel Token (Opcional)</label>
              <div class="relative">
                <Cpu class="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400/40" size={18} />
                <input 
                  type="password" 
                  name="tunnel_token" 
                  bind:value={editingTenant.tunnel_token}
                  placeholder="Token del túnel..."
                  class="w-full h-14 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl pl-12 pr-5 focus:border-indigo-500 outline-hidden transition-all text-sm font-mono"
                />
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
                bind:value={editingTenant.sql_config.host}
                placeholder="192.168.1.10"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-hidden transition-all"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-text-muted ml-1" for="sqlDb">Nombre Base de Datos</label>
              <input 
                type="text" 
                name="sqlDb" 
                bind:value={editingTenant.sql_config.database}
                placeholder="Profit_Sync_2024"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 focus:border-brand-500 outline-hidden transition-all"
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
                  bind:value={editingTenant.sql_config.user}
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-hidden transition-all"
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
                  bind:value={editingTenant.sql_config.password}
                  class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 outline-hidden transition-all"
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
               Guardar Empresa
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
          <h2 class="text-2xl font-black text-text-base">¿Eliminar Empresa?</h2>
          <p class="text-text-muted text-sm px-4">
            Esta acción es irreversible. Se eliminará la conexión <b>{tenantToDelete?.name}</b> y todos sus datos asociados.
          </p>
        </div>

        <form 
          method="POST" 
          action="?/deleteTenant"
          use:enhance={() => {
            isDeleting = true;
            return async ({ update }) => {
              await update();
              isDeleting = false;
            };
          }}
          class="space-y-4"
        >
          <input type="hidden" name="tenantId" value={tenantToDelete?.id} />
          
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
