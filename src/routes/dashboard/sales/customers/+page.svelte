<script lang="ts">
  import { fade, slide, fly, scale } from "svelte/transition";
  import { enhance } from "$app/forms";
  import { 
    Users, 
    Search, 
    Plus, 
    Mail, 
    Phone, 
    MapPin, 
    ChevronLeft, 
    ChevronRight,
    AlertCircle,
    Loader2,
    Building2,
    Hash,
    MoreHorizontal,
    Globe,
    Edit2,
    Trash2,
    X,
    Check,
    Briefcase,
    Tag,
    UserCircle
  } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { PageData, ActionData } from "./$types";
  
  let { data, form }: { data: PageData; form: ActionData } = $props();
  
  let searchQuery = $state(data.search || "");
  let isSearching = $state(false);
  let showModal = $state(false);
  let isEditing = $state(false);
  let loading = $state(false);

  // Form State
  let co_cli = $state("");
  let descripcion = $state("");
  let rif = $state("");
  let telefonos = $state("");
  let email = $state("");
  let direccion = $state("");
  let ciudad = $state("");

  function handleSearch(e: Event) {
    e.preventDefault();
    isSearching = true;
    const url = new URL(window.location.href);
    if (searchQuery) {
        url.searchParams.set('search', searchQuery);
    } else {
        url.searchParams.delete('search');
    }
    url.searchParams.set('page', '1');
    goto(url.toString(), { replaceState: true, keepFocus: true }).finally(() => {
        isSearching = false;
    });
  }

  function changePage(newPage: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', newPage.toString());
    goto(url.toString());
  }

  function openCreateModal() {
    isEditing = false;
    co_cli = "";
    descripcion = "";
    rif = "";
    telefonos = "";
    email = "";
    direccion = "";
    ciudad = "";
    showModal = true;
  }

  function openEditModal(customer: any) {
    isEditing = true;
    co_cli = customer.co_cli;
    descripcion = customer.descripcion;
    rif = customer.rif;
    telefonos = customer.telefonos;
    email = customer.email;
    direccion = customer.direc1;
    ciudad = customer.ciudad;
    showModal = true;
  }

  $effect(() => {
    if (form?.success) {
      toast.success(isEditing ? "Cliente actualizado" : "Cliente creado");
      showModal = false;
    } else if (form?.message) {
      toast.error(form.message);
    }
    if (data.error) {
      toast.error(data.error);
    }
  });
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Users size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">Consulta y gestiona la cartera de clientes de Profit Plus en tiempo real.</p>
    </div>
    
    <button 
      onclick={openCreateModal}
      class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95"
    >
      <Plus size={20} />
      Nuevo Cliente
    </button>
  </div>

  <!-- Search and Stats -->
  <div class="flex flex-col md:flex-row gap-4">
    <form onsubmit={handleSearch} class="flex-1 relative group">
      <Search class="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors" size={20} />
      <input 
        type="text" 
        placeholder="Buscar por nombre, código o RIF..."
        bind:value={searchQuery}
        class="w-full h-16 glass pl-14 pr-32 rounded-3xl border border-white/5 focus:border-brand-500/50 outline-hidden transition-all text-lg font-medium"
      />
      <button 
        type="submit" 
        class="absolute right-3 top-1/2 -translate-y-1/2 bg-white/5 hover:bg-white/10 px-6 py-2 rounded-2xl text-sm font-bold transition-all"
      >
        {isSearching ? '...' : 'Buscar'}
      </button>
    </form>

    <div class="glass px-8 py-4 rounded-3xl border border-white/5 flex items-center gap-4">
      <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
        <Users size={20} />
      </div>
      <div>
        <p class="text-[10px] uppercase font-black tracking-widest text-text-muted">Mostrando</p>
        <p class="text-xl font-black leading-tight">{data.customers?.length || 0} Clientes</p>
      </div>
    </div>
  </div>

  {#if data.error}
    <div class="glass border-red-500/20 p-12 rounded-[40px] flex flex-col items-center justify-center text-center space-y-4">
      <div class="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
        <AlertCircle size={40} />
      </div>
      <div class="space-y-1">
        <h3 class="text-2xl font-black">Conexión Interrumpida</h3>
        <p class="text-text-muted max-w-md mx-auto">{data.error}</p>
      </div>
      <button 
        onclick={() => window.location.reload()}
        class="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all"
      >
        Reintentar Conexión
      </button>
    </div>
  {:else if !data.customers || data.customers.length === 0}
    <div class="glass p-20 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
      <div class="h-24 w-24 rounded-[40px] bg-white/5 flex items-center justify-center text-text-muted/20">
        <Search size={54} />
      </div>
      <h2 class="text-3xl font-black tracking-tight text-text-muted">No se encontraron clientes</h2>
      <p class="text-text-muted/60 max-w-sm text-lg">Pruebe con otros términos de búsqueda o verifique la sede seleccionada en Profit Plus.</p>
    </div>
  {:else}
    <!-- Table -->
    <div class="glass rounded-[40px] border border-white/5 overflow-hidden shadow-2xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/[0.02]">
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">Cliente</th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">Identidad</th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">Contacto</th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each data.customers as customer}
              <tr class="group hover:bg-white/[0.02] transition-colors cursor-pointer">
                <td class="px-8 py-6">
                  <div class="flex items-center gap-4">
                    <div class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 font-black shadow-inner">
                      {customer.descripcion?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p class="font-bold text-text-base group-hover:text-brand-400 transition-colors uppercase leading-none mb-1 text-sm">
                        {customer.descripcion}
                      </p>
                      <div class="flex items-center gap-2 text-xs text-text-muted">
                        <Hash size={12} class="opacity-50" />
                        <span class="font-mono">{customer.co_cli}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div class="space-y-1.5">
                    <div class="flex items-center gap-2">
                       <span class="text-[10px] font-black uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded border border-white/10 text-text-muted">RIF</span>
                       <span class="text-sm font-medium text-text-base">{customer.rif || '---'}</span>
                    </div>
                    <div class="flex items-center gap-2">
                       <MapPin size={12} class="text-indigo-400" />
                       <span class="text-[11px] text-text-muted truncate max-w-[200px]">{customer.direc1 || customer.sede_nombre || 'Principal'}</span>
                    </div>
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div class="space-y-1.5">
                    {#if customer.telefonos}
                      <div class="flex items-center gap-2 text-xs">
                        <Phone size={12} class="text-green-400" />
                        <span class="text-text-muted">{customer.telefonos}</span>
                      </div>
                    {/if}
                    {#if customer.email}
                      <div class="flex items-center gap-2 text-xs">
                        <Mail size={12} class="text-blue-400" />
                        <span class="text-text-muted truncate max-w-[180px]">{customer.email}</span>
                      </div>
                    {:else}
                      <span class="text-[10px] text-text-muted/40 uppercase italic">Sin correo</span>
                    {/if}
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onclick={() => openEditModal(customer)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                    <form 
                      method="POST" 
                      action="?/deleteCustomer" 
                      use:enhance={({ cancel }) => {
                        if (!confirm(`¿Eliminar al cliente ${customer.descripcion}?`)) cancel();
                        return async ({ update }) => { await update(); toast.success("Cliente eliminado"); };
                      }}
                    >
                      <input type="hidden" name="co_cli" value={customer.co_cli} />
                      <button 
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      {#if data.pagination && data.pagination.pages > 1}
        <div class="px-8 py-6 bg-white/[0.01] border-t border-white/5 flex items-center justify-between">
          <p class="text-xs font-bold text-text-muted uppercase tracking-widest">
            Página <span class="text-text-base">{data.pagination.currentPage}</span> de <span class="text-text-base">{data.pagination.pages}</span> (Total: {data.pagination.total})
          </p>
          
          <div class="flex gap-2">
            <button 
              onclick={() => data.pagination && changePage(data.pagination.currentPage - 1)}
              disabled={!data.pagination || data.pagination.currentPage === 1}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onclick={() => data.pagination && changePage(data.pagination.currentPage + 1)}
              disabled={!data.pagination || data.pagination.currentPage === data.pagination.pages}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Management Modal -->
{#if showModal}
  <div 
    class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 text-text-base"
    transition:fade
    onclick={() => (showModal = false)}
  >
    <div 
      class="bg-surface-raised w-full max-w-2xl rounded-[40px] border border-border-subtle shadow-2xl overflow-hidden flex flex-col"
      transition:fly={{ y: 50, duration: 400 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/50">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-inner">
            <UserCircle size={24} />
          </div>
          <div>
            <h2 class="text-2xl font-bold">{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            <p class="text-sm text-text-muted">{isEditing ? 'Actualiza la ficha técnica del cliente' : 'Registra un nuevo cliente en el sistema local'}</p>
          </div>
        </div>
        <button 
          onclick={() => (showModal = false)}
          class="p-3 text-text-muted hover:text-text-base hover:bg-white/5 rounded-2xl transition-all"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Modal Form -->
      <form 
        method="POST" 
        action="?/saveCustomer" 
        use:enhance={() => {
          loading = true;
          return async ({ update }) => { 
            await update(); 
            loading = false;
          };
        }}
        class="p-8 space-y-8 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar"
      >
        <input type="hidden" name="_isNew" value={String(!isEditing)} />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Code -->
          <div class="space-y-2">
            <label for="co_cli" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Código del Cliente</label>
            <div class="relative">
              <Hash size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="co_cli"
                name="co_cli"
                type="text" 
                required
                readonly={isEditing}
                bind:value={co_cli}
                placeholder="Ej: CLI-001"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono {isEditing ? 'opacity-50' : ''}"
              />
            </div>
          </div>

          <!-- RIF -->
          <div class="space-y-2">
            <label for="rif" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">RIF / Identificación</label>
            <div class="relative">
              <Tag size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="rif"
                name="rif"
                type="text" 
                required
                bind:value={rif}
                placeholder="Ej: J-12345678-9"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Description -->
          <div class="md:col-span-2 space-y-2">
            <label for="descripcion" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Razón Social / Nombre</label>
            <div class="relative">
              <Building2 size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="descripcion"
                name="descripcion"
                type="text" 
                required
                bind:value={descripcion}
                placeholder="Nombre comercial o jurídico"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all uppercase"
              />
            </div>
          </div>

          <!-- Phone -->
          <div class="space-y-2">
            <label for="telefonos" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Teléfonos</label>
            <div class="relative">
              <Phone size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="telefonos"
                name="telefonos"
                type="text" 
                bind:value={telefonos}
                placeholder="+58 212-0000000"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Correo Electrónico</label>
            <div class="relative">
              <Mail size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="email"
                name="email"
                type="email" 
                bind:value={email}
                placeholder="cliente@ejemplo.com"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Address -->
          <div class="md:col-span-2 space-y-2">
            <label for="direccion" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Dirección Fiscal</label>
            <div class="relative">
              <MapPin size={18} class="absolute left-4 top-6 text-text-muted opacity-40" />
              <textarea 
                id="direccion"
                name="direc1"
                rows="3"
                bind:value={direccion}
                placeholder="Calle, Av, Edificio..."
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all resize-none"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-4 pb-2">
          <button 
            type="submit"
            disabled={loading}
            class="w-full bg-brand-600 hover:bg-brand-500 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3"
          >
            {#if loading}
              <Loader2 size={24} class="animate-spin" />
              Procesando...
            {:else}
              <Check size={24} />
              {isEditing ? 'Guardar Cambios' : 'Crear Cliente'}
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
</style>
