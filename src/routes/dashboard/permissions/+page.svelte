<script lang="ts">
  import { enhance } from '$app/forms';
  import { fade, slide } from "svelte/transition";
  import { toast } from 'svelte-sonner';
  import {
    ShieldCheck,
    Save,
    Plus,
    ChevronRight,
    Info,
    Check,
    Trash2,
    LayoutDashboard,
    ShoppingBag,
    DollarSign,
    Package,
    Building,
    Loader2,
  } from "lucide-svelte";
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Estructura de menú (debe coincidir con el nav del dashboard)
  const navStructure = [
    {
      id: "general",
      label: "General",
      icon: LayoutDashboard,
      options: [{ id: "dashboard", label: "Dashboard" }],
    },
    {
      id: "sales",
      label: "Ventas",
      icon: ShoppingBag,
      options: [
        { id: "sales_customers", label: "Clientes" },
        { id: "sales_quotes", label: "Cotizaciones" },
        { id: "sales_orders", label: "Pedidos" },
      ],
    },
    {
      id: "cash",
      label: "Caja",
      icon: DollarSign,
      options: [
        { id: "cash_billing", label: "Facturas / NE" },
        { id: "cash_payments", label: "Cobros" },
        { id: "cash_credits", label: "Devoluciones / NC" },
      ],
    },
    {
      id: "warehouse",
      label: "Almacén",
      icon: Package,
      options: [
        { id: "inv_shipping", label: "Despacho" },
        { id: "inv_void", label: "Anulación" },
      ],
    },
    {
      id: "security",
      label: "Seguridad",
      icon: ShieldCheck,
      options: [
        { id: "sec_users", label: "Usuarios" },
        { id: "sec_roles", label: "Roles y Permisos" },
        { id: "sec_tenants", label: "Empresas" },
        { id: "sec_audit", label: "Auditoría" },
      ],
    },
  ];

  // ── State ──────────────────────────────────────────────────────────────────

  // Lista de roles (usamos data.roles como base inicial)
  let roles = $state(data.roles ?? []);

  // Actualizar la lista local cuando el servidor refresca los datos (ej. tras save/delete)
  $effect(() => {
    if (data.roles) {
      roles = data.roles;
    }
  });

  // Rol actualmente seleccionado
  let selectedRoleId = $state<string | null>(null);
  let roleName = $state("Nuevo Rol");

  // Mapa de permisos para el rol actualmente en edición
  let rolePermissions = $state<Record<string, { read: boolean; create: boolean; update: boolean; delete: boolean }>>({});

  // Categorías expandidas
  let expandedCategories = $state<Record<string, boolean>>({
    general: true, sales: true, cash: true, warehouse: true, security: true,
  });

  // Loader states
  let saving = $state(false);
  let deleting = $state(false);

  // Inicializar permisos vacíos
  function buildEmptyPermissions() {
    const perms: typeof rolePermissions = {};
    navStructure.forEach(cat =>
      cat.options.forEach(opt => {
        perms[opt.id] = { read: false, create: false, update: false, delete: false };
      })
    );
    return perms;
  }

  // ── Seleccionar un rol ─────────────────────────────────────────────────────
  function selectRole(role: { id: string; name: string; permissions: Record<string, any> }) {
    selectedRoleId = role.id;
    roleName = role.name;

    const base = buildEmptyPermissions();
    for (const optId of Object.keys(base)) {
      if (role.permissions[optId]) {
        base[optId] = {
          read:   role.permissions[optId].read   ?? false,
          create: role.permissions[optId].create ?? false,
          update: role.permissions[optId].update ?? false,
          delete: role.permissions[optId].delete ?? false,
        };
      }
    }
    rolePermissions = base;
  }

  // ── Nuevo rol en blanco ────────────────────────────────────────────────────
  function newRole() {
    selectedRoleId = null;
    roleName = "Nuevo Rol";
    rolePermissions = buildEmptyPermissions();
  }

  // Inicializar con permisos vacíos al cargar
  rolePermissions = buildEmptyPermissions();

  function toggleCategory(catId: string) {
    expandedCategories[catId] = !expandedCategories[catId];
  }

  function toggleAll(optionId: string) {
    const p = rolePermissions[optionId];
    const anyOff = !p.read || !p.create || !p.update || !p.delete;
    
    rolePermissions[optionId] = {
      read: anyOff,
      create: anyOff,
      update: anyOff,
      delete: anyOff
    };
  }

  function handleCheckboxChange(optionId: string, action: string) {
    if (action !== "read") {
      const p = rolePermissions[optionId];
      if (p.create || p.update || p.delete) {
        rolePermissions[optionId].read = true;
      }
    }
  }

  // Feedback tras acciones
  $effect(() => {
    if (form?.success) {
      if ('savedId' in form && form.savedId) {
        selectedRoleId = form.savedId as string;
        toast.success(`Rol "${form.savedName}" guardado.`);
      }
      if ('deletedId' in form && form.deletedId) {
        newRole();
        toast.success('Rol eliminado.');
      }
    } else if (form && 'error' in form && form.error) {
      toast.error(form.error as string);
    }
  });
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <ShieldCheck size={40} class="text-brand-500" />
        Roles y Permisos
      </h1>
      <p class="text-text-muted mt-2 text-lg">Configura los accesos dinámicos y permisos del sistema.</p>
    </div>
    <div class="flex items-center gap-3">
      <button
        onclick={newRole}
        class="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-text-base px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
      >
        <Plus size={18} />
        Nuevo
      </button>

      <!-- Save Role form -->
      <form
        method="POST"
        action="?/saveRole"
        use:enhance={() => {
          saving = true;
          return async ({ update }) => { await update(); saving = false; };
        }}
      >
        <input type="hidden" name="roleId" value={selectedRoleId ?? ''} />
        <input type="hidden" name="roleName" value={roleName} />
        <input type="hidden" name="permissions" value={JSON.stringify(rolePermissions)} />
        <button
          type="submit"
          disabled={saving}
          class="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95 shrink-0 disabled:opacity-60"
        >
          {#if saving}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <Save size={18} />
          {/if}
          Guardar Rol
        </button>
      </form>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-4 gap-8">
    <!-- Sidebar -->
    <div class="xl:col-span-1 space-y-6">

      <!-- Roles List -->
      <div class="bg-surface-raised p-6 rounded-3xl border border-border-subtle space-y-4 shadow-sm">
        <h3 class="text-sm font-bold uppercase tracking-widest text-brand-500">Roles Existentes</h3>
        <div class="space-y-2">
          {#if roles.length === 0}
            <p class="text-xs text-text-muted text-center py-4 opacity-60">Sin roles creados aún.</p>
          {:else}
            {#each roles as role (role.id)}
              {@const isUserRole = data.profile?.roles?.some(r => r.id === role.id)}
              <button
                onclick={() => selectRole(role)}
                class="w-full flex items-center justify-between p-3 rounded-xl transition-all text-left border {selectedRoleId === role.id
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
                  : 'bg-surface-base border-transparent text-text-muted hover:bg-brand-500/5 hover:text-brand-500'}"
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm truncate">{role.name}</span>
                    {#if isUserRole}
                      <span class="px-1.5 py-0.5 rounded-md bg-brand-500/10 text-brand-500 text-[8px] font-black uppercase tracking-tighter border border-brand-500/20 shrink-0">
                        Tu Rol
                      </span>
                    {/if}
                  </div>
                  <span class="text-[9px] opacity-40 font-mono italic">{role.id}</span>
                </div>
                <ChevronRight size={14} class="shrink-0" />
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Role Details -->
      <div class="bg-surface-raised p-6 rounded-3xl border border-border-subtle space-y-4 shadow-sm">
        <div class="flex items-center gap-3 text-brand-500 mb-2">
          <ShieldCheck size={24} />
          <h2 class="text-xl font-bold">Detalles</h2>
        </div>

        <div class="space-y-2">
          <label for="roleName" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">
            Nombre del Rol
          </label>
          <input
            id="roleName"
            type="text"
            bind:value={roleName}
            placeholder="Ej: Administrador"
            class="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
          />
        </div>

        <!-- Delete button (only for selected roles) -->
        {#if selectedRoleId}
          <form
            method="POST"
            action="?/deleteRole"
            use:enhance={({ cancel }) => {
              if (!confirm(`¿Eliminar el rol "${roleName}"? Esta acción no se puede deshacer.`)) {
                return cancel();
              }
              deleting = true;
              return async ({ result, update }) => {
                deleting = false;
                if (result.type === 'success' || result.type === 'redirect') {
                   // El $effect de `form` se encargará de actualizar la lista
                   await update();
                } else if (result.type === 'error' || result.type === 'failure') {
                   toast.error('Error al eliminar el rol');
                }
              };
            }}
          >
            <input type="hidden" name="roleId" value={selectedRoleId} />
            <button
              type="submit"
              disabled={deleting}
              class="w-full flex items-center justify-center gap-2 text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-60 text-sm"
            >
              {#if deleting}
                <Loader2 size={16} class="animate-spin" />
              {:else}
                <Trash2 size={16} />
              {/if}
              Eliminar Rol
            </button>
          </form>
        {/if}

        <!-- Legend -->
        <div class="pt-4 border-t border-border-subtle space-y-3">
          <h4 class="text-[10px] uppercase font-bold text-text-muted tracking-widest">Leyenda de Permisos</h4>
          <div class="space-y-2.5">
            <div class="flex items-center gap-3 text-[10px]">
              <div class="w-4 h-4 rounded-md bg-brand-500 shadow-sm shadow-brand-500/20 flex items-center justify-center">
                <Check size={10} class="text-white" strokeWidth={4} />
              </div>
              <span class="font-bold text-text-base">HABILITADO</span>
              <span class="text-text-muted">— El usuario tiene este nivel de acceso</span>
            </div>
            <div class="flex items-center gap-3 text-[10px]">
              <div class="w-4 h-4 rounded-md border-2 border-border-subtle bg-surface-base"></div>
              <span class="font-bold text-text-muted">DESHABILITADO</span>
              <span class="text-text-muted">— Sin acceso o permiso no asignado</span>
            </div>
          </div>
        </div>

        <div class="p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 flex gap-3">
          <Info size={18} class="text-brand-500 shrink-0 mt-0.5" />
          <p class="text-[10px] text-text-muted leading-relaxed">
            Al activar <strong>Crear</strong>, <strong>Editar</strong> o
            <strong>Eliminar</strong>, el permiso de <strong>Lectura</strong> se
            habilita automáticamente.
          </p>
        </div>
      </div>
    </div>

    <!-- Permissions Matrix -->
    <div class="xl:col-span-3">
      <div class="bg-surface-raised rounded-3xl border border-border-subtle overflow-hidden shadow-xl">
        <div class="overflow-x-auto pb-4">
          <table class="w-full min-w-[700px] text-left border-separate border-spacing-0">
            <thead>
              <tr class="bg-surface-base/50">
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted border-b border-border-subtle sticky left-0 bg-surface-raised z-20">Opción</th>
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle">Control</th>
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle">Leer</th>
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle">Crear</th>
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle">Editar</th>
                <th class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle">Eliminar</th>
              </tr>
            </thead>
            <tbody>
              {#each navStructure as category (category.id)}
                <!-- Category Row -->
                <tr
                  class="bg-surface-base/30 hover:bg-surface-base/50 cursor-pointer transition-colors"
                  onclick={() => toggleCategory(category.id)}
                >
                  <td colspan="6" class="px-6 py-3 border-b border-border-subtle sticky left-0 bg-surface-raised/90 backdrop-blur-sm z-10">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="p-1.5 rounded-lg bg-brand-500/10 text-brand-500">
                          <category.icon size={16} />
                        </div>
                        <span class="text-sm font-black uppercase tracking-widest text-brand-500">{category.label}</span>
                      </div>
                      <ChevronRight
                        size={18}
                        class="text-text-muted transition-transform duration-300 {expandedCategories[category.id] ? 'rotate-90' : ''}"
                      />
                    </div>
                  </td>
                </tr>

                <!-- Options under category -->
                {#if expandedCategories[category.id]}
                  {#each category.options as opt}
                    <tr class="hover:bg-brand-500/5 transition-colors group" transition:slide={{ duration: 200 }}>
                      <td class="px-6 py-4 border-b border-border-subtle pl-12 sticky left-0 bg-surface-raised z-10">
                        <span class="text-sm font-medium text-text-base whitespace-nowrap">{opt.label}</span>
                      </td>

                      <!-- Control Total Toggle -->
                      <td class="px-6 py-4 text-center border-b border-border-subtle">
                        <button 
                          type="button" 
                          onclick={() => toggleAll(opt.id)}
                          class="w-6 h-6 rounded-lg border-2 border-brand-500/30 flex items-center justify-center transition-all {rolePermissions[opt.id].read && rolePermissions[opt.id].create && rolePermissions[opt.id].update && rolePermissions[opt.id].delete ? 'bg-brand-500 border-brand-500' : 'hover:bg-brand-500/10'}"
                        >
                          {#if rolePermissions[opt.id].read && rolePermissions[opt.id].create && rolePermissions[opt.id].update && rolePermissions[opt.id].delete}
                            <div in:fade={{ duration: 100 }}>
                              <Check size={14} class="text-white" strokeWidth={4} />
                            </div>
                          {/if}
                        </button>
                      </td>

                      {#each ["read", "create", "update", "delete"] as action}
                        <td class="px-6 py-4 text-center border-b border-border-subtle">
                          <label class="relative inline-flex items-center cursor-pointer justify-center">
                            <input
                              type="checkbox"
                              bind:checked={rolePermissions[opt.id][action as keyof typeof rolePermissions[string]]}
                              onchange={() => handleCheckboxChange(opt.id, action)}
                              class="sr-only peer"
                            />
                            <div class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30">
                              {#if rolePermissions[opt.id][action as keyof typeof rolePermissions[string]]}
                                <div in:fade={{ duration: 100 }}>
                                  <Check size={14} class="text-white" strokeWidth={4} />
                                </div>
                              {/if}
                            </div>
                          </label>
                        </td>
                      {/each}
                    </tr>
                  {/each}
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<style></style>
