<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData } from "./$types";
  import { LayoutDashboard } from "lucide-svelte";
  let { data }: { data: PageData } = $props();
  let tasa_bcv = $state<number | null>(null);

  $effect(() => {
    fetch('/api/agent/tasa')
      .then(res => res.json())
      .then(d => {
        if (d.success) tasa_bcv = d.tasa;
      })
      .catch(e => console.error("Error loading tasa:", e));
  });

  const stats = [
    {
      label: "Facturado Mensual",
      value: "$12,450.00",
      change: "+12.5%",
      trend: "up",
    },
    { label: "Pedidos Pendientes", value: "45", change: "-2", trend: "down" },
    { label: "Stock Crítico", value: "12", change: "+3", trend: "up" },
    { label: "Clientes Nuevos", value: "128", change: "+24", trend: "up" },
  ];
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <LayoutDashboard size={40} class="text-brand-500" />
        Inicio
      </h1>
      <p class="text-text-muted mt-2 text-lg italic">
        Bienvenido, <span class="text-brand-400 not-italic"
          >{data.profile?.full_name ?? "Usuario"}
        </span>
      </p>
    </div>
  </div>

  <!-- Tasa BCV y Status -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <div
      class="bg-gradient-to-r from-surface-raised to-brand-500/10 border border-brand-500/30 rounded-2xl p-6 transition shadow-lg relative overflow-hidden group"
    >
      <div
        class="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      <p
        class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2"
      >
        Tasa de Cambio BCV
      </p>
      <div class="flex items-baseline gap-2">
        <span class="text-4xl font-black text-brand-100">
          {#if tasa_bcv}
            Bs. {Number(tasa_bcv).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {:else}
            <span class="text-text-muted/50 text-2xl">Buscando...</span>
          {/if}
        </span>
      </div>
      <p class="text-xs text-text-muted/80 mt-2">
        Sincronizado vía Agente Profit Plus
      </p>
    </div>
  </div>
</div>
