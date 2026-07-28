<script lang="ts">
  import { User } from 'lucide-svelte';

  interface Props {
    docType: string;
    docNum: string;
    statusLabel?: string | null;
    statusClass?: string | null;
    clientName: string;
    clientRif?: string | null;
    dateEmis: string;
    amountUsd: string | number;
    amountBs: string | number;
    branchName?: string | null;
    cashierName?: string | null;
    onclick: () => void;
  }

  let {
    docType,
    docNum,
    statusLabel = null,
    statusClass = null,
    clientName,
    clientRif = null,
    dateEmis,
    amountUsd,
    amountBs,
    branchName = null,
    cashierName = null,
    onclick
  }: Props = $props();
</script>

<button 
  type="button"
  {onclick}
  class="w-full p-4 rounded-2xl bg-surface-soft border border-border-subtle hover:border-brand-500/50 hover:bg-surface-strong transition-all flex items-center justify-between group text-left cursor-pointer"
>
  <!-- Left Column -->
  <div class="space-y-1.5">
    <div class="flex items-center gap-2">
      <!-- Badge de tipo de documento -->
      <span class="bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase">
        {docType}
      </span>
      <!-- Número de documento -->
      <span class="font-black text-text-base text-brand-500 group-hover:text-brand-400 transition-colors text-sm">
        {docNum}
      </span>
      <!-- Estatus badge (si aplica) -->
      {#if statusLabel}
        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border {statusClass || 'bg-brand-500/10 text-brand-400 border-brand-500/20'}">
          {statusLabel}
        </span>
      {/if}
    </div>

    <!-- Nombre de Cliente -->
    <p class="font-black text-text-base text-sm uppercase leading-tight truncate max-w-[320px] sm:max-w-[400px]">
      {String(clientName || '').toUpperCase()}
    </p>

    <!-- RIF / Cédula y Emisión -->
    <p class="text-[11px] text-text-muted/70 font-semibold leading-none flex items-center flex-wrap gap-x-1.5">
      {#if clientRif}
        <span>{clientRif} &bull;</span>
      {/if}
      <span>Emisión: {dateEmis}</span>
      {#if cashierName}
        <span class="text-brand-500/50">&bull;</span>
        <span class="text-[10px] text-text-base flex items-center gap-1 font-bold">
          <User size={10} class="text-brand-500/80" />
          {cashierName}
        </span>
      {/if}
    </p>
  </div>

  <!-- Right Column -->
  <div class="flex flex-col items-end space-y-1 text-right">
    <!-- Monto en USD -->
    <div class="text-sm font-black text-text-base leading-none">
      <span class="text-text-muted text-[10px] font-bold mr-0.5 uppercase">USD</span>
      {typeof amountUsd === 'number' ? amountUsd.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amountUsd}
    </div>

    <!-- Monto en Bs. -->
    <div class="text-[10px] text-text-muted font-bold leading-none">
      Bs. {typeof amountBs === 'number' ? amountBs.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amountBs}
    </div>

    <!-- Sucursal (si aplica) -->
    {#if branchName}
      <span class="inline-block px-2.5 py-0.5 rounded-full bg-surface-strong border border-border-subtle text-[9px] font-black uppercase text-text-muted/80 tracking-wider mt-1">
        {branchName}
      </span>
    {/if}
  </div>
</button>
