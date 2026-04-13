<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Html5Qrcode } from "html5-qrcode";
  import { X, Camera, RefreshCw, ScanLine } from "lucide-svelte";
  import { fade, scale } from "svelte/transition";

  interface Props {
    onScan: (text: string) => void;
  }

  let { onScan }: Props = $props();

  let isOpen = $state(false);
  let scanner: Html5Qrcode | null = null;
  let error = $state<string | null>(null);
  let isScanning = $state(false);

  async function startScanner() {
    try {
      error = null;
      isScanning = true;
      
      // Cleanup any existing instance first
      if (scanner) {
        try { await scanner.stop(); scanner.clear(); } catch {}
        scanner = null;
      }

      // Small delay to ensure the DOM element is rendered
      await tick();
      await new Promise((r) => setTimeout(r, 400));

      const readerElement = document.getElementById("reader");
      if (!readerElement) return;

      scanner = new Html5Qrcode("reader");
      const config = {
        fps: 20,
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0,
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          console.log("Código capturado:", decodedText);
          // Vibración táctil si es posible
          if (navigator.vibrate) navigator.vibrate(100);
          
          setTimeout(() => {
            onScan(decodedText);
            closeScanner();
          }, 300);
        },
        () => {}
      );

      // Intento de enfoque avanzado
      try {
        const track = scanner.getVideoTrack();
        if (track && "applyConstraints" in track) {
          (track as any).applyConstraints({
            advanced: [{ focusMode: "continuous" }]
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("No se pudo aplicar enfoque continuo:", e);
      }
    } catch (err: any) {
      console.error(err);
      if (err.toString().includes("Permission denied")) {
        error = "Permiso de cámara denegado. Por favor, habilítalo en la configuración de tu navegador.";
      } else {
        error = "No se pudo acceder a la cámara. Verifica que no esté en uso por otra aplicación.";
      }
      isScanning = false;
    }
  }

  function closeScanner() {
    isOpen = false;
    isScanning = false;
    
    if (scanner) {
      const s = scanner;
      scanner = null;
      s.stop()
        .then(() => {
          s.clear();
        })
        .catch((err) => {
          console.warn("Error al detener scanner:", err);
          try { s.clear(); } catch {}
        });
    }
  }

  function toggleScanner() {
    if (isOpen) {
      closeScanner();
    } else {
      isOpen = true;
      startScanner();
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node);
      },
    };
  }

  onDestroy(() => {
    if (scanner) {
      scanner.stop().catch(() => {});
    }
  });
</script>

<div class="flex items-center">
  <button
    type="button"
    class="relative h-12 w-12 flex items-center justify-center rounded-xl bg-surface-soft border border-border-subtle text-text-muted hover:text-brand-400 hover:border-brand-500/30 transition-all active:scale-95 group"
    onclick={toggleScanner}
    title="Escanear código"
  >
    <ScanLine class="h-5 w-5 group-hover:scale-110 transition-transform" />
    <span class="absolute -top-1 -right-1 flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
    </span>
  </button>
</div>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
    transition:fade={{ duration: 200 }}
  >
    <div class="fixed inset-0 bg-black/80 backdrop-blur-md" onclick={closeScanner}></div>

    <div
      class="bg-surface-raised w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl relative border border-white/10 z-10"
      transition:scale={{ duration: 300, start: 0.9 }}
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="p-8 flex justify-between items-center pb-4">
        <div>
          <h3 class="font-black text-xl tracking-tight text-text-base">Escanear Artículo</h3>
          <p class="text-[10px] text-text-muted font-bold uppercase tracking-[0.2em] mt-1">Barcode & QR Reader</p>
        </div>
        <button
          onclick={closeScanner}
          class="p-2 hover:bg-surface-soft rounded-2xl transition-colors text-text-muted hover:text-text-base"
        >
          <X class="h-6 w-6" />
        </button>
      </div>

      <!-- Scanner Area -->
      <div class="px-8 pb-8">
        {#if error}
          <div
            class="p-4 bg-red-500/10 text-red-400 rounded-2xl text-sm text-center mb-6 border border-red-500/20"
          >
            <p class="font-bold mb-3">{error}</p>
            <button
              class="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
              onclick={startScanner}
            >
              <RefreshCw class="h-3 w-3 inline mr-2" /> Reintentar
            </button>
          </div>
        {/if}

        <div
          id="reader"
          class="rounded-[2rem] overflow-hidden bg-black/40 min-h-[280px] relative border-2 border-dashed border-white/10"
        >
            {#if !isScanning && !error}
                <div class="absolute inset-0 flex flex-col items-center justify-center text-white/30 space-y-3">
                    <Camera class="h-12 w-12 animate-pulse" />
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Iniciando cámara...</span>
                </div>
            {/if}
            
            <!-- Scan Overlay -->
            <div class="absolute inset-0 border-[40px] border-black/20 pointer-events-none z-10">
                <div class="w-full h-full border border-white/20 rounded-3xl relative">
                    <!-- Scanning Line -->
                    <div class="absolute top-0 left-0 w-full h-0.5 bg-brand-500 shadow-[0_0_15px_rgba(var(--brand-rgb),0.8)] animate-scan"></div>
                    
                    <!-- Corners -->
                    <div class="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-brand-500 rounded-tl-lg"></div>
                    <div class="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-brand-500 rounded-tr-lg"></div>
                    <div class="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-brand-500 rounded-bl-lg"></div>
                    <div class="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-brand-500 rounded-br-lg"></div>
                </div>
            </div>
        </div>

        <div class="mt-8 flex flex-col items-center gap-6">
            <p class="text-[10px] text-center text-text-muted font-black uppercase tracking-[0.2em] leading-relaxed">
              Enfoca el código dentro del recuadro para identificar el artículo
            </p>
            <button 
                class="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-base transition-colors"
                onclick={closeScanner}
            >
                Cancelar escaneo
            </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(#reader video) {
    border-radius: 1.5rem;
    object-fit: cover !important;
    width: 100% !important;
    height: 100% !important;
  }
  
  .animate-scan {
    animation: scan 2s ease-in-out infinite;
  }

  @keyframes scan {
    0%, 100% { top: 0%; }
    50% { top: 100%; }
  }
</style>
