<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Helper for QR code URL
  function getQRUrl(code: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`;
  }
</script>

<svelte:head>
  <title>Etiquetas de Artículos - {data.companyName}</title>
</svelte:head>

<div class="print-container">
  {#if data.error}
    <div
      class="no-print p-6 bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl m-4 font-bold"
    >
      <h3 class="text-lg">Error al cargar etiquetas</h3>
      <p class="text-sm opacity-80 mt-1">{data.error}</p>
    </div>
  {:else if data.articles.length === 0}
    <div
      class="no-print p-20 text-center flex flex-col items-center gap-4 opacity-50"
    >
      <div
        class="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lucide lucide-package-x"
          ><path
            d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"
          /><path d="m7.5 4.27 9 5.15" /><polyline
            points="3.29 7 12 12 20.71 7"
          /><line x1="12" x2="12" y1="22" y2="12" /><path d="m17 13 5 5" /><path
            d="m22 13-5 5"
          /></svg
        >
      </div>
      <div>
        <h3 class="text-xl font-bold">Sin resultados</h3>
        <p class="text-sm">
          No se encontraron artículos con los filtros aplicados.
        </p>
      </div>
      <button
        onclick={() => window.history.back()}
        class="mt-4 px-6 py-2 bg-gray-800 text-white rounded-xl font-bold"
        >Volver atrás</button
      >
    </div>
  {:else}
    <div class="label-grid">
      {#each data.articles as article}
        <div class="label-box">
          {#if data.companyLogo}
            <div class="label-watermark">
              <img src={data.companyLogo} alt="" class="watermark-img" />
            </div>
          {/if}
          <div class="label-content">
            <div class="article-info">
              <h2 class="article-name">
                {article.art_des ||
                  article.descripcion ||
                  article.name ||
                  "SIN DESCRIPCIÓN"}
              </h2>
              <div class="article-code-row">
                <span class="code-label">Código del Artículo</span>
                <span class="code-value"
                  >{article.co_art || article.codigo || article.id}</span
                >
              </div>
            </div>
            <div class="article-qr">
              <img
                src={getQRUrl(article.co_art || article.codigo || article.id)}
                alt="QR Code"
                class="qr-img"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="no-print fixed bottom-4 md:bottom-8 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 md:gap-4 pointer-events-auto z-[9999]">
  <button
    onclick={() => window.print()}
    class="w-full md:w-auto justify-center bg-blue-600 text-white px-5 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-2"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="lucide lucide-printer"
      ><path
        d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
      /><rect width="12" height="8" x="6" y="14" rx="1" /><path
        d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"
      /></svg
    >
    IMPRIMIR ETIQUETAS
  </button>
  <button
    onclick={() => window.history.back()}
    class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-5 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold shadow-xl hover:bg-gray-700 transition-all active:scale-95"
  >
    VOLVER
  </button>
</div>

<style>
  /* Base Styles for Screen */
  :global(body) {
    background: #f4f4f7 !important;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
  }

  .print-container {
    background: white;
    box-shadow: 0 0 50px rgba(0, 0, 0, 0.1);
    width: 21.59cm; /* Letter width */
    min-height: 27.94cm; /* Letter height */
    margin: 40px auto;
    padding: 0.5cm;
    box-sizing: border-box;
  }

  .label-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    border-top: 1px solid #000;
    border-left: 1px solid #000;
  }

  .label-box {
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    height: 4.5cm; /* ~6 labels per column in a page */
    padding: 18px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: white;
    position: relative;
    overflow: hidden;
  }

  /* Watermark: stays in the description area, not reaching the QR */
  .label-watermark {
    position: absolute;
    top: 50%;
    left: 18px;
    /* Stop before the QR area (95px QR + 4px padding + 18px right padding = ~117px from right) */
    right: calc(95px + 4px + 18px + 15px);
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 0;
  }

  .watermark-img {
    max-height: 100px;
    max-width: 100%;
    width: auto;
    object-fit: contain;
    opacity: 1;
    /*filter: grayscale(100%);*/
  }

  .label-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    height: 100%;
    position: relative;
    z-index: 1;
  }

  .article-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    min-width: 0; /* Allow shrinking for name */
  }

  .article-name {
    font-size: 13.5px;
    font-weight: 800;
    margin: 0;
    line-height: 1.25;
    text-transform: uppercase;
    display: -webkit-box;
    -webkit-line-clamp: 4; /* More lines */
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: #000;
  }

  .article-code-row {
    margin-top: 5px;
  }

  .code-label {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: bold;
    display: block;
    color: #555;
    letter-spacing: 0.5px;
  }

  .code-value {
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #000;
    font-family: "Courier New", Courier, monospace; /* Monospaced for codes */
  }

  .article-qr {
    flex-shrink: 0;
    background: #fff;
    padding: 4px;
    border: 1px solid #eee;
  }

  .qr-img {
    width: 95px;
    height: 95px;
    display: block;
    image-rendering: pixelated; /* Sharp QR codes */
  }

  /* Print Styles */
  @media print {
    /* The standalone +layout.svelte ensures no dashboard chrome exists.
     * We just need to: hide the floating buttons and allow multi-page flow. */
    :global(body),
    :global(html) {
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .print-container {
      width: 100% !important;
      height: auto !important;
      min-height: unset !important;
      box-shadow: none !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      position: static !important; /* normal flow → multi-page works */
    }

    /* Hide floating buttons */
    .no-print,
    .no-print * {
      display: none !important;
    }

    /* Prevent a single label from being split across pages */
    .label-box {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    @page {
      size: letter;
      margin: 0.5cm;
    }
  }
</style>
