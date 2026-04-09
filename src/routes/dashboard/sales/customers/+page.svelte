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
    Lock,
    Briefcase,
    Tag,
    UserCircle,
    Box,
    Store,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let searchQuery = $state(data.search || "");
  let isSearching = $state(false);
  let showModal = $state(false);
  let isEditing = $state(false);
  let loading = $state(false);

  // Estados para Eliminación con Clave
  let showDeleteModal = $state(false);
  let customerToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Form State
  let co_cli = $state("");
  let descripcion = $state("");
  let rif = $state("");
  let telefonos = $state("");
  let email = $state("");
  let direccion = $state("");
  let ciudad = $state("");
  let co_zon = $state("");

  // Tax Info State
  let contribuyente = $state(false);
  let tipo_per = $state("1"); // 1 = PNR by default
  let contribu_e = $state(false);
  let porc_esp = $state(100);

  let selectedTenant = $state("");
  let selectedBranch = $state("");

  $effect(() => {
    selectedTenant =
      data.context?.tenantId ||
      new URL(window.location.href).searchParams.get("tenant_id") ||
      "";
    selectedBranch =
      data.context?.branchId ||
      new URL(window.location.href).searchParams.get("branch_id") ||
      "";
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
    co_cli = "";
    descripcion = "";
    rif = "";
    telefonos = "";
    email = "";
    direccion = "";
    ciudad = "";
    co_zon = "";
    contribuyente = false;
    tipo_per = "1";
    contribu_e = false;
    porc_esp = 100;
    showModal = true;
  }

  function openEditModal(customer: any) {
    isEditing = true;
    co_cli = customer.co_cli;
    descripcion = customer.descripcion;
    rif = customer.rif;
    telefonos = customer.telefonos;
    email = customer.email;
    direccion = customer.direc1 || customer.direccion;
    ciudad = customer.ciudad;
    co_zon = customer.co_zon || "";
    contribuyente = customer.contrib ?? customer.bContrib ?? customer.contribuyente ?? false;
    tipo_per = customer.sTipo_Per || customer.tipo_per || "1";
    contribu_e = customer.bContribu_E ?? customer.contribu_e ?? false;
    porc_esp = customer.dePorc_Esp ?? customer.porc_esp ?? 100;
    showModal = true;
    selectedBranch = data.selectedBranchId || data.context?.branchId || "";
  }

  $effect(() => {
    if (form?.success) {
      toast.success(
        form.message || (isEditing ? "Cliente actualizado" : "Cliente creado"),
      );
      showModal = false;
    } else if (form?.message) {
      toast.error(form.message);
    }
    if (data.error) {
      toast.error(data.error);
    }
  });

  function openDeleteModal(customer: any) {
    customerToDelete = customer;
    deletePassword = "";
    showDeleteModal = true;
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Users size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Consulta y gestiona la cartera de clientes de Profit Plus en tiempo
        real.
        {#if data.customers}
          <span
            class="flex items-center gap-1.5 text-xs text-brand-500/80 font-medium mt-2 bg-brand-500/10 w-fit px-3 py-1.5 rounded-lg border border-brand-500/20"
          >
            <Users size={14} />
            Mostrando {data.customers.length} clientes en esta página
          </span>
        {/if}
      </p>
    </div>

    <button
      onclick={openCreateModal}
      class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95"
    >
      <Plus size={20} />
      Nuevo Cliente
    </button>
  </div>

  <!-- Search, Filters and Stats -->
  <div class="flex flex-col gap-4">
    <!-- Selection row (Tenant + Branch) -->
    <div class="flex flex-col lg:flex-row gap-4 items-center">
      {#if (data.tenants?.length ?? 0) > 1}
        <div class="relative w-full lg:w-72 shrink-0">
          <Box
            class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400"
            size={18}
          />
          <select
            bind:value={selectedTenant}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-100"
          >
            <option value="">Seleccionar Empresa...</option>
            {#each data.tenants || [] as t}
              <option value={t.id} class="bg-surface-base text-text-base"
                >{t.name}</option
              >
            {/each}
          </select>
        </div>
      {:else if data.tenants?.length === 1 || data.context?.tenantId}
        <div
          class="h-14 bg-surface-base border border-white/10 rounded-2xl px-6 flex items-center gap-3 shrink-0"
        >
          <Box class="text-brand-400" size={18} />
          <span class="font-bold text-sm text-brand-100"
            >{data.tenants?.[0]?.name ||
              data.context?.tenantId ||
              "Empresa"}</span
          >
        </div>
      {/if}

      {#if data.context?.branches && data.context.branches.length > 0}
        <div class="relative w-full lg:w-64 shrink-0">
          <Store
            class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400"
            size={18}
          />
          <select
            bind:value={selectedBranch}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
          >
            {#each data.context.branches as branch}
              <option value={branch.id} class="bg-surface-base text-text-base"
                >{branch.name}</option
              >
            {/each}
          </select>
        </div>
      {/if}

      <form onsubmit={handleSearch} class="flex-1 relative group w-full">
        <Search
          class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors"
          size={20}
        />
        <input
          type="text"
          placeholder="Buscar por nombre, código o RIF..."
          bind:value={searchQuery}
          class="w-full h-14 bg-surface-base pl-12 pr-28 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none transition-all font-medium"
        />
        <button
          type="submit"
          disabled={isSearching}
          class="absolute right-2 top-1/2 -translate-y-1/2 bg-white/5 hover:bg-white/10 disabled:opacity-50 px-5 py-2 rounded-xl text-sm font-bold transition-all"
        >
          {isSearching ? "..." : "Buscar"}
        </button>
      </form>
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
  {:else if !data.customers || data.customers.length === 0}
    <div
      class="glass p-20 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4"
    >
      <div
        class="h-24 w-24 rounded-[40px] bg-white/5 flex items-center justify-center text-text-muted/20"
      >
        <Search size={54} />
      </div>
      <h2 class="text-3xl font-black tracking-tight text-text-muted">
        No se encontraron clientes
      </h2>
      <p class="text-text-muted/60 max-w-sm text-lg">
        Pruebe con otros términos de búsqueda o verifique la sede seleccionada
        en Profit Plus.
      </p>
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
                >Cliente</th
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
            {#each data.customers as customer}
              <tr
                class="group hover:bg-white/2 transition-colors cursor-pointer"
              >
                <td class="px-8 py-6">
                  <div class="flex items-center gap-4">
                    <div
                      class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 font-black shadow-inner"
                    >
                      {customer.descripcion?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p
                        class="font-bold text-text-base group-hover:text-brand-400 transition-colors uppercase leading-none mb-1 text-sm"
                      >
                        {customer.descripcion}
                      </p>
                      <div
                        class="flex items-center gap-2 text-xs text-text-muted"
                      >
                        <Hash size={12} class="opacity-50" />
                        <span class="font-mono">{customer.co_cli}</span>
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
                        >{customer.rif || "---"}</span
                      >
                    </div>
                    <div class="flex items-center gap-2">
                      <MapPin size={12} class="text-indigo-400" />
                      <span
                        class="text-[11px] text-text-muted truncate max-w-[200px]"
                        >{customer.direc1 ||
                          customer.sede_nombre ||
                          "Principal"}</span
                      >
                    </div>
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div class="space-y-1.5">
                    {#if customer.telefonos}
                      <div class="flex items-center gap-2 text-xs">
                        <Phone size={12} class="text-green-400" />
                        <span class="text-text-muted">{customer.telefonos}</span
                        >
                      </div>
                    {/if}
                    {#if customer.email}
                      <div class="flex items-center gap-2 text-xs">
                        <Mail size={12} class="text-blue-400" />
                        <span class="text-text-muted truncate max-w-[180px]"
                          >{customer.email}</span
                        >
                      </div>
                    {:else}
                      <span
                        class="text-[10px] text-text-muted/40 uppercase italic"
                        >Sin correo</span
                      >
                    {/if}
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div
                    class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <button
                      onclick={() => openEditModal(customer)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onclick={() => openDeleteModal(customer)}
                      class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      {#if data.pagination && data.pagination.pages > 1}
        <div
          class="px-8 py-6 bg-white/1 border-t border-white/5 flex items-center justify-between"
        >
          <p
            class="text-xs font-bold text-text-muted uppercase tracking-widest"
          >
            Página <span class="text-text-base"
              >{data.pagination.currentPage}</span
            >
            de <span class="text-text-base">{data.pagination.pages}</span>
            (Total: {data.pagination.total})
          </p>

          <div class="flex gap-2">
            <button
              onclick={() =>
                data.pagination && changePage(data.pagination.currentPage - 1)}
              disabled={!data.pagination || data.pagination.currentPage === 1}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onclick={() =>
                data.pagination && changePage(data.pagination.currentPage + 1)}
              disabled={!data.pagination ||
                data.pagination.currentPage === data.pagination.pages}
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
      onkeydown={(e) => e.key === "Escape" && (showModal = false)}
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div
        class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/50"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-inner"
          >
            <UserCircle size={24} />
          </div>
          <div>
            <h2 class="text-2xl font-bold">
              {isEditing ? "Editar Cliente" : "Nuevo Cliente"}
            </h2>
            <p class="text-sm text-text-muted">
              {isEditing
                ? "Actualiza la ficha técnica del cliente"
                : "Registra un nuevo cliente en el sistema local"}
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
        <input type="hidden" name="tenant_id" value={selectedTenant} />
        <input type="hidden" name="branch_id" value={selectedBranch} />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Code -->
          <div class="space-y-2">
            <label
              for="co_cli"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
              >Código del Cliente</label
            >
            <div class="relative">
              <Hash
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="co_cli"
                name="co_cli"
                type="text"
                required
                readonly={isEditing}
                bind:value={co_cli}
                placeholder="Ej: CLI-001"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono {isEditing
                  ? 'opacity-50'
                  : ''}"
              />
            </div>
          </div>

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
                placeholder="Ej: J-12345678-9"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
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
                placeholder="Nombre comercial o jurídico"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all uppercase"
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
                placeholder="+58 212-0000000"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Email -->
          <div class="space-y-2">
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
                placeholder="cliente@ejemplo.com"
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
        <div class="space-y-6 pt-2">
          <div class="flex items-center gap-3 mb-2">
            <div class="h-px flex-1 bg-border-subtle"></div>
            <span
              class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"
              >Configuración de Cuenta</span
            >
            <div class="h-px flex-1 bg-border-subtle"></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Zone -->
            <div class="space-y-2">
              <label
                for="co_zon"
                class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
                >Zona Geográfica</label
              >
              <div class="relative">
                <MapPin
                  size={18}
                  class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                />
                <select
                  id="co_zon"
                  name="co_zon"
                  bind:value={co_zon}
                  class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all appearance-none"
                >
                  <option value="">Seleccione una zona...</option>
                  {#each data.context?.zonas || [] as zon}
                    <option value={zon.co_zon}>{zon.zon_des}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Contribuyente Toggle -->
            <div
              class="flex items-center justify-between p-4 bg-surface-base border border-border-subtle rounded-2xl h-[60px] self-end"
            >
              <span class="text-sm font-bold text-text-base">Contribuyente</span
              >
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
          </div>

          {#if contribuyente}
            <div
              class="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Tipo Persona -->
                <div class="space-y-2">
                  <label
                    for="tipo_per"
                    class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
                    >Tipo de Persona</label
                  >
                  <select
                    id="tipo_per"
                    name="tipo_per"
                    bind:value={tipo_per}
                    class="w-full bg-surface-base border border-border-subtle rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all appearance-none"
                  >
                    <option value="1">(PNR) Persona Natural Residente</option>
                    <option value="2"
                      >(PNNR) Persona Natural No Residente</option
                    >
                    <option value="3">(PJD) Persona Jurídica Domiciliada</option
                    >
                    <option value="4"
                      >(PJND) Persona Jurídica No Domiciliada</option
                    >
                    <option value="5">Exenta</option>
                    <option value="6">Tesorería Nacional</option>
                    <option value="7">Otros 1</option>
                    <option value="8">Otros 2</option>
                  </select>
                </div>

                <!-- Contribuyente Especial -->
                <div
                  class="flex items-center gap-4 p-4 bg-surface-base border border-border-subtle rounded-2xl h-[60px] self-end"
                >
                  <input
                    type="checkbox"
                    id="contribu_e"
                    name="contribu_e"
                    value="true"
                    bind:checked={contribu_e}
                    class="w-5 h-5 rounded border-border-subtle text-brand-600 focus:ring-brand-500"
                  />
                  <label
                    for="contribu_e"
                    class="text-sm font-bold text-text-base"
                    >Contribuyente Especial</label
                  >
                </div>
              </div>

              {#if contribu_e}
                <div class="space-y-2 animate-in zoom-in-95 duration-200">
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
              {/if}
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
              {isEditing ? "Guardar Cambios" : "Crear Cliente"}
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
          <h2 class="text-2xl font-black tracking-tight">Confirmar Eliminación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar al cliente <span
              class="text-text-base font-bold">{customerToDelete?.descripcion}</span
            >? Esta acción es irreversible en Profit Plus.
          </p>
        </div>

        <form
          method="POST"
          action="?/deleteCustomer"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;
              if (result.type === "success") {
                showDeleteModal = false;
                toast.success("Cliente eliminado correctamente");
              } else if (result.type === "failure" && result.data?.message) {
                toast.error(result.data.message as string);
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input type="hidden" name="co_cli" value={customerToDelete?.co_cli} />
          <input type="hidden" name="branch_id" value={selectedBranch || data.selectedBranchId} />

          <div class="space-y-2 text-left">
            <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1" for="del-pass"
              >Contraseña de Confirmación</label
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
