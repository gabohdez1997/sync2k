<!-- src/routes/dashboard/users/+page.svelte -->
<script lang="ts">
  import { fade, slide, fly, scale } from "svelte/transition";
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import { 
    Users, 
    UserPlus, 
    Edit2, 
    Trash2, 
    Check, 
    X, 
    Loader2, 
    Mail, 
    Shield, 
    MoreHorizontal,
    Search,
    Building,
    Database,
    Key
  } from "lucide-svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // ── States ─────────────────────────────────────────────────────────────────
  let searchQuery = $state("");
  let showModal = $state(false);
  let isEditing = $state(false);
  let loading = $state(false);

  // Form State
  let userId = $state<string | null>(null);
  let fullName = $state("");
  let email = $state("");
  let isActive = $state(true);
  let selectedRoles = $state<string[]>([]);
  let selectedTenantId = $state<string | null>(null); // null = Global
  let profitUser = $state("");
  let password = $state("");

  // Computed / Filtered
  let filteredUsers = $derived(
    data.users.filter((u: any) => 
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // ── Functions ──────────────────────────────────────────────────────────────
  function openCreateModal() {
    isEditing = false;
    userId = null;
    fullName = "";
    email = "";
    isActive = true;
    selectedRoles = [];
    selectedTenantId = null;
    profitUser = "";
    password = "";
    showModal = true;
  }

  function openEditModal(user: any) {
    isEditing = true;
    userId = user.id;
    fullName = user.full_name;
    email = user.email;
    isActive = user.is_active;
    
    // Al abrir, seleccionamos Global por defecto
    selectedTenantId = null; 
    selectedRoles = user.globalRoles || []; 
    profitUser = "";
    password = "";
    showModal = true;
  }

  // Reactivo: Cambiar roles mostrados según el tenant seleccionado en el modal
  $effect(() => {
    if (isEditing && showModal && userId) {
      const user = data.users.find((u: any) => u.id === userId);
      if (user) {
        if (selectedTenantId === null) {
          selectedRoles = user.globalRoles || [];
          profitUser = "";
        } else {
          const tRoles = user.tenantRoles.find((tr: any) => tr.tenantId === selectedTenantId);
          selectedRoles = tRoles ? tRoles.roles : [];
          profitUser = tRoles ? tRoles.profit_user : "";
        }
      }
    }
  });

  function toggleRole(roleId: string) {
    if (selectedRoles.includes(roleId)) {
      selectedRoles = selectedRoles.filter(id => id !== roleId);
    } else {
      selectedRoles = [...selectedRoles, roleId];
    }
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  $effect(() => {
    if (form?.success) {
      toast.success(isEditing ? "Usuario actualizado" : "Usuario creado");
      showModal = false;
    } else if (form?.message) {
      toast.error(form.message as string);
    }
  });

</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <Users class="text-brand-500" size={40} />
        Gestión de Usuarios
      </h1>
      <p class="text-text-muted mt-2 text-lg">Administra los accesos y roles de tu equipo administrativo.</p>
    </div>
    
    <button 
      onclick={openCreateModal}
      class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95"
    >
      <UserPlus size={20} />
      Nuevo Usuario
    </button>
  </div>

  <!-- Search & Filters -->
  <div class="relative max-w-md">
    <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
    <input 
      type="text" 
      bind:value={searchQuery}
      placeholder="Buscar por nombre o correo..."
      class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
    />
  </div>

  <!-- Users Table Card -->
  <div class="bg-surface-raised rounded-[32px] border border-border-subtle overflow-hidden shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-base/50">
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Usuario</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Roles</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle text-center">Estado</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each filteredUsers as user (user.id)}
            <tr class="hover:bg-brand-500/5 transition-colors group">
              <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                  <div class="h-12 w-12 rounded-2xl bg-linear-to-tr from-brand-600 to-blue-400 flex items-center justify-center text-white font-black text-lg shadow-lg">
                    {user.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p class="text-base font-bold text-text-base">{user.full_name}</p>
                    <p class="text-xs text-text-muted flex items-center gap-1">
                      <Mail size={12} />
                      {user.email}
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-8 py-5">
                <div class="flex flex-col gap-2">
                  <!-- Global Roles -->
                  {#if user.globalRoles && user.globalRoles.length > 0}
                    <div class="flex flex-wrap gap-1 items-center">
                      <span class="text-[9px] font-black text-text-muted uppercase tracking-tighter w-12">Global:</span>
                      {#each user.globalRoles as roleId}
                        {@const role = data.availableRoles.find((r: any) => r.id === roleId)}
                        <span class="px-2 py-0.5 rounded-md bg-white/5 text-text-muted text-[9px] font-bold border border-white/10 uppercase">
                          {role?.name || roleId}
                        </span>
                      {/each}
                    </div>
                  {/if}

                  <!-- Tenant Roles -->
                  {#each user.tenantRoles as tr}
                    {@const tenant = data.tenants.find((t: any) => t.id === tr.tenantId)}
                    {#if tr.roles && tr.roles.length > 0}
                      <div class="flex flex-wrap gap-1 items-center">
                        <span class="text-[9px] font-black text-brand-500 uppercase tracking-tighter w-12 truncate" title={tenant?.name || tr.tenantId}>
                          {tenant?.name?.substring(0,6) || tr.tenantId}:
                        </span>
                        {#each tr.roles as roleId}
                          {@const role = data.availableRoles.find((r: any) => r.id === roleId)}
                          <span class="px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-500 text-[9px] font-bold border border-brand-500/20 uppercase">
                            {role?.name || roleId}
                          </span>
                        {/each}
                        {#if tr.profit_user}
                          <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 text-[9px] font-bold border border-indigo-500/20 uppercase flex items-center gap-1">
                            <Database size={8} />
                            {tr.profit_user}
                          </span>
                        {/if}
                      </div>
                    {/if}
                  {/each}

                  {#if (!user.globalRoles || user.globalRoles.length === 0) && user.tenantRoles.length === 0}
                    <span class="text-[10px] text-text-muted opacity-50 italic">Sin roles asignados</span>
                  {/if}
                </div>
              </td>
              <td class="px-8 py-5 text-center">
                <form method="POST" action="?/toggleStatus" use:enhance={() => {
                  return async ({ update }) => { await update(); };
                }}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="active" value={user.is_active} />
                  <button 
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                    {user.is_active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-emerald-500/5'}"
                  >
                    <div class="h-1.5 w-1.5 rounded-full {user.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}"></div>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </form>
              </td>
              <td class="px-8 py-5">
                <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onclick={() => openEditModal(user)}
                    class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all"
                    title="Editar"
                  >
                    <Edit2 size={18} />
                  </button>
                  <form 
                    method="POST" 
                    action="?/deleteUser" 
                    use:enhance={({ cancel }) => {
                      if (!confirm(`¿Eliminar al usuario ${user.full_name}?`)) cancel();
                      return async ({ update }) => { await update(); toast.success("Usuario eliminado"); };
                    }}
                  >
                    <input type="hidden" name="userId" value={user.id} />
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
          {:else}
            <tr>
              <td colspan="4" class="px-8 py-20 text-center text-text-muted opacity-50 italic">
                No se encontraron usuarios que coincidan con la búsqueda.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Management Modal -->
{#if showModal}
  <div 
    class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
    transition:fade
    onclick={() => (showModal = false)}
  >
    <div 
      class="bg-surface-raised w-full max-w-xl rounded-[40px] border border-border-subtle shadow-2xl overflow-hidden flex flex-col"
      transition:fly={{ y: 50, duration: 400 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/50">
        <div>
          <h2 class="text-2xl font-bold text-text-base">{isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <p class="text-sm text-text-muted">{isEditing ? 'Actualiza los datos y accesos' : 'Registra un nuevo miembro en el equipo'}</p>
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
        action="?/saveUser" 
        use:enhance={() => {
          loading = true;
          return async ({ update }) => { 
            await update(); 
            loading = false;
          };
        }}
        class="p-8 space-y-8 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar"
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="is_active" value={isActive} />
        <input type="hidden" name="tenantId" value={selectedTenantId ?? ''} />

        <!-- Role Scope Selection (Global vs Tenant) -->
        <div class="space-y-4">
          <label class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Alcance de los Roles</label>
          <div class="flex p-1 bg-surface-base border border-border-subtle rounded-2xl">
            <button 
              type="button"
              onclick={() => selectedTenantId = null}
              class="flex-1 py-3 rounded-xl text-sm font-bold transition-all {selectedTenantId === null ? 'bg-brand-600 text-white shadow-lg' : 'text-text-muted hover:text-text-base'}"
            >
              Globales
            </button>
            <select 
              bind:value={selectedTenantId}
              class="flex-1 bg-transparent py-3 px-4 rounded-xl text-sm font-bold text-text-muted hover:text-text-base outline-none cursor-pointer {selectedTenantId !== null ? 'bg-brand-600/10 text-brand-400' : ''}"
            >
              <option value={null} disabled selected={selectedTenantId === null}>Seleccionar Empresa...</option>
              {#each (data as any).tenants as tenant}
                <option value={tenant.id}>{tenant.name}</option>
              {/each}
            </select>
          </div>
          {#if selectedTenantId}
            <div class="p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 space-y-4">
              <div class="flex items-center gap-3">
                <Building size={16} class="text-brand-400" />
                <p class="text-xs text-text-muted">Asignando roles específicos para la empresa <span class="text-brand-400 font-bold">{(data as any).tenants.find((t: any) => t.id === selectedTenantId)?.name}</span></p>
              </div>
              
              <div class="space-y-2">
                <label for="profit_user" class="text-[10px] font-black uppercase tracking-widest text-brand-500/70 ml-1">ID Usuario en Profit Plus</label>
                <div class="relative">
                  <Database size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400 opacity-40" />
                  <input 
                    id="profit_user"
                    name="profit_user"
                    type="text" 
                    bind:value={profitUser}
                    placeholder="Ej: j_perez"
                    class="w-full bg-surface-base border border-brand-500/20 rounded-2xl pl-12 pr-5 py-4 text-text-base text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all font-mono uppercase"
                  />
                </div>
                <p class="text-[9px] text-text-muted/60 ml-1 italic">Este código vincula las acciones del usuario con su ficha en Profit Plus para esta empresa.</p>
              </div>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Full Name -->
          <div class="space-y-2">
            <label for="full_name" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Nombre Completo</label>
            <input 
              id="full_name"
              name="full_name"
              type="text" 
              required
              bind:value={fullName}
              placeholder="Ej: Juan Pérez"
              class="w-full bg-surface-base border border-border-subtle rounded-2xl px-5 py-4 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
            />
          </div>

          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Correo Electrónico</label>
            <input 
              id="email"
              name="email"
              type="email" 
              required
              bind:value={email}
              placeholder="juan@sync2k.com"
              class="w-full bg-surface-base border border-border-subtle rounded-2xl px-5 py-4 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
            />
          </div>

          <!-- Password -->
          <div class="space-y-2">
            <label for="password" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">
              Contraseña {isEditing ? '(Opcional)' : ''}
            </label>
            <div class="relative">
              <Key size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input 
                id="password"
                name="password"
                type="password" 
                bind:value={password}
                required={!isEditing}
                placeholder={isEditing ? 'Dejar en blanco para no cambiar' : '••••••••'}
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
              />
            </div>
            {#if isEditing}
              <p class="text-[9px] text-text-muted/60 ml-1 italic">Solo completa este campo si deseas cambiar la contraseña del usuario.</p>
            {/if}
          </div>
        </div>

        <!-- Role Selection -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1 flex items-center gap-2">
              <Shield size={14} />
              Roles Asignados
            </label>
            <span class="text-[10px] text-brand-500 font-bold">{selectedRoles.length} seleccionados</span>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {#each data.availableRoles as role}
              <button
                type="button"
                onclick={() => toggleRole(role.id)}
                class="flex items-center justify-between p-4 rounded-2xl border transition-all text-left
                {selectedRoles.includes(role.id) 
                  ? 'bg-brand-500/10 border-brand-500/40 text-brand-500 ring-1 ring-brand-500/30' 
                  : 'bg-surface-base border-border-subtle text-text-muted hover:border-text-muted/50'}"
              >
                <div class="flex flex-col">
                  <span class="text-sm font-bold">{role.name}</span>
                  <span class="text-[10px] opacity-60 truncate max-w-[120px]">{role.id}</span>
                </div>
                {#if selectedRoles.includes(role.id)}
                  <div in:scale={{ duration: 200 }} class="bg-brand-500 text-white rounded-full p-0.5">
                    <Check size={12} strokeWidth={4} />
                  </div>
                {/if}
              </button>
              <!-- Hidden Inputs for formData.getAll('roles') -->
              {#if selectedRoles.includes(role.id)}
                <input type="hidden" name="roles" value={role.id} />
              {/if}
            {/each}
          </div>
        </div>

        <!-- Status Toggle -->
        <div class="flex items-center justify-between p-6 bg-surface-base/50 rounded-3xl border border-border-subtle">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-xl flex items-center justify-center {isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}">
              <Check size={20} />
            </div>
            <div>
              <p class="text-sm font-bold text-text-base">Estado de Cuenta</p>
              <p class="text-xs text-text-muted">{isActive ? 'El usuario puede iniciar sesión' : 'Acceso bloqueado temporalmente'}</p>
            </div>
          </div>
          <button 
            type="button"
            onclick={() => (isActive = !isActive)}
            class="relative w-14 h-8 rounded-full transition-colors duration-300 focus:outline-none"
            class:bg-emerald-500={isActive}
            class:bg-zinc-700={!isActive}
          >
            <div 
              class="absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform duration-300 shadow-lg"
              class:translate-x-6={isActive}
            ></div>
          </button>
        </div>

        <!-- Submit Button -->
        <div class="pt-4">
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
              {isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
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
