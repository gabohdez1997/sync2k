<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { LayoutDashboard } from 'lucide-svelte';
	let { data }: { data: PageData } = $props();

	const stats = [
		{ label: 'Facturado Mensual', value: '$12,450.00', change: '+12.5%', trend: 'up' },
		{ label: 'Pedidos Pendientes', value: '45', change: '-2', trend: 'down' },
		{ label: 'Stock Crítico', value: '12', change: '+3', trend: 'up' },
		{ label: 'Clientes Nuevos', value: '128', change: '+24', trend: 'up' },
	];
</script>

<div class="space-y-8">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <LayoutDashboard size={40} class="text-brand-500" />
        Resumen General
      </h1>
      <p class="text-text-muted mt-2 text-lg italic">
        Bienvenido, <span class="text-brand-400 not-italic">{data.profile?.full_name?.split(' ')[0] ?? 'Usuario'}</span>. 
        Vista global de {data.profile?.company?.name ?? 'tu empresa'}.
      </p>
    </div>
  </div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		{#each stats as stat}
			<div class="bg-surface-raised border border-border-subtle rounded-xl p-6 hover:border-brand-500/30 transition shadow-sm">
				<p class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{stat.label}</p>
				<div class="flex items-baseline gap-2">
					<span class="text-2xl font-bold text-text-base">{stat.value}</span>
					<span class="text-xs font-bold {stat.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}">
						{stat.change}
					</span>
				</div>
			</div>
		{/each}
	</div>

	<!-- Recent Activity Placeholder -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<div class="lg:col-span-2 glass rounded-xl p-6 h-64 flex flex-col items-center justify-center text-center space-y-2">
			<div class="h-12 w-12 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trending-up"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
			</div>
			<h3 class="text-sm font-semibold text-text-base">Gráfico de Ventas</h3>
			<p class="text-xs text-text-muted max-w-xs">Los datos de ventas aparecerán aquí una vez que comiences a generar facturas.</p>
		</div>
		<div class="bg-surface-raised border border-border-subtle rounded-xl p-6 h-64">
			<h3 class="text-sm font-semibold text-text-base mb-4">Actividad Reciente</h3>
			<div class="space-y-4">
				{#each Array(4) as _, i}
					<div class="flex items-start gap-3">
						<div class="h-2 w-2 rounded-full bg-brand-500 mt-1.5 shrink-0"></div>
						<div class="min-w-0">
							<p class="text-xs text-text-base/80 truncate font-medium">Nueva factura #F-2024-{100 + i}</p>
							<p class="text-[10px] text-text-muted">Hace {i + 1} horas</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
