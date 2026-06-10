<script lang="ts">
  import { enhance } from "$app/forms";
  import { fade, slide } from "svelte/transition";
  import { toast } from "svelte-sonner";
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
    ShoppingCart,
    Loader2,
    FileText,
    Settings,
  } from "lucide-svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Estructura de menú (debe coincidir con el nav del dashboard)
  const navStructure = [
    {
      id: "general",
      label: "General",
      icon: LayoutDashboard,
      options: [{ id: "dashboard", label: "Dashboard", onlyRead: true }],
    },
    {
      id: "sales",
      label: "Ventas",
      icon: ShoppingBag,
      options: [
        { id: "sales_customers", label: "Clientes", hasOthers: true },
        {
          id: "sales_quotes",
          label: "Cotizaciones",
          hasOthers: true,
          hasVoid: true,
        },
        {
          id: "sales_orders",
          label: "Pedidos",
          hasOthers: true,
          hasVoid: true,
        },
        {
          id: "sales_price_checker",
          label: "Consultor de Precios",
          onlyRead: true,
        },
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
        { id: "cash_exchange", label: "Tasa Cambiaria" },
      ],
    },
    {
      id: "warehouse",
      label: "Almacén",
      icon: Package,
      options: [
        { id: "sec_articles", label: "Ubicaciones" },
        { id: "inv_shipping", label: "Despacho" },
        { id: "inv_void", label: "Anulación" },
      ],
    },
    {
      id: "purchases",
      label: "Compras",
      icon: ShoppingCart,
      options: [
        { id: "pur_articles", label: "Artículos" },
        { id: "pur_lines", label: "Líneas" },
        { id: "pur_sublines", label: "Sub-Líneas" },
        { id: "pur_categories", label: "Categorías" },
        { id: "pur_quotes", label: "Cotizaciones" },
        { id: "pur_orders", label: "Orden de compra" },
        { id: "pur_invoices", label: "Facturas" },
        { id: "pur_payments", label: "Pagos" },
        { id: "pur_returns", label: "Devoluciones" },
      ],
    },
    {
      id: "reports",
      label: "Reportes",
      icon: FileText,
      options: [
        {
          id: "reports_receivables",
          label: "Cuentas por Cobrar",
          hasOthers: true,
          hasVoid: false,
          onlyRead: true,
        },
        {
          id: "reports_payables",
          label: "Cuentas por Pagar",
          hasOthers: true,
          hasVoid: false,
          onlyReadAndEdit: true,
        },
        {
          id: "reports_detailed_account",
          label: "Cuenta Detallada",
          hasOthers: true,
          hasVoid: false,
          onlyRead: true,
        },
        {
          id: "reports_cashier_month",
          label: "Cajero del Mes",
          hasOthers: false,
          hasVoid: false,
          onlyRead: true,
        },
        {
          id: "reports_article_prices",
          label: "Artículos con Precios",
          hasOthers: false,
          hasVoid: false,
          onlyRead: true,
        },
      ],
    },
    {
      id: "security",
      label: "Sistema",
      icon: Settings,
      options: [
        { id: "sec_users", label: "Usuarios" },
        { id: "sec_roles", label: "Roles y Permisos" },
        //{ id: "sec_tenants", label: "Empresas" },
        { id: "sec_branches", label: "Sucursales" },
        { id: "sec_printers", label: "Impresoras" },
        { id: "sec_settings", label: "Parametrización" },
        { id: "sec_audit", label: "Auditoría", onlyRead: true },
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
  let rolePermissions = $state<
    Record<
      string,
      {
        read: boolean;
        create: boolean;
        update: boolean;
        delete: boolean;
        void: boolean;
        others: boolean;
      }
    >
  >({});

  // Categorías expandidas
  let expandedCategories = $state<Record<string, boolean>>({
    general: true,
    sales: true,
    cash: true,
    warehouse: true,
    purchases: true,
    reports: true,
    security: true,
  });

  // Loader states
  let saving = $state(false);
  let deleting = $state(false);

  // Inicializar permisos vacíos
  function buildEmptyPermissions() {
    const perms: typeof rolePermissions = {};
    navStructure.forEach((cat) =>
      cat.options.forEach((opt) => {
        perms[opt.id] = {
          read: false,
          create: false,
          update: false,
          delete: false,
          void: false,
          others: false,
        };
      }),
    );
    return perms;
  }

  let selectedBranchId = $state("");
  let branchIds = $state<string[]>([]);
  let warehouseIds = $state<string[]>([]);

  let availableWarehouses = $state<any[]>([]);
  let loadingContext = $state(false);
  let contextError = $state<string | null>(null);

  let filteredWarehouses = $derived(availableWarehouses);

  async function loadWarehouses(bid: string) {
    if (!bid) return;
    contextError = null;
    loadingContext = true;
    try {
      const wRes = await fetch(`/api/agent/warehouses?branch_id=${bid}`);
      const wData = await wRes.json();

      if (wData.error) throw new Error(`Almacenes (${bid}): ${wData.error}`);

      // Agregamos los nuevos almacenes a la lista de disponibles (evitando duplicados)
      const newWs = wData.warehouses || [];
      const currentIds = new Set(
        availableWarehouses.map((w) => w.co_alma || w.id),
      );

      const filteredNew = newWs.filter(
        (w: any) => !currentIds.has(w.co_alma || w.id),
      );
      availableWarehouses = [...availableWarehouses, ...filteredNew];
    } catch (e: any) {
      console.error("Error loading context", e);
      contextError = e.message;
    } finally {
      loadingContext = false;
    }
  }

  // ── Seleccionar un rol ─────────────────────────────────────────────────────
  async function selectRole(role: {
    id: string;
    name: string;
    permissions: Record<string, any>;
    tenant_id?: string;
    branch_ids?: string[];
    warehouse_ids?: string[];
  }) {
    selectedRoleId = role.id;
    roleName = role.name;
    branchIds = role.branch_ids || [];
    warehouseIds = role.warehouse_ids || [];
    availableWarehouses = []; // Reset list to load fresh for this role

    // Cargamos almacenes de todas las sedes del rol
    if (branchIds.length > 0) {
      for (const bid of branchIds) {
        await loadWarehouses(bid);
      }
    }

    const base = buildEmptyPermissions();
    for (const optId of Object.keys(base)) {
      if (role.permissions[optId]) {
        base[optId] = {
          read: role.permissions[optId].read ?? false,
          create: role.permissions[optId].create ?? false,
          update: role.permissions[optId].update ?? false,
          delete: role.permissions[optId].delete ?? false,
          void: role.permissions[optId].void ?? false,
          others: role.permissions[optId].others ?? false,
        };
      }
    }
    rolePermissions = base;
  }

  // ── Nuevo rol en blanco ────────────────────────────────────────────────────
  function newRole() {
    selectedRoleId = null;
    roleName = "Nuevo Rol";
    selectedBranchId = "";
    branchIds = [];
    warehouseIds = [];
    availableWarehouses = [];
    rolePermissions = buildEmptyPermissions();
  }

  // Inicializar con permisos vacíos al cargar
  rolePermissions = buildEmptyPermissions();

  function toggleCategory(catId: string) {
    expandedCategories[catId] = !expandedCategories[catId];
  }

  function toggleAll(optionId: string) {
    const p = rolePermissions[optionId];
    // Buscamos si el módulo tiene la opción 'others' o 'void' habilitada estructuralmente
    const option = navStructure
      .flatMap((n) => n.options)
      .find((o) => o.id === optionId);
    const supportsOthers = (option as any)?.hasOthers || false;
    const supportsVoid = (option as any)?.hasVoid || false;
    const onlyRead = (option as any)?.onlyRead || false;
    const onlyReadAndEdit = (option as any)?.onlyReadAndEdit || false;

    let anyOff = false;
    if (onlyRead) {
      anyOff = !p.read || (supportsOthers && !p.others);
      rolePermissions[optionId] = {
        read: anyOff,
        create: false,
        update: false,
        delete: false,
        void: false,
        others: supportsOthers ? anyOff : false,
      };
    } else if (onlyReadAndEdit) {
      anyOff = !p.read || !p.update || (supportsOthers && !p.others);
      rolePermissions[optionId] = {
        read: anyOff,
        create: false,
        update: anyOff,
        delete: false,
        void: false,
        others: supportsOthers ? anyOff : false,
      };
    } else {
      anyOff =
        !p.read ||
        !p.create ||
        !p.update ||
        !p.delete ||
        (supportsOthers && !p.others) ||
        (supportsVoid && !p.void);
      rolePermissions[optionId] = {
        read: anyOff,
        create: anyOff,
        update: anyOff,
        delete: anyOff,
        void: anyOff,
        others: anyOff,
      };
    }
  }

  function handleCheckboxChange(optionId: string, action: string) {
    if (action !== "read") {
      const p = rolePermissions[optionId];
      if (p.create || p.update || p.delete || p.others || p.void) {
        rolePermissions[optionId].read = true;
      }
    }
  }

  // Feedback tras acciones
  $effect(() => {
    if (form?.success) {
      if ("savedId" in form && form.savedId) {
        selectedRoleId = form.savedId as string;
        toast.success(`Rol "${form.savedName}" guardado.`);
      }
      if ("deletedId" in form && form.deletedId) {
        newRole();
        toast.success("Rol eliminado.");
      }
    } else if (form && "error" in form && form.error) {
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
      <p class="text-text-muted mt-2 text-lg">
        Configura los accesos dinámicos y permisos del sistema.
      </p>
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
          return async ({ update }) => {
            await update();
            saving = false;
          };
        }}
      >
        <input type="hidden" name="roleId" value={selectedRoleId ?? ""} />
        <input type="hidden" name="roleName" value={roleName} />
        <input
          type="hidden"
          name="branchIds"
          value={JSON.stringify(branchIds)}
        />
        <input
          type="hidden"
          name="warehouseIds"
          value={JSON.stringify(warehouseIds)}
        />
        <input
          type="hidden"
          name="permissions"
          value={JSON.stringify(rolePermissions)}
        />
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
      <div
        class="bg-surface-raised p-6 rounded-3xl border border-border-subtle space-y-4 shadow-sm"
      >
        <h3 class="text-sm font-bold uppercase tracking-widest text-brand-500">
          Roles Existentes
        </h3>
        <div class="space-y-2">
          {#if roles.length === 0}
            <p class="text-xs text-text-muted text-center py-4 opacity-60">
              Sin roles creados aún.
            </p>
          {:else}
            {#each roles as role (role.id)}
              {@const isUserRole = data.profile?.roles?.some(
                (r) => r.id === role.id,
              )}
              <button
                onclick={() => selectRole(role)}
                class="w-full flex items-center justify-between p-3 rounded-xl transition-all text-left border {selectedRoleId ===
                role.id
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
                  : 'bg-surface-base border-transparent text-text-muted hover:bg-brand-500/5 hover:text-brand-500'}"
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm truncate">{role.name}</span
                    >
                    {#if isUserRole}
                      <span
                        class="px-1.5 py-0.5 rounded-md bg-brand-500/10 text-brand-500 text-[8px] font-black uppercase tracking-tighter border border-brand-500/20 shrink-0"
                      >
                        Tu Rol
                      </span>
                    {/if}
                  </div>
                  <span class="text-[9px] opacity-40 font-mono italic"
                    >{role.id}</span
                  >
                </div>
                <ChevronRight size={14} class="shrink-0" />
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Role Details -->
      <div
        class="bg-surface-raised p-6 rounded-3xl border border-border-subtle space-y-4 shadow-sm"
      >
        <div class="flex items-center gap-3 text-brand-500 mb-2">
          <ShieldCheck size={24} />
          <h2 class="text-xl font-bold">Detalles</h2>
        </div>

        <div class="space-y-2">
          <label
            for="roleName"
            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
          >
            Nombre del Rol
          </label>
          <input
            id="roleName"
            type="text"
            bind:value={roleName}
            placeholder="Ej: Administrador"
            class="w-full h-12 bg-surface-base border border-border-subtle rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
          />
        </div>

        <div class="space-y-4 pt-2 border-t border-border-subtle mt-4">
          <div class="space-y-3">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-brand-400 ml-1 flex items-center gap-1.5"
            >
              <Building size={12} />
              Sucursales Autorizadas
            </label>

            <div
              class="bg-surface-base border border-border-subtle rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto"
            >
              {#each data.branches as branch}
                <label
                  class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    bind:group={branchIds}
                    value={branch.id}
                    onchange={(e) => {
                      if (e.currentTarget.checked) {
                        loadWarehouses(branch.id);
                      } else {
                        // Opcional: filtrar disponibleWarehouses para quitar los de esta sede si no están seleccionados
                        // Por simplicidad los dejamos ahí, solo se enviarán si están en warehouseIds
                      }
                    }}
                    class="w-4 h-4 rounded border-border-subtle text-brand-500 focus:ring-brand-500 bg-black/20"
                  />
                  <div class="flex flex-col">
                    <span class="text-sm font-bold">{branch.name}</span>
                    <span class="text-[9px] text-text-muted opacity-60 truncate"
                      >{branch.agent_url}</span
                    >
                  </div>
                </label>
              {/each}
            </div>
          </div>

          {#if branchIds.length > 0}
            <div class="space-y-3">
              <label
                for="warehouseIds"
                class="text-[10px] font-black uppercase tracking-widest text-brand-400 ml-1"
              >
                Restringir a Almacenes (Multisede)
              </label>
              {#if loadingContext && availableWarehouses.length === 0}
                <div
                  class="h-12 flex items-center px-4 text-text-muted text-sm bg-surface-base rounded-xl border border-border-subtle"
                >
                  <Loader2 size={16} class="animate-spin mr-2" /> Cargando...
                </div>
              {:else if availableWarehouses.length === 0 && !loadingContext}
                <div
                  class="h-12 flex items-center px-4 text-text-muted text-sm bg-surface-base rounded-xl border border-border-subtle opacity-50"
                >
                  Marca una sucursal para ver sus almacenes
                </div>
              {:else}
                <div
                  class="bg-surface-base border border-border-subtle rounded-xl p-3 flex flex-col gap-2 max-h-60 overflow-y-auto"
                >
                  {#each availableWarehouses as warehouse}
                    {@const wid = warehouse.co_alma || warehouse.id}
                    <label
                      class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        bind:group={warehouseIds}
                        value={wid}
                        class="w-4 h-4 rounded border-border-subtle text-brand-500 focus:ring-brand-500 bg-black/20"
                      />
                      <div class="flex flex-col">
                        <span class="text-sm font-medium"
                          >{warehouse.des_alma || warehouse.name || wid}</span
                        >
                        <span class="text-[9px] opacity-40 font-mono italic"
                          >ID: {wid}</span
                        >
                      </div>
                    </label>
                  {/each}
                  {#if loadingContext}
                    <div
                      class="flex items-center justify-center py-2 opacity-50"
                    >
                      <Loader2 size={12} class="animate-spin mr-2" /> Actualizando
                      lista...
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            {#if contextError}
              <div
                class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold mt-2"
              >
                Error de red: {contextError}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Delete button (only for selected roles) -->
        {#if selectedRoleId}
          <form
            method="POST"
            action="?/deleteRole"
            use:enhance={({ cancel }) => {
              if (
                !confirm(
                  `¿Eliminar el rol "${roleName}"? Esta acción no se puede deshacer.`,
                )
              ) {
                return cancel();
              }
              deleting = true;
              return async ({ result, update }) => {
                deleting = false;
                if (result.type === "success" || result.type === "redirect") {
                  // El $effect de `form` se encargará de actualizar la lista
                  await update();
                } else if (
                  result.type === "error" ||
                  result.type === "failure"
                ) {
                  toast.error("Error al eliminar el rol");
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
          <h4
            class="text-[10px] uppercase font-bold text-text-muted tracking-widest"
          >
            Leyenda de Permisos
          </h4>
          <div class="space-y-2.5">
            <div class="flex items-center gap-3 text-[10px]">
              <div
                class="w-4 h-4 rounded-md bg-brand-500 shadow-sm shadow-brand-500/20 flex items-center justify-center"
              >
                <Check size={10} class="text-white" strokeWidth={4} />
              </div>
              <span class="font-bold text-text-base">HABILITADO</span>
              <span class="text-text-muted"
                >— El usuario tiene este nivel de acceso</span
              >
            </div>
            <div class="flex items-center gap-3 text-[10px]">
              <div
                class="w-4 h-4 rounded-md border-2 border-border-subtle bg-surface-base"
              ></div>
              <span class="font-bold text-text-muted">DESHABILITADO</span>
              <span class="text-text-muted"
                >— Sin acceso o permiso no asignado</span
              >
            </div>
          </div>
        </div>

        <div
          class="p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 flex gap-3"
        >
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
      <div
        class="bg-surface-raised rounded-3xl border border-border-subtle overflow-hidden shadow-xl"
      >
        <div class="overflow-x-auto pb-4">
          <table
            class="w-full min-w-[700px] text-left border-separate border-spacing-0"
          >
            <thead>
              <tr class="bg-surface-base/50">
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted border-b border-border-subtle sticky left-0 bg-surface-raised z-20"
                  >Opción</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Control</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Leer</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Crear</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Editar</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Eliminar</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Anular</th
                >
                <th
                  class="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-muted text-center border-b border-border-subtle"
                  >Terceros</th
                >
              </tr>
            </thead>
            <tbody>
              {#each navStructure as category (category.id)}
                <!-- Category Row -->
                <tr
                  class="bg-surface-base/30 hover:bg-surface-base/50 cursor-pointer transition-colors"
                  onclick={() => toggleCategory(category.id)}
                >
                  <td
                    colspan="8"
                    class="px-6 py-3 border-b border-border-subtle sticky left-0 bg-surface-raised/90 backdrop-blur-sm z-10"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div
                          class="p-1.5 rounded-lg bg-brand-500/10 text-brand-500"
                        >
                          <category.icon size={16} />
                        </div>
                        <span
                          class="text-sm font-black uppercase tracking-widest text-brand-500"
                          >{category.label}</span
                        >
                      </div>
                      <ChevronRight
                        size={18}
                        class="text-text-muted transition-transform duration-300 {expandedCategories[
                          category.id
                        ]
                          ? 'rotate-90'
                          : ''}"
                      />
                    </div>
                  </td>
                </tr>

                <!-- Options under category -->
                {#if expandedCategories[category.id]}
                  {#each category.options as opt}
                    <tr
                      class="hover:bg-brand-500/5 transition-colors group"
                      transition:slide={{ duration: 200 }}
                    >
                      <td
                        class="px-6 py-4 border-b border-border-subtle pl-12 sticky left-0 bg-surface-raised z-10"
                      >
                        <span
                          class="text-sm font-medium text-text-base whitespace-nowrap"
                          >{opt.label}</span
                        >
                      </td>

                      <!-- Control Total Toggle -->
                      <td
                        class="px-6 py-4 text-center border-b border-border-subtle"
                      >
                        {#if opt.id !== "cash_exchange"}
                          <button
                            type="button"
                            onclick={() => toggleAll(opt.id)}
                            class="w-6 h-6 rounded-lg border-2 border-brand-500/30 flex items-center justify-center transition-all {(
                              opt.onlyRead
                                ? rolePermissions[opt.id].read &&
                                  (opt.hasOthers
                                    ? rolePermissions[opt.id].others
                                    : true)
                                : opt.onlyReadAndEdit
                                  ? rolePermissions[opt.id].read &&
                                    rolePermissions[opt.id].update &&
                                    (opt.hasOthers
                                      ? rolePermissions[opt.id].others
                                      : true)
                                  : rolePermissions[opt.id].read &&
                                    rolePermissions[opt.id].create &&
                                    rolePermissions[opt.id].update &&
                                    rolePermissions[opt.id].delete &&
                                    (opt.hasOthers
                                      ? rolePermissions[opt.id].others
                                      : true) &&
                                    (opt.hasVoid
                                      ? rolePermissions[opt.id].void
                                      : true)
                            )
                              ? 'bg-brand-500 border-brand-500'
                              : 'hover:bg-brand-500/10'}"
                          >
                            {#if opt.onlyRead ? rolePermissions[opt.id].read && (opt.hasOthers ? rolePermissions[opt.id].others : true) : opt.onlyReadAndEdit ? rolePermissions[opt.id].read && rolePermissions[opt.id].update && (opt.hasOthers ? rolePermissions[opt.id].others : true) : rolePermissions[opt.id].read && rolePermissions[opt.id].create && rolePermissions[opt.id].update && rolePermissions[opt.id].delete && (opt.hasOthers ? rolePermissions[opt.id].others : true) && (opt.hasVoid ? rolePermissions[opt.id].void : true)}
                              <div in:fade={{ duration: 100 }}>
                                <Check
                                  size={14}
                                  class="text-white"
                                  strokeWidth={4}
                                />
                              </div>
                            {/if}
                          </button>
                        {:else}
                          <span class="text-[9px] text-text-muted/20">—</span>
                        {/if}
                      </td>

                      {#each ["read", "create", "update", "delete", "void", "others"] as action}
                        <td
                          class="px-6 py-4 text-center border-b border-border-subtle"
                        >
                          {#if opt.onlyRead ? action === "read" || (action === "others" && opt.hasOthers) : opt.onlyReadAndEdit ? action === "read" || action === "update" || (action === "others" && opt.hasOthers) : (opt.id !== "cash_exchange" && (action !== "others" || opt.hasOthers) && (action !== "void" || opt.hasVoid)) || (opt.id === "cash_exchange" && action === "update")}
                            <label
                              class="relative inline-flex items-center cursor-pointer justify-center"
                            >
                              <input
                                type="checkbox"
                                bind:checked={
                                  rolePermissions[opt.id][
                                    action as keyof (typeof rolePermissions)[string]
                                  ]
                                }
                                onchange={() => {
                                  handleCheckboxChange(opt.id, action);
                                  // Forzar read=true si es cash_exchange y se marca update
                                  if (
                                    opt.id === "cash_exchange" &&
                                    action === "update" &&
                                    rolePermissions[opt.id].update
                                  ) {
                                    rolePermissions[opt.id].read = true;
                                  }
                                }}
                                class="sr-only peer"
                              />
                              <div
                                class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                              >
                                {#if rolePermissions[opt.id][action as keyof (typeof rolePermissions)[string]]}
                                  <div in:fade={{ duration: 100 }}>
                                    <Check
                                      size={14}
                                      class="text-white"
                                      strokeWidth={4}
                                    />
                                  </div>
                                {/if}
                              </div>
                            </label>
                          {:else}
                            <span class="text-[9px] text-text-muted/20">—</span>
                          {/if}
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
