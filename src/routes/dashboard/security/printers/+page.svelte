<!-- src/routes/dashboard/security/printers/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Printer,
    Plus,
    Edit2,
    Trash2,
    ShieldCheck,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Store,
    Play,
    Power,
    FileText,
    Flame,
    Cpu,
    X,
    Radio,
    HardDrive
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { invalidateAll } from "$app/navigation";

  let { data } = $props();

  // Modal State
  let isModalOpen = $state(false);
  let isSubmitting = $state(false);
  let isTesting = $state<Record<string, boolean>>({});
  let isTestingInModal = $state(false);
  let testModalFeedback = $state<{ success: boolean; message: string } | null>(null);

  // Form State
  let printerType = $state<"fiscal" | "matrix_network" | "thermal">("thermal");
  let name = $state("");
  let ipAddress = $state("");
  let port = $state("9100");
  let serialPort = $state("COM4");
  let model = $state("TALLY_DASCOM_1140");
  let shareName = $state("LX350");
  let branchId = $state("");
  let isActive = $state(true);
  let editingId = $state<string | null>(null);

  // Subline selection state for thermal printers
  let selectedSublines = $state<string[]>([]);
  let sublineSearchQuery = $state("");

  // Branch filter in table
  let selectedBranchFilter = $state<string>("ALL");

  let filteredSublinesForUI = $derived(
    (data.sublines || []).filter((sub: any) => {
      const query = sublineSearchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        (sub.co_subl || "").toLowerCase().includes(query) ||
        (sub.subl_des || "").toLowerCase().includes(query)
      );
    }),
  );

  function getPrinterMeta(p: any) {
    const rawSubs: string[] = p.sublines || [];
    let type: "fiscal" | "matrix_network" | "thermal" = "thermal";
    let com = "COM4";
    let mdl = "TALLY_DASCOM_1140";
    let share = "LX350";
    let cleanSubs: string[] = [];

    for (const s of rawSubs) {
      if (s.startsWith("TYPE:")) {
        const t = s.replace("TYPE:", "").toLowerCase();
        if (t === "fiscal" || t === "matrix_network" || t === "thermal") {
          type = t as any;
        }
      } else if (s.startsWith("COM:")) {
        com = s.replace("COM:", "");
      } else if (s.startsWith("MODEL:")) {
        mdl = s.replace("MODEL:", "");
      } else if (s.startsWith("SHARE:")) {
        share = s.replace("SHARE:", "");
      } else if (!s.startsWith("DOC:")) {
        cleanSubs.push(s);
      }
    }

    return {
      type,
      serialPort: com,
      model: mdl,
      shareName: share,
      cleanSublines: cleanSubs
    };
  }

  let displayPrinters = $derived(
    (data.printers || []).map((p: any) => {
      const meta = getPrinterMeta(p);
      return {
        ...p,
        meta
      };
    }).filter((p: any) => {
      if (selectedBranchFilter === "ALL") return true;
      return p.branch_id === selectedBranchFilter;
    })
  );

  function resetForm() {
    printerType = "thermal";
    name = "";
    ipAddress = "";
    port = "9100";
    serialPort = "COM4";
    model = "TALLY_DASCOM_1140";
    shareName = "LX350";
    branchId = data.branches[0]?.id || "";
    isActive = true;
    editingId = null;
    selectedSublines = [];
    sublineSearchQuery = "";
    testModalFeedback = null;
  }

  function openCreateModal() {
    resetForm();
    isModalOpen = true;
  }

  // Pre-load first branch ID
  $effect(() => {
    if (data.branches && data.branches.length > 0 && !branchId) {
      branchId = data.branches[0].id;
    }
  });

  function selectPrinterForEdit(p: any) {
    const meta = p.meta || getPrinterMeta(p);
    editingId = p.id;
    printerType = meta.type;
    name = p.name;
    ipAddress = p.ip_address;
    port = String(p.port);
    serialPort = meta.serialPort || "COM4";
    model = meta.model || "TALLY_DASCOM_1140";
    shareName = meta.shareName || "LX350";
    branchId = p.branch_id;
    isActive = p.is_active;
    selectedSublines = meta.cleanSublines || [];
    sublineSearchQuery = "";
    testModalFeedback = null;
    isModalOpen = true;
  }

  function onTypeChange(newType: "fiscal" | "matrix_network" | "thermal") {
    printerType = newType;
    if (newType === "fiscal") {
      if (port === "9100" || port === "445") port = "8088";
      if (!name) name = "Caja Principal - Tally Fiscal";
    } else if (newType === "matrix_network") {
      if (port === "8088" || port === "9100") port = "445";
      if (!name) name = "Epson LX-350 - Notas de Entrega";
      if (!shareName) shareName = "LX350";
    } else {
      if (port === "8088" || port === "445") port = "9100";
      if (!name) name = "Impresora Térmica Pre-despacho";
    }
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!name || !ipAddress || !branchId) {
      toast.error("Completa los campos obligatorios (Nombre, IP, Sede)");
      return;
    }

    // Limpiar barras si el usuario escribió \\ o /
    let cleanIp = ipAddress.trim().replace(/^[\\\/]+/, '');
    if (cleanIp.includes('\\') || cleanIp.includes('/')) {
      const parts = cleanIp.split(/[\\\/]/);
      cleanIp = parts[0];
      if (parts[1] && !shareName) shareName = parts[1];
    }

    isSubmitting = true;
    const formData = new FormData();
    if (editingId) formData.set("printerId", editingId);
    formData.set("name", name);
    formData.set("ip_address", cleanIp);
    formData.set("port", port);
    formData.set("branch_id", branchId);
    formData.set("is_active", String(isActive));

    // Encode metadata in sublines for backward compatibility
    let finalSublines: string[] = [];
    if (printerType === "fiscal") {
      finalSublines = ["TYPE:FISCAL", `COM:${serialPort.toUpperCase()}`, `MODEL:${model}`, "DOC:FACTURA_FISCAL"];
    } else if (printerType === "matrix_network") {
      finalSublines = ["TYPE:MATRIX_NETWORK", "DOC:NOTA_ENTREGA", `SHARE:${shareName.trim().toUpperCase()}`];
    } else {
      finalSublines = ["TYPE:THERMAL", "DOC:PRE_DESPACHO", ...selectedSublines];
    }
    formData.set("sublines", JSON.stringify(finalSublines));

    try {
      const response = await fetch("?/savePrinter", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.type === "success") {
        toast.success(
          editingId 
            ? `Impresora "${name}" actualizada (${isActive ? "Activa" : "Inactiva"})` 
            : `Impresora "${name}" registrada con éxito (${isActive ? "Activa" : "Inactiva"})`,
        );
        isModalOpen = false;
        resetForm();
        await invalidateAll();
      } else {
        const errorData = result.data ? JSON.parse(result.data) : {};
        toast.error(errorData.message || "Error al guardar impresora");
      }
    } catch (err: any) {
      toast.error("Error de servidor: " + err.message);
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDelete(printerId: string) {
    if (!confirm("¿Seguro que deseas eliminar esta impresora?")) return;

    const formData = new FormData();
    formData.set("printerId", printerId);

    try {
      const response = await fetch("?/deletePrinter", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.type === "success") {
        toast.success("Impresora eliminada");
        if (editingId === printerId) {
          isModalOpen = false;
          resetForm();
        }
        await invalidateAll();
      } else {
        const errorData = result.data ? JSON.parse(result.data) : {};
        toast.error(errorData.message || "Error al eliminar impresora");
      }
    } catch (err: any) {
      toast.error("Error de servidor: " + err.message);
    }
  }

  async function testPrinterConnection(p: any) {
    isTesting[p.id] = true;
    const meta = p.meta || getPrinterMeta(p);
    const cleanHost = (p.ip_address || "").trim().replace(/^[\\\/]+/, '').split(/[\\\/]/)[0];
    try {
      const response = await fetch(`/api/agent/printers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: p.branch_id,
          ip_address: cleanHost,
          port: p.port,
          printer_type: meta.type,
          serial_port: meta.serialPort,
          model: meta.model,
          share_name: meta.shareName
        }),
      });
      const result = await response.json();

      if (result.success) {
        toast.success(result.message || `Conexión exitosa con ${p.name} (${cleanHost})`);
      } else {
        toast.error(result.message || "No se pudo conectar a la impresora.");
      }
    } catch (err: any) {
      toast.error("Error al probar conexión: " + err.message);
    } finally {
      isTesting[p.id] = false;
    }
  }

  async function testModalConnection() {
    if (!ipAddress || !branchId) {
      toast.error("Ingresa la IP y selecciona la Sede para probar la conexión.");
      return;
    }
    isTestingInModal = true;
    testModalFeedback = null;
    const cleanHost = ipAddress.trim().replace(/^[\\\/]+/, '').split(/[\\\/]/)[0];

    try {
      const response = await fetch(`/api/agent/printers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          ip_address: cleanHost,
          port: port,
          printer_type: printerType,
          serial_port: serialPort,
          model: model,
          share_name: shareName
        }),
      });
      const result = await response.json();
      testModalFeedback = {
        success: Boolean(result.success),
        message: result.message || (result.success ? "Conexión exitosa y verificada." : "Fallo de conexión.")
      };
      if (result.success) {
        toast.success(testModalFeedback.message);
      } else {
        toast.error(testModalFeedback.message);
      }
    } catch (err: any) {
      testModalFeedback = {
        success: false,
        message: "Error probando conexión: " + err.message
      };
      toast.error(testModalFeedback.message);
    } finally {
      isTestingInModal = false;
    }
  }

  async function togglePrinterActive(p: any) {
    const formData = new FormData();
    formData.set("printerId", p.id);

    try {
      const response = await fetch("?/togglePrinter", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.type === "success") {
        toast.success(
          p.is_active ? `Impresora "${p.name}" desactivada` : `Impresora "${p.name}" activada`,
        );
        await invalidateAll();
      } else {
        const errorData = result.data ? JSON.parse(result.data) : {};
        toast.error(
          errorData.message || "Error al cambiar estado de la impresora",
        );
      }
    } catch (err: any) {
      toast.error("Error de servidor: " + err.message);
    }
  }

  function getBranchName(id: string) {
    const b = data.branches.find((br: any) => br.id === id);
    return b ? b.name : "Desconocida";
  }
