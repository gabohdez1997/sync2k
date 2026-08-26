<!-- src/routes/dashboard/warehouse/dispatches/[doc_num]/print/+page@.svelte -->
<script lang="ts">
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import { onMount } from "svelte";
  import type { PageData } from "./$types";

  dayjs.locale("es");

  let { data }: { data: PageData } = $props();
  const { dispatch, branch, settings } = data;

  const logoUrl = branch?.logo_url || settings?.app_logo_url;
  const allItems = dispatch?.renglones || [];

  const displayFecEmis = dispatch?.fe_us_mo
    ? dispatch.fe_us_mo
    : dispatch?.fec_emis;

  const cleanObs = String(dispatch?.comentario || "")
    .replace(/\s*\|\s*EDITADO V[IÍ]A API/gi, "")
    .replace(/\s*\|\s*CREADO V[IÍ]A API/gi, "")
    .replace(/\s*\|\s*EDITADO VIA API/gi, "")
    .replace(/\s*\|\s*CREADO VIA API/gi, "")
    .trim();

  function formatQuantity(val: number | string) {
    const num = Number(val || 0);
    return num.toLocaleString("de-DE", {
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  const originInvoice = (() => {
    const rengs = dispatch?.renglones || [];
    const found = rengs.find(
      (r: any) => r.doc_num_factura && String(r.doc_num_factura).trim() !== ""
    );
    return found
      ? String(found.doc_num_factura).trim()
      : dispatch?.factura_origen || dispatch?.n_control || "---";
  })();

  const defaultWarehouse = (() => {
    const rengs = dispatch?.renglones || [];
    const found = rengs.find((r: any) => r.des_alma || r.co_alma);
    if (found) {
      return found.des_alma
        ? `${found.des_alma} (${found.co_alma?.trim() || "01"})`
        : found.co_alma;
    }
    return dispatch?.des_alma || "ALMACEN PRINCIPAL (01)";
  })();

  const despachadorDisplayName =
    dispatch?.despachador_name ||
    dispatch?.creator_name ||
    dispatch?.co_us_in ||
    "";
  const editorDisplayName = dispatch?.editor_name || "";

  const totalPhysicalUnits = allItems.reduce(
    (acc: number, r: any) => acc + Number(r.cant_despachada || r.total_art || 0),
    0
  );

  // --- LÓGICA DE PAGINACIÓN DINÁMICA ---
  const CAPACITY_WITH_TOTALS = 22;
  const CAPACITY_WITHOUT_TOTALS = 36;

  function getItemWeight(item: any): number {
    const desc = String(item?.art_des || "").trim();
    if (desc.length > 90) return 3;
    if (desc.length > 45) return 2;
    return 1;
  }

  function paginate(items: any[]) {
    let pages: any[] = [];
    let remaining = [...items];

    while (remaining.length > 0) {
      const remainingWeight = remaining.reduce(
        (acc, it) => acc + getItemWeight(it),
        0
      );
      if (remainingWeight <= CAPACITY_WITH_TOTALS) {
        pages.push({
          items: remaining.splice(0, remaining.length),
          showTotals: true,
        });
      } else if (remainingWeight <= CAPACITY_WITHOUT_TOTALS) {
        pages.push({
          items: remaining.splice(0, remaining.length),
          showTotals: false,
        });
      } else {
        let currentCapacity = 0;
        let chunk: any[] = [];
        while (remaining.length > 0) {
          const w = getItemWeight(remaining[0]);
          if (currentCapacity + w > CAPACITY_WITHOUT_TOTALS && chunk.length > 0) {
            break;
          }
          currentCapacity += w;
          chunk.push(remaining.shift());
        }
        pages.push({
          items: chunk,
          showTotals: false,
        });
      }
    }

    if (pages.length === 0) {
      pages.push({ items: [], showTotals: true });
    } else if (!pages[pages.length - 1].showTotals) {
      pages.push({ items: [], showTotals: true });
    }

    return pages;
  }

  const paginatedPages = paginate(allItems);

  onMount(() => {
    // Auto print when requested via query param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("autoprint") === "true") {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  });
</script>

<svelte:head>
  <title>Despacho {dispatch?.doc_num} | Impresión</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0;
    }
    @media print {
      html, body {
        width: 216mm;
        height: auto;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      .page-sheet {
        box-shadow: none !important;
        margin: 0 !important;
        width: 216mm !important;
        height: 279mm !important;
        max-height: 279mm !important;
        page-break-after: always !important;
        break-after: page !important;
      }
    }
  </style>
</svelte:head>

<!-- Floating Action Bar (Invisible on print) -->
<div class="no-print fixed top-4 right-4 z-50 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md p-2 rounded-2xl border border-zinc-800 shadow-2xl">
  <button
    type="button"
    onclick={() => window.print()}
    class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95"
  >
    <span>Imprimir Documento</span>
  </button>
  <button
    type="button"
    onclick={() => window.close()}
    class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition-all"
  >
    Cerrar
  </button>
</div>

<!-- Print Pages Container -->
<div class="bg-zinc-950/40 min-h-screen py-8 flex flex-col items-center gap-8 no-print:bg-zinc-950">
  {#each paginatedPages as pageObj, pageIndex}
    <div class="page-sheet w-[216mm] h-[279mm] bg-white text-zinc-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden">
      <!-- Top Section -->
      <div class="space-y-4">
        <!-- Header -->
        <div class="flex items-start justify-between border-b-2 border-zinc-900 pb-3">
          <!-- Company Info -->
          <div class="flex items-center gap-3.5 max-w-[60%]">
            {#if logoUrl}
              <img src={logoUrl} alt="Logo" class="h-12 w-auto object-contain max-w-[120px]" />
            {/if}
            <div class="space-y-0.5 text-left">
              <h2 class="text-sm font-black text-zinc-900 uppercase tracking-tight leading-tight">
                {branch?.name || "CORPORACIÓN GALPE"}
              </h2>
              {#if branch?.rif}
                <p class="text-[11px] font-bold text-zinc-800">RIF: {branch.rif}</p>
              {/if}
              {#if branch?.address}
                <p class="text-[9px] text-zinc-600 leading-snug line-clamp-2">{branch.address}</p>
              {/if}
              {#if branch?.phones}
                <p class="text-[9px] text-zinc-600">Tel: {branch.phones}</p>
              {/if}
            </div>
          </div>

          <!-- Document Title & Badges -->
          <div class="text-right space-y-1">
            <div class="inline-block bg-zinc-900 text-white px-3 py-1 rounded text-xs font-black tracking-wider uppercase">
              NOTA DE DESPACHO
            </div>
            <div class="font-mono text-base font-black text-zinc-900">
              N° {dispatch?.doc_num}
            </div>
            <div class="text-[10px] text-zinc-700 space-y-0.5">
              <p><span class="font-bold">Emisión:</span> {dayjs(displayFecEmis).format("DD/MM/YYYY hh:mm A")}</p>
              <p><span class="font-bold">Factura Origen:</span> <span class="font-mono font-bold text-violet-700">{originInvoice}</span></p>
              {#if dispatch?.anulado}
                <span class="inline-block text-[9px] font-black uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                  DOCUMENTO ANULADO
                </span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Customer Info Box -->
        <div class="grid grid-cols-2 gap-2 p-2.5 bg-zinc-50 border border-zinc-300 rounded-lg text-[10px]">
          <div>
            <p><span class="font-bold text-zinc-600 uppercase text-[9px]">Cliente / Razón Social:</span></p>
            <p class="font-black text-zinc-900 text-[11px] truncate">{dispatch?.cli_des || "---"}</p>
            <p class="text-zinc-700 mt-0.5"><span class="font-semibold">Código:</span> {dispatch?.co_cli} • <span class="font-semibold">RIF:</span> {dispatch?.rif || "Sin RIF"}</p>
          </div>
          <div>
            <p><span class="font-bold text-zinc-600 uppercase text-[9px]">Dirección de Entrega:</span></p>
            <p class="font-medium text-zinc-800 line-clamp-2 leading-tight">{dispatch?.cli_dir || "Dirección no especificada"}</p>
            <p class="text-zinc-700 mt-0.5"><span class="font-semibold">Tel:</span> {dispatch?.telefonos || "No registrado"}</p>
          </div>
        </div>

        <!-- Items Table -->
        <div class="border border-zinc-900 rounded-lg overflow-hidden">
          <table class="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr class="bg-zinc-900 text-white font-bold uppercase text-[9px] tracking-wider">
                <th class="py-1.5 px-2 w-8 text-center">#</th>
                <th class="py-1.5 px-2 w-28">Código</th>
                <th class="py-1.5 px-2">Descripción del Artículo</th>
                <th class="py-1.5 px-2 w-28">Almacén</th>
                <th class="py-1.5 px-2 w-14 text-center">Unidad</th>
                <th class="py-1.5 px-2 w-20 text-center">Cant. Desp.</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-300 font-medium">
              {#if pageObj.items.length === 0}
                <tr>
                  <td colspan="6" class="text-center py-6 text-zinc-400 italic">
                    Sin artículos en esta página
                  </td>
                </tr>
              {:else}
                {#each pageObj.items as item, idx}
                  <tr class="hover:bg-zinc-50">
                    <td class="py-1.5 px-2 text-center text-zinc-500 font-mono text-[9px]">
                      {idx + 1}
                    </td>
                    <td class="py-1.5 px-2 font-mono font-bold text-zinc-900 text-[9px]">
                      {item.co_art}
                    </td>
                    <td class="py-1.5 px-2">
                      <div class="font-bold text-zinc-900 leading-tight">{item.art_des || item.des_art || item.co_art}</div>
                      {#if item.referencia || item.modelo}
                        <div class="text-[8px] text-zinc-600">
                          {item.referencia ? `Ref: ${item.referencia}` : ''} {item.modelo ? `• Mod: ${item.modelo}` : ''}
                        </div>
                      {/if}
                    </td>
                    <td class="py-1.5 px-2 text-zinc-700 truncate max-w-[110px]">
                      {item.des_alma || item.co_alma}
                    </td>
                    <td class="py-1.5 px-2 text-center text-zinc-600 uppercase font-mono text-[9px]">
                      {item.unidad || item.co_uni || "UNID"}
                    </td>
                    <td class="py-1.5 px-2 text-center font-mono font-black text-zinc-900 text-[11px] bg-zinc-50">
                      {formatQuantity(item.cant_despachada || item.total_art)}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bottom / Footer Section (Only on final page or summary) -->
      <div class="space-y-4 pt-2">
        {#if pageObj.showTotals}
          <!-- Total Units Banner -->
          <div class="flex items-center justify-between p-2.5 bg-zinc-100 border border-zinc-300 rounded-lg text-xs">
            <span class="font-bold uppercase text-zinc-700 tracking-wider">Total Unidades Despachadas:</span>
            <span class="font-mono font-black text-zinc-900 text-sm">{formatQuantity(totalPhysicalUnits)}</span>
          </div>

          <!-- Observations -->
          {#if cleanObs}
            <div class="p-2 bg-zinc-50 border border-zinc-200 rounded text-[9px] text-zinc-700">
              <span class="font-bold uppercase text-zinc-800">Observaciones:</span> {cleanObs}
            </div>
          {/if}

          <!-- Signatures Grid -->
          <div class="grid grid-cols-3 gap-4 pt-6 text-center text-[9px]">
            <!-- Dispatcher / Warehouse -->
            <div class="space-y-1">
              <div class="border-t border-zinc-400 pt-1.5">
                <p class="font-black text-zinc-900 uppercase">Despachado Por (Almacén)</p>
                <p class="text-zinc-600">{despachadorDisplayName || "Firma y Sello"}</p>
              </div>
            </div>

            <!-- Transport / Driver -->
            <div class="space-y-1">
              <div class="border-t border-zinc-400 pt-1.5">
                <p class="font-black text-zinc-900 uppercase">Transporte / Chofer</p>
                <p class="text-zinc-600">Nombre / C.I. / Placa</p>
              </div>
            </div>

            <!-- Client / Receiver -->
            <div class="space-y-1">
              <div class="border-t border-zinc-400 pt-1.5">
                <p class="font-black text-zinc-900 uppercase">Recibido Conforme (Cliente)</p>
                <p class="text-zinc-600">Firma / C.I. / Fecha</p>
              </div>
            </div>
          </div>
        {/if}

        <!-- Pagination & Timestamp Footer -->
        <div class="flex items-center justify-between text-[8px] text-zinc-400 border-t border-zinc-200 pt-1">
          <span>Generado por Sync2K Enterprise • {dayjs().format("DD/MM/YYYY hh:mm:ss A")}</span>
          <span>Página {pageIndex + 1} de {paginatedPages.length}</span>
        </div>
      </div>
    </div>
  {/each}
</div>
