<script lang="ts">
  import { fade, fly, scale } from "svelte/transition";
  import { enhance } from "$app/forms";
  import {
    Building2,
    Search,
    Plus,
    Mail,
    Phone,
    MapPin,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Loader2,
    Hash,
    Edit2,
    Trash2,
    X,
    Check,
    Lock,
    Briefcase,
    Tag,
    Box,
    Store,
    User,
    CreditCard,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let searchQuery = $state(data.search || "");

  // Permisos CRUD del usuario para esta sección
  const canCreate = data.crud?.create ?? false;
  const canUpdate = data.crud?.update ?? false;
  const canDelete = data.crud?.delete ?? false;
  let isSearching = $state(false);
  let showModal = $state(false);
  let isEditing = $state(false);
  let loading = $state(false);

  // Estados para Eliminación con Clave
  let showDeleteModal = $state(false);
  let supplierToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Form State
  let co_prov = $state("");
  let descripcion = $state("");
  let respons = $state("");
  let rif = $state("");
  let telefonos = $state("");
  let email = $state("");
  let direccion = $state("");
  let co_zon = $state("");
  let co_seg = $state("01");
  let cond_pag = $state("01");
  let tip_pro = $state("");

  // Tax Info State
  let contribuyente = $state(false);
  let tipo_per = $state("3"); // 3 = PJD (Persona Jurídica Domiciliada) por defecto para proveedores
  let contribu_e = $state(false);
  let porc_esp = $state(75);

  let selectedTenant = $state("");
  let selectedBranch = $state("");

  $effect(() => {
    selectedTenant =
      data.context?.tenantId || $page.url.searchParams.get("tenant_id") || "";

    const branches = data.context?.branches || [];
    if (branches.length === 1) {
      selectedBranch = branches[0].id;
    } else {
      selectedBranch =
        data.context?.branchId || $page.url.searchParams.get("branch_id") || "";
    }
  });

  $effect(() => {
    contribu_e = contribuyente;
  });

  let localSuppliers = $state(data.suppliers || []);
  let localPagination = $state(
    data.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 },
  );
  let loadingSuppliers = $state(false);

  // Sincronizar con datos del servidor (navegación estándar)
  $effect(() => {
    localSuppliers = data.suppliers || [];
    localPagination =
      data.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 };
    searchQuery = data.search || "";
  });

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL(window.location.href);

    if (searchQuery) url.searchParams.set("search", searchQuery);
    else url.searchParams.delete("search");

    if (selectedTenant) url.searchParams.set("tenant_id", selectedTenant);
    else url.searchParams.delete("tenant_id");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    url.searchParams.set("page", "1");
    goto(url.toString(), { replaceState: true, keepFocus: true }).finally(
      () => {
        isSearching = false;
      },
    );
  }

  function changePage(newPage: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", newPage.toString());
    goto(url.toString());
  }

  function openCreateModal() {
    isEditing = false;
    co_prov = "";
    descripcion = "";
    respons = "";
    rif = "";
    telefonos = "";
    email = "";
    direccion = "";
    co_zon = "";
    co_seg = "01";
    cond_pag = data.context?.condicionesPago?.[0]?.co_cond || "01";
    tip_pro = "";
    contribuyente = false;
    tipo_per = "3";
    contribu_e = false;
    porc_esp = 75;
    showModal = true;
  }

  function openEditModal(supplier: any) {
    isEditing = true;
    co_prov = supplier.co_prov;
    descripcion = supplier.descripcion || supplier.prov_des;
    respons = supplier.respons || "";
    rif = supplier.rif;
    telefonos = supplier.telefonos;
    email = supplier.email;
    direccion = supplier.direc1 || supplier.direccion || "";
    co_zon = supplier.co_zon || "";
    co_seg = supplier.co_seg || "01";
    cond_pag = supplier.cond_pag || "01";
    tip_pro = supplier.tip_pro || "";
    contribuyente =
      supplier.contribu_e ?? supplier.contrib ?? supplier.contribuyente ?? false;
    tipo_per = supplier.sTipo_Per || supplier.tipo_per || "3";
    contribu_e = supplier.contribu_e ?? false;
    porc_esp = supplier.porc_esp ?? 75;
    showModal = true;
    selectedBranch = data.selectedBranchId || data.context?.branchId || "";
  }

  $effect(() => {
    if (form?.success) {
      toast.success(
        form.message || (isEditing ? "Proveedor actualizado" : "Proveedor creado"),
      );
      showModal = false;
    } else if (form?.message) {
      toast.error(form.message);
    }
    if (data.error) {
      toast.error(data.error);
    }
  });

  function openDeleteModal(supplier: any) {
    supplierToDelete = supplier;
    deletePassword = "";
    selectedBranch =
      selectedBranch || data.selectedBranchId || data.context?.branchId || "";
    showDeleteModal = true;
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Building2 size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Consulta y gestiona la cartera de proveedores de Profit Plus en tiempo real.
      </p>
    </div>

    {#if canCreate}
      <button
        onclick={openCreateModal}
        class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95"
      >
        <Plus size={20} />
        Nuevo Proveedor
      </button>
    {/if}
  </div>

  <!-- Search, Filters and Stats -->
  <div class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center relative z-10 mb-8 w-full">
    {#if (data.tenants?.length ?? 0) > 1}
      <div class="w-full">
        <Combobox
          options={(data.tenants || []).map((t: any) => ({ value: t.id, label: t.name }))}
          bind:value={selectedTenant}
          placeholder="Seleccionar Empresa..."
          allLabel="Todas las Empresas"
          icon={Box}
          class="w-full h-14"
          onchange={() => handleSearch()}
        />
      </div>
    {:else if data.tenants?.length === 1 || data.context?.tenantId}
      <div class="h-14 bg-surface-base border border-white/10 rounded-2xl px-6 flex items-center gap-3 w-full">
        <Box class="text-brand-400 shrink-0" size={18} />
        <span class="font-bold text-sm text-brand-100 truncate">
          {data.tenants?.[0]?.name || data.context?.tenantId || "Empresa"}
        </span>
      </div>
    {/if}

    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={(data.branches || []).map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-14"
          onchange={() => handleSearch()}
        />
      </div>
    {/if}

    <div class="w-full">
      <SearchBar 
        bind:value={searchQuery} 
        {isSearching} 
        onsubmit={handleSearch} 
        placeholder="Buscar por nombre, código o RIF..."
        className="w-full h-14"
      />
    </div>
  </div>

  {#if data.error}
    <div
      class="glass border-red-500/20 p-12 rounded-[40px] flex flex-col items-center justify-center text-center space-y-4"
    >
      <div
        class="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500"
      >
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
  {:else}
    <!-- Table -->
    <div
      class="glass rounded-[40px] border border-white/5 overflow-hidden shadow-2xl"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/2">
              <th
                class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted"
                >Proveedor</th
              >
              <th
                class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted"
                >Identidad</th
              >
              <th
                class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted"
                >Contacto</th
              >
              <th
                class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted text-right"
                >Acciones</th
              >
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#if loadingSuppliers}
              <tr>
                <td colspan="4" class="px-8 py-20 text-center">
                  <div class="flex flex-col items-center gap-4">
                    <div
                      class="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"
                    ></div>
                    <p class="text-sm font-bold text-text-muted animate-pulse">
                      Consultando Profit Plus...
                    </p>
                  </div>
                </td>
              </tr>
            {:else}
              {#each localSuppliers as supplier}
                <tr
                  class="group hover:bg-white/2 transition-colors cursor-pointer"
                >
                  <td class="px-8 py-6">
                    <div class="flex items-center gap-4">
                      <div
                        class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 font-black shadow-inner"
                      >
                        {supplier.descripcion?.charAt(0) || supplier.prov_des?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p
                          class="font-bold text-text-base group-hover:text-brand-400 transition-colors uppercase leading-none mb-1 text-sm"
                        >
                          {supplier.descripcion || supplier.prov_des}
                        </p>
                        <div
                          class="flex items-center gap-2 text-xs text-text-muted"
                        >
                          <Hash size={12} class="opacity-50" />
                          <span class="font-mono">{supplier.co_prov}</span>
                          {#if supplier.tip_pro_des}
                            <span class="text-[10px] bg-white/5 px-2 py-0.5 rounded text-text-muted">
                              {supplier.tip_pro_des}
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-8 py-6">
                    <div class="space-y-1.5">
                      <div class="flex items-center gap-2">
                        <span
                          class="text-[10px] font-black uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded border border-white/10 text-text-muted"
                          >RIF</span
                        >
                        <span class="text-sm font-medium text-text-base"
                          >{supplier.rif || "---"}</span
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <MapPin size={12} class="text-indigo-400" />
                        <span
                          class="text-[11px] text-text-muted truncate max-w-[200px]"
                          >{supplier.direc1 ||
                            supplier.sede_nombre ||
                            "Principal"}</span
                        >
                      </div>
                    </div>
                  </td>
                  <td class="px-8 py-6">
                    <div class="space-y-1.5">
                      {#if supplier.respons}
                        <div class="flex items-center gap-2 text-xs">
                          <User size={12} class="text-amber-400 shrink-0" />
                          <span class="font-bold text-text-base truncate max-w-[180px]">{supplier.respons}</span>
                        </div>
                      {/if}
                      {#if supplier.telefonos}
                        <div class="flex items-center gap-2 text-xs">
                          <Phone size={12} class="text-green-400 shrink-0" />
                          <span class="text-text-muted"
                            >{supplier.telefonos}</span
                          >
                        </div>
                      {/if}
                      {#if supplier.email}
                        <div class="flex items-center gap-2 text-xs">
                          <Mail size={12} class="text-blue-400 shrink-0" />
                          <span class="text-text-muted truncate max-w-[180px]"
                            >{supplier.email}</span
                          >
                        </div>
                      {:else if !supplier.respons && !supplier.telefonos}
                        <span
                          class="text-[10px] text-text-muted/40 uppercase italic"
                          >Sin contacto</span
                        >
                      {/if}
                    </div>
                  </td>
                  <td class="px-8 py-6">
                    <div
                      class="flex items-center justify-end gap-2 transition-opacity"
                    >
                      {#if canUpdate}
                        <button
                          onclick={() => openEditModal(supplier)}
                          class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                      {/if}
                      {#if canDelete}
                        <button
                          onclick={() => openDeleteModal(supplier)}
                          class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
              {#if !loadingSuppliers && localSuppliers.length === 0}
                <tr>
                  <td colspan="4" class="px-8 py-32 text-center bg-white/2">
                    <div
                      class="flex flex-col items-center gap-6 max-w-md mx-auto"
                    >
                      <div
                        class="h-24 w-24 rounded-full bg-white/5 flex items-center justify-center text-text-muted/20"
                      >
                        <Search size={48} />
                      </div>
                      <div>
                        <h3 class="text-2xl font-black text-text-base mb-2">
                          No se encontraron proveedores
                        </h3>
                        <p
                          class="text-text-muted font-medium text-sm leading-relaxed"
                        >
                          Pruebe con otros términos de búsqueda o verifique la
                          sede seleccionada en Profit Plus.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      {#if localPagination && localPagination.totalPages > 1}
        <div
          class="px-8 py-6 bg-white/1 border-t border-white/5 flex items-center justify-between"
        >
          <p
            class="text-xs font-bold text-text-muted uppercase tracking-widest"
          >
            Página <span class="text-text-base">{localPagination.page}</span>
            de <span class="text-text-base">{localPagination.totalPages}</span>
            (Total: {localPagination.total})
          </p>

          <div class="flex gap-2">
            <button
              onclick={() => {
                if (localPagination.page > 1) {
                  changePage(localPagination.page - 1);
                }
              }}
              disabled={localPagination.page <= 1}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              onclick={() => {
                if (localPagination.page < localPagination.totalPages) {
                  changePage(localPagination.page + 1);
                }
              }}
              disabled={localPagination.page >= localPagination.totalPages}
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
  {@const handleBackdropClose = (e: MouseEvent) => {
    if (e.target === e.currentTarget) showModal = false;
  }}
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 text-text-base"
    transition:fade
    onmousedown={handleBackdropClose}
  >
    <div
      class="bg-surface-raised w-full max-w-2xl rounded-[40px] border border-border-subtle shadow-2xl overflow-hidden flex flex-col"
      transition:fly={{ y: 50, duration: 400 }}
      onmousedown={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && (showModal = false)}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div
        class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/50"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-inner"
          >
            <Building2 size={24} />
          </div>
          <div>
            <h2 class="text-2xl font-bold">
              {isEditing ? "Editar Proveedor" : "Nuevo Proveedor"}
            </h2>
            <p class="text-sm text-text-muted">
              {isEditing
                ? "Actualiza la ficha técnica del proveedor"
                : "Registra un nuevo proveedor en el sistema local"}
            </p>
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
        action="?/saveSupplier"
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
        <input type="hidden" name="tenant_id" value={selectedTenant} />
        <input type="hidden" name="branch_id" value={selectedBranch} />
        <input type="hidden" name="co_prov" value={isEditing ? co_prov : rif} />
        <input type="hidden" name="tip_pro" value={tip_pro} />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- RIF -->
          <div class="space-y-2">
            <label
              for="rif"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >RIF / Identificación</label
            >
            <div class="relative">
              <Tag
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="rif"
                name="rif"
                type="text"
                required
                bind:value={rif}
                placeholder="Ej: J123456789"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Tipo Proveedor -->
          <div class="space-y-2">
            <label
              for="tip_pro"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Tipo de Proveedor</label
            >
            <Combobox
              options={(data.context?.tiposProveedor || []).map((tp: any) => ({ value: tp.tip_pro, label: tp.des_tipo }))}
              bind:value={tip_pro}
              placeholder="Seleccione tipo de proveedor..."
              allLabel="Sin tipo"
              icon={Briefcase}
            />
          </div>

          <!-- Description -->
          <div class="md:col-span-2 space-y-2">
            <label
              for="descripcion"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Razón Social / Nombre</label
            >
            <div class="relative">
              <Building2
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="descripcion"
                name="descripcion"
                type="text"
                required
                bind:value={descripcion}
                placeholder="Nombre del Proveedor"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Contacto / Responsable -->
          <div class="space-y-2">
            <label
              for="respons"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Contacto (Persona de Contacto)</label
            >
            <div class="relative">
              <User
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="respons"
                name="respons"
                type="text"
                bind:value={respons}
                placeholder="Ej: Juan Pérez"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Phone -->
          <div class="space-y-2">
            <label
              for="telefonos"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Teléfonos</label
            >
            <div class="relative">
              <Phone
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="telefonos"
                name="telefonos"
                type="text"
                bind:value={telefonos}
                placeholder="+584120000000"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Email -->
          <div class="md:col-span-2 space-y-2">
            <label
              for="email"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Correo Electrónico</label
            >
            <div class="relative">
              <Mail
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="email"
                name="email"
                type="email"
                bind:value={email}
                placeholder="proveedor@ejemplo.com"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Address -->
          <div class="md:col-span-2 space-y-2">
            <label
              for="direccion"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Dirección Fiscal</label
            >
            <div class="relative">
              <MapPin
                size={18}
                class="absolute left-4 top-6 text-text-muted opacity-40"
              />
              <textarea
                id="direccion"
                name="direc1"
                rows="3"
                bind:value={direccion}
                placeholder="Calle, Av, Edificio..."
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all resize-none font-medium"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Extra Info & Tax Data -->
        <div class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Zone -->
            <div class="space-y-2">
              <label for="co_zon" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Zona Geográfica</label>
              <input type="hidden" name="co_zon" value={co_zon} />
              <Combobox
                options={(data.context?.zonas || []).map((z: any) => ({ value: z.co_zon, label: z.zon_des }))}
                bind:value={co_zon}
                placeholder="Seleccione una zona..."
                allLabel="Sin zona"
                icon={MapPin}
              />
            </div>

            <!-- Segmento -->
            <div class="space-y-2">
              <label for="co_seg" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Segmento</label>
              <input type="hidden" name="co_seg" value={co_seg} />
              <Combobox
                options={[
                  { value: "01", label: "01 - Detal" },
                  { value: "02", label: "02 - Mayor" }
                ]}
                bind:value={co_seg}
                placeholder="Seleccione segmento..."
                icon={Tag}
              />
            </div>

            <!-- Condición de Pago -->
            <div class="md:col-span-2 space-y-2">
              <label for="cond_pag" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Condición de Pago</label>
              <input type="hidden" name="cond_pag" value={cond_pag} />
              <Combobox
                options={(data.context?.condicionesPago || []).map((cp: any) => ({
                  value: cp.co_cond,
                  label: `${cp.co_cond} - ${cp.cond_des}${cp.dias_cred ? ` (${cp.dias_cred} días)` : ''}`
                }))}
                bind:value={cond_pag}
                placeholder="Seleccione condición de pago..."
                allLabel="Sin condición"
                icon={CreditCard}
              />
            </div>
          </div>

          <!-- Contribuyente Toggle -->
          <div
            class="flex items-center justify-between p-4 bg-surface-base border border-border-subtle rounded-2xl h-[60px]"
          >
            <span class="text-sm font-bold text-text-base">Contribuyente Especial / Retención</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="contribuyente"
                value="true"
                bind:checked={contribuyente}
                class="sr-only peer"
              />
              <div
                class="w-11 h-6 bg-border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"
              ></div>
            </label>
          </div>

          {#if contribuyente}
            <div
              class="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <input type="hidden" name="contribu_e" value="true" />
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Tipo de Persona -->
                <div class="space-y-2">
                  <label for="tipo_per" class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Tipo de Persona</label>
                  <input type="hidden" name="tipo_per" value={tipo_per} />
                  <Combobox
                    options={[
                      { value: '1', label: '(PNR) Persona Natural Residente' },
                      { value: '2', label: '(PNNR) Persona Natural No Residente' },
                      { value: '3', label: '(PJD) Persona Jurídica Domiciliada' },
                      { value: '4', label: '(PJND) Persona Jurídica No Domiciliada' },
                      { value: '5', label: 'Exenta' },
                      { value: '6', label: 'Tesorería Nacional' },
                      { value: '7', label: 'Otros 1' },
                      { value: '8', label: 'Otros 2' }
                    ]}
                    bind:value={tipo_per}
                    placeholder="Tipo de Persona..."
                  />
                </div>

                <!-- Porcentaje de Retención -->
                <div class="space-y-2">
                  <label
                    for="porc_esp"
                    class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
                    >Porcentaje de Retención</label
                  >
                  <div class="relative">
                    <input
                      id="porc_esp"
                      name="porc_esp"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      bind:value={porc_esp}
                      class="w-full bg-surface-base border border-border-subtle rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                    />
                    <span
                      class="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-text-muted"
                      >%</span
                    >
                  </div>
                </div>
              </div>
            </div>
          {/if}
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
              {isEditing ? "Guardar Cambios" : "Crear Proveedor"}
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal de Confirmación de Eliminación -->
{#if showDeleteModal}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/90 backdrop-blur-md"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) =>
        e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="glass w-full max-w-md rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
      transition:scale={{ duration: 300, start: 0.95 }}
    >
      <div class="p-8 text-center space-y-6">
        <div
          class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10"
        >
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight">
            Confirmar Eliminación
          </h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar al proveedor <span
              class="text-text-base font-bold"
              >{supplierToDelete?.descripcion || supplierToDelete?.prov_des}</span
            >? Esta acción es irreversible en Profit Plus.
          </p>
        </div>

        <form
          method="POST"
          action="?/deleteSupplier"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;
              if (result.type === "success") {
                showDeleteModal = false;
                toast.success("Proveedor eliminado correctamente");
              } else if (result.type === "failure" && result.data?.message) {
                toast.error(result.data.message as string);
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input type="hidden" name="co_prov" value={supplierToDelete?.co_prov} />
          <input type="hidden" name="branch_id" value={selectedBranch} />

          <div class="space-y-2 text-left">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
              for="del-pass">Contraseña de Confirmación</label
            >
            <div class="relative">
              <Lock
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="del-pass"
                type="password"
                name="password"
                bind:value={deletePassword}
                required
                placeholder="Introduzca su contraseña"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-red-500/50 outline-none transition-all"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => (showDeleteModal = false)}
              disabled={isDeleting}
              class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting || !deletePassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {#if isDeleting}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Check size={18} />
                Eliminar
              {/if}
            </button>
          </div>
        </form>
      </div>
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