</script>

<div class="space-y-8" in:fade>
  <!-- HEADER -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
        <Printer size={36} class="text-brand-500" />
        Impresoras
      </h1>
      <p class="text-text-muted mt-1 text-sm sm:text-base">
        Define y administra las impresoras fiscales, matriciales y térmicas de cada sucursal.
      </p>
    </div>

    <!-- BOTÓN AGREGAR IMPRESORA -->
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={openCreateModal}
        class="px-5 h-12 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-brand-500/20 flex items-center gap-2 cursor-pointer shrink-0"
      >
        <Plus size={18} />
        Registrar Impresora
      </button>
    </div>
  </div>

  <!-- MAIN PRINTERS TABLE (FULL WIDTH) -->
  <div class="space-y-4">
    <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
      <!-- TABLE TOOLBAR -->
      <div class="p-4 sm:p-6 border-b border-border-subtle bg-surface-soft/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
          <Printer size={16} />
          Impresoras en Red ({displayPrinters.length})
        </h3>

        <!-- Filtro por Sede -->
        {#if data.branches && data.branches.length > 1}
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-text-muted">Sede:</span>
            <select
              bind:value={selectedBranchFilter}
              class="h-9 bg-surface-base border border-border-subtle rounded-xl px-3 text-xs font-bold text-text-base focus:outline-none focus:border-brand-500/50 cursor-pointer"
            >
              <option value="ALL">Todas las sedes</option>
              {#each data.branches as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      {#if displayPrinters.length === 0}
        <div class="p-16 text-center flex flex-col items-center justify-center gap-3">
          <Printer size={48} class="text-text-muted/30" />
          <h4 class="text-lg font-bold text-text-muted">
            No hay impresoras registradas
          </h4>
          <p class="text-xs text-text-muted/50 max-w-sm leading-relaxed">
            Registra una impresora fiscal, matricial de notas de entrega o térmica de pre-despacho para habilitar la emisión de documentos.
          </p>
          <button
            type="button"
            onclick={openCreateModal}
            class="mt-2 px-4 py-2 bg-brand-600/10 hover:bg-brand-600/20 text-brand-400 border border-brand-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={14} /> Registrar ahora
          </button>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                <th class="px-6 py-4">Tipo & Impresora</th>
                <th class="px-6 py-4">Sede</th>
                <th class="px-6 py-4">Conexión / Dirección</th>
                <th class="px-6 py-4">Documento / Sub-Líneas</th>
                <th class="px-6 py-4 text-center">Estado</th>
                <th class="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle text-sm">
              {#each displayPrinters as p (p.id)}
                <tr class="hover:bg-surface-soft/60 transition-colors {!p.is_active ? 'opacity-60' : ''}">
                  <!-- TIPO & NOMBRE -->
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      {#if p.meta.type === 'fiscal'}
                        <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm" title="Impresora Fiscal (SENIAT)">
                          <ShieldCheck size={18} />
                        </div>
                      {:else if p.meta.type === 'matrix_network'}
                        <div class="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm" title="Impresora Matricial (Notas de Entrega)">
                          <FileText size={18} />
                        </div>
                      {:else}
                        <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm" title="Impresora Térmica (Pre-despacho)">
                          <Flame size={18} />
                        </div>
                      {/if}
                      <div class="space-y-0.5">
                        <div class="flex items-center gap-2">
                          <span class="font-black text-text-base text-sm">{p.name}</span>
                          {#if p.meta.type === 'fiscal'}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              Fiscal
                            </span>
                          {:else if p.meta.type === 'matrix_network'}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Matricial
                            </span>
                          {:else}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              Térmica
                            </span>
                          {/if}
                        </div>
                        <p class="text-[11px] text-text-muted font-medium">
                          {#if p.meta.type === 'fiscal'}
                            {p.meta.model === 'TALLY_DASCOM_1140' ? 'Tally Dascom 1140' : p.meta.model}
                          {:else if p.meta.type === 'matrix_network'}
                            Epson LX / ESC-P
                          {:else}
                            ESC/POS 80mm
                          {/if}
                        </p>
                      </div>
                    </div>
                  </td>

                  <!-- SEDE -->
                  <td class="px-6 py-4 text-text-base font-bold text-xs">
                    <span class="inline-flex items-center gap-1.5 bg-surface-soft px-2.5 py-1 rounded-lg border border-border-subtle">
                      <Store size={12} class="text-brand-400" />
                      {getBranchName(p.branch_id)}
                    </span>
                  </td>

                  <!-- DIRECCION IP / PUERTO -->
                  <td class="px-6 py-4 text-text-muted font-mono font-bold text-xs">
                    <div class="space-y-0.5">
                      <span class="text-text-base">{p.ip_address}:{p.port}</span>
                      {#if p.meta.type === 'fiscal'}
                        <p class="text-[10px] text-cyan-400 font-mono font-bold">
                          Puerto Serial: {p.meta.serialPort}
                        </p>
                      {:else if p.meta.type === 'matrix_network' && p.meta.shareName}
                        <p class="text-[10px] text-amber-400 font-mono font-bold">
                          \\{p.ip_address}\{p.meta.shareName}
                        </p>
                      {/if}
                    </div>
                  </td>

                  <!-- DOCUMENTO / SUBLINEAS -->
                  <td class="px-6 py-4 text-xs font-bold text-text-muted max-w-[240px]">
                    {#if p.meta.type === 'fiscal'}
                      <span class="text-cyan-400/90 font-bold flex items-center gap-1">
                        <ShieldCheck size={13} />
                        Facturas Fiscales (con IVA)
                      </span>
                    {:else if p.meta.type === 'matrix_network'}
                      <span class="text-amber-400/90 font-bold flex items-center gap-1">
                        <FileText size={13} />
                        Notas de Entrega (Forma Libre)
                      </span>
                    {:else}
                      {#if !p.meta.cleanSublines || p.meta.cleanSublines.length === 0}
                        <span class="text-emerald-400/80 italic">Todas las sublíneas (Pre-despacho)</span>
                      {:else}
                        <span class="truncate block" title={p.meta.cleanSublines.join(", ")}>
                          {p.meta.cleanSublines.join(", ")}
                        </span>
                      {/if}
                    {/if}
                  </td>

                  <!-- ESTADO -->
                  <td class="px-6 py-4 text-center">
                    <button
                      type="button"
                      onclick={() => togglePrinterActive(p)}
                      class="focus:outline-none transition-transform active:scale-95 cursor-pointer"
                      title={p.is_active ? "Desactivar Impresora" : "Activar Impresora"}
                    >
                      {#if p.is_active}
                        <span class="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-black border border-green-500/20 inline-flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                          ACTIVA
                        </span>
                      {:else}
                        <span class="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-black border border-red-500/20 inline-flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                          INACTIVA
                        </span>
                      {/if}
                    </button>
                  </td>

                  <!-- ACCIONES -->
                  <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onclick={() => testPrinterConnection(p)}
                        disabled={isTesting[p.id]}
                        class="p-2 bg-surface-soft hover:bg-brand-500/10 border border-border-subtle hover:border-brand-500/30 text-brand-400 hover:text-brand-300 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                        title="Probar Conexión"
                      >
                        {#if isTesting[p.id]}
                          <RefreshCw size={14} class="animate-spin text-brand-400" />
                        {:else}
                          <Play size={14} fill="currentColor" />
                        {/if}
                      </button>

                      <button
                        type="button"
                        onclick={() => togglePrinterActive(p)}
                        class="p-2 bg-surface-soft hover:bg-surface-strong border border-border-subtle {p.is_active ? 'text-green-400 hover:text-green-300' : 'text-text-muted hover:text-text-base'} rounded-xl transition-all active:scale-95 cursor-pointer"
                        title={p.is_active ? "Desactivar" : "Activar"}
                      >
                        <Power size={14} />
                      </button>

                      <button
                        type="button"
                        onclick={() => selectPrinterForEdit(p)}
                        class="p-2 bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base rounded-xl transition-all active:scale-95 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        type="button"
                        onclick={() => handleDelete(p.id)}
                        class="p-2 bg-surface-soft hover:bg-red-500/10 border border-border-subtle hover:border-red-500/30 text-red-400 hover:text-red-300 rounded-xl transition-all active:scale-95 cursor-pointer"
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
</div>

<!-- ========================================================================= -->
<!-- MODAL: REGISTRAR / EDITAR IMPRESORA EXTENDIDO                             -->
<!-- ========================================================================= -->
{#if isModalOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
    in:fade={{ duration: 150 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        isModalOpen = false;
      }
    }}
  >
    <div
      class="glass max-w-2xl w-full p-6 sm:p-8 rounded-3xl border border-border-subtle shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin"
      in:scale={{ start: 0.95, duration: 200 }}
    >
      <!-- MODAL HEADER -->
      <div class="flex items-center justify-between border-b border-border-subtle/60 pb-4">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <Printer size={22} />
          </div>
          <div>
            <h3 class="text-xl font-black tracking-tight text-text-base">
              {editingId ? "Editar Impresora" : "Registrar Impresora"}
            </h3>
            <p class="text-xs text-text-muted font-bold">
              Configura el tipo de impresora, IP y protocolo de comunicación.
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (isModalOpen = false)}
          class="p-2 text-text-muted hover:text-text-base rounded-xl bg-surface-soft hover:bg-surface-strong transition-all cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <form onsubmit={handleSave} class="space-y-6">
        <!-- 1. SELECTOR DE TIPO DE IMPRESORA -->
        <div class="space-y-2">
          <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">
            Tipo de Impresora & Documento <span class="text-red-500">*</span>
          </span>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <!-- FISCAL -->
            <button
              type="button"
              onclick={() => onTypeChange("fiscal")}
              class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 {printerType === 'fiscal' ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10 text-cyan-400' : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:border-border-strong hover:text-text-base'}"
            >
              <div class="flex items-center justify-between w-full">
                <ShieldCheck size={22} class={printerType === 'fiscal' ? 'text-cyan-400' : 'text-text-muted'} />
                {#if printerType === 'fiscal'}
                  <CheckCircle2 size={16} class="text-cyan-400" />
                {/if}
              </div>
              <div>
                <p class="text-xs font-black text-text-base">Fiscal SENIAT</p>
                <p class="text-[10px] text-text-muted leading-tight mt-0.5">Tally Dascom / Facturas con IVA</p>
              </div>
            </button>

            <!-- MATRICIAL / RED -->
            <button
              type="button"
              onclick={() => onTypeChange("matrix_network")}
              class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 {printerType === 'matrix_network' ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10 text-amber-400' : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:border-border-strong hover:text-text-base'}"
            >
              <div class="flex items-center justify-between w-full">
                <FileText size={22} class={printerType === 'matrix_network' ? 'text-amber-400' : 'text-text-muted'} />
                {#if printerType === 'matrix_network'}
                  <CheckCircle2 size={16} class="text-amber-400" />
                {/if}
              </div>
              <div>
                <p class="text-xs font-black text-text-base">Matricial de Red</p>
                <p class="text-[10px] text-text-muted leading-tight mt-0.5">Epson LX-350 / Notas de Entrega</p>
              </div>
            </button>

            <!-- TERMICA PRE-DESPACHO -->
            <button
              type="button"
              onclick={() => onTypeChange("thermal")}
              class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 {printerType === 'thermal' ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/10 text-emerald-400' : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:border-border-strong hover:text-text-base'}"
            >
              <div class="flex items-center justify-between w-full">
                <Flame size={22} class={printerType === 'thermal' ? 'text-emerald-400' : 'text-text-muted'} />
                {#if printerType === 'thermal'}
                  <CheckCircle2 size={16} class="text-emerald-400" />
                {/if}
              </div>
              <div>
                <p class="text-xs font-black text-text-base">Térmica Pre-despacho</p>
                <p class="text-[10px] text-text-muted leading-tight mt-0.5">Tickets por Sublínea (80mm)</p>
              </div>
            </button>
          </div>
        </div>

        <!-- 2. CAMPOS PRINCIPALES -->
        <div class="space-y-4 pt-2">
          <!-- Nombre de la Impresora -->
          <div class="space-y-1.5">
            <label for="p_name" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Nombre de la Impresora <span class="text-red-500">*</span>
            </label>
            <input
              id="p_name"
              type="text"
              bind:value={name}
              placeholder="Ej. Caja Principal - Tally Fiscal"
              class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
              required
            />
          </div>

          <!-- Sede y Conexión de Red -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <!-- Sede -->
            <div class="sm:col-span-1 space-y-1.5">
              <label for="p_branch" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Sede / Sucursal <span class="text-red-500">*</span>
              </label>
              <div class="w-full relative">
                <select
                  id="p_branch"
                  bind:value={branchId}
                  class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-3 text-xs font-bold text-text-base focus:outline-none focus:border-brand-500/50 transition-all cursor-pointer appearance-none"
                >
                  {#each data.branches as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
                <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <Store size={14} />
                </div>
              </div>
            </div>

            <!-- IP -->
            <div class="sm:col-span-1 space-y-1.5">
              <label for="p_ip" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                {printerType === 'fiscal' ? 'IP de PC de Caja' : 'Dirección IP'} <span class="text-red-500">*</span>
              </label>
              <input
                id="p_ip"
                type="text"
                bind:value={ipAddress}
                placeholder={printerType === 'fiscal' ? 'Ej. 192.168.1.50' : 'Ej. 192.168.90.10'}
                class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold font-mono text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
                required
              />
            </div>

            <!-- Puerto -->
            <div class="sm:col-span-1 space-y-1.5">
              <label for="p_port" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                {printerType === 'fiscal' ? 'Puerto Servicio' : 'Puerto Red'} <span class="text-red-500">*</span>
              </label>
              <input
                id="p_port"
                type="text"
                bind:value={port}
                placeholder={printerType === 'fiscal' ? '8088' : '9100'}
                class="w-full h-12 bg-surface-soft border border-border-subtle rounded-xl px-4 text-sm font-bold font-mono text-text-base focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40"
                required
              />
            </div>
          </div>

          <!-- PARÁMETROS ESPECÍFICOS FISCALES -->
          {#if printerType === 'fiscal'}
            <div class="p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-3" in:slide>
              <h4 class="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <Cpu size={14} /> Configuración de Puerto Serial Fiscal (The Factory HKA)
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="p_serial" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Puerto Serial Local (COM)
                  </label>
                  <input
                    id="p_serial"
                    type="text"
                    bind:value={serialPort}
                    placeholder="COM4"
                    class="w-full h-10 bg-surface-base border border-border-subtle rounded-xl px-3 text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-500/50 uppercase"
                  />
                </div>
                <div class="space-y-1">
                  <label for="p_model" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Modelo de Impresora Fiscal
                  </label>
                  <select
                    id="p_model"
                    bind:value={model}
                    class="w-full h-10 bg-surface-base border border-border-subtle rounded-xl px-3 text-xs font-bold text-text-base focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    <option value="TALLY_DASCOM_1140">Tally Dascom 1140 (TFHKA)</option>
                    <option value="BIXOLON_SRP_350">Bixolon SRP-350 (TFHKA)</option>
                    <option value="CUSTOM_KUBE_II">Custom Kube II (TFHKA)</option>
                    <option value="GENERIC_TFHKA">The Factory HKA Genérico</option>
                  </select>
                </div>
              </div>
              <p class="text-[10px] text-cyan-300/70 leading-relaxed italic">
                * La PC de caja debe tener el Micro-Servicio Fiscal ejecutándose en el puerto {port || '8088'} y la impresora conectada en {serialPort || 'COM4'}.
              </p>
            </div>
          {/if}

          <!-- PARÁMETROS ESPECÍFICOS MATRICIAL COMPARTIDA -->
          {#if printerType === 'matrix_network'}
            <div class="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3" in:slide>
              <h4 class="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <FileText size={14} /> Configuración de Impresora Matricial (Windows SMB / Red)
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="p_share" class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Nombre del Recurso Compartido (Share Name)
                  </label>
                  <input
                    id="p_share"
                    type="text"
                    bind:value={shareName}
                    placeholder="LX350"
                    class="w-full h-10 bg-surface-base border border-border-subtle rounded-xl px-3 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500/50 uppercase"
                  />
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                    Ruta de Red Resultante
                  </span>
                  <div class="w-full h-10 bg-surface-base/60 border border-border-subtle rounded-xl px-3 flex items-center text-xs font-mono text-amber-400 select-all truncate font-bold">
                    \\{ipAddress.replace(/^[\\\/]+/, '').split(/[\\\/]/)[0] || 'IP-PC'}\{shareName || 'IMPRESORA'}
                  </div>
                </div>
              </div>
              <p class="text-[10px] text-amber-300/70 leading-relaxed italic">
                * En el campo "Dirección IP", ingresa la IP fija de la PC (ej: <span class="font-mono text-amber-300">192.168.1.52</span>) o el nombre del equipo sin las barras <span class="font-mono text-amber-300">\\</span>. El puerto estándar para Windows SMB es <span class="font-mono text-amber-300">445</span>.
              </p>
            </div>
          {/if}

          <!-- PARÁMETROS ESPECÍFICOS TÉRMICA (SUBLINEAS) -->
          {#if printerType === 'thermal'}
            <div class="space-y-1.5" in:slide>
              <label class="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Sub-Líneas Permitidas para Pre-despacho
              </label>
              <div class="border border-border-subtle rounded-xl bg-surface-soft p-3 space-y-3">
                <input
                  type="text"
                  placeholder="Buscar sub-línea..."
                  bind:value={sublineSearchQuery}
                  class="w-full h-9 bg-surface-strong border border-border-subtle rounded-lg px-3 text-xs font-bold text-text-base focus:outline-none focus:border-brand-500/50 placeholder:text-text-muted/40"
                />
                <div class="max-h-40 overflow-y-auto space-y-2 pr-1 select-none scrollbar-thin">
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
                            selectedSublines = selectedSublines.filter((s) => s !== code);
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
                    <p class="text-[10px] text-text-muted/50 text-center py-3">
                      No se encontraron sub-líneas
                    </p>
                  {/if}
                </div>
              </div>
              <p class="text-[9px] text-text-muted/60 ml-1 italic leading-normal">
                Si no seleccionas ninguna, la impresora imprimirá todas las sub-líneas.
              </p>
            </div>
          {/if}

          <!-- Estado Activa Checkbox -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-surface-soft/60 border border-border-subtle">
            <div class="flex items-center gap-3">
              <input
                id="p_active"
                type="checkbox"
                bind:checked={isActive}
                class="w-4 h-4 rounded border-border-subtle text-brand-500 focus:ring-brand-500 bg-black/20 cursor-pointer"
              />
              <label for="p_active" class="text-xs font-bold text-text-base select-none cursor-pointer">
                Impresora activa y habilitada para emisión
              </label>
            </div>
            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded {isActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}">
              {isActive ? 'Activa' : 'Inactiva'}
            </span>
          </div>

          <!-- FEEDBACK DE TEST DE CONEXIÓN EN MODAL -->
          {#if testModalFeedback}
            <div
              class="p-3.5 rounded-xl border text-xs font-bold flex items-start gap-2.5 {testModalFeedback.success ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}"
              in:slide
            >
              {#if testModalFeedback.success}
                <CheckCircle2 size={16} class="shrink-0 mt-0.5 text-green-400" />
              {:else}
                <AlertTriangle size={16} class="shrink-0 mt-0.5 text-red-400" />
              {/if}
              <p class="leading-relaxed">{testModalFeedback.message}</p>
            </div>
          {/if}
        </div>

        <!-- MODAL ACTIONS -->
        <div class="pt-4 border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <!-- BOTÓN PROBAR CONEXIÓN -->
          <button
            type="button"
            onclick={testModalConnection}
            disabled={isTestingInModal || !ipAddress}
            class="px-4 h-12 bg-surface-soft hover:bg-brand-500/10 border border-border-subtle hover:border-brand-500/30 text-brand-400 hover:text-brand-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {#if isTestingInModal}
              <RefreshCw size={14} class="animate-spin" />
              Verificando conexión...
            {:else}
              <Play size={14} fill="currentColor" />
              Probar Conexión
            {/if}
          </button>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => (isModalOpen = false)}
              class="flex-1 sm:flex-none px-5 h-12 bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              class="flex-1 sm:flex-none px-6 h-12 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl transition-all active:scale-95 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if isSubmitting}
                <RefreshCw size={16} class="animate-spin" />
              {/if}
              Guardar Impresora
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
