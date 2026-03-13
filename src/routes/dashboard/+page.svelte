<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const stats = [
		{ label: 'Facturado Mensual', value: '$12,450.00', change: '+12.5%', trend: 'up' },
		{ label: 'Pedidos Pendientes', value: '45', change: '-2', trend: 'down' },
		{ label: 'Stock Crítico', value: '12', change: '+3', trend: 'up' },
		{ label: 'Clientes Nuevos', value: '128', change: '+24', trend: 'up' },
	];
</script>

<div class="space-y-8">
	<div>
		<h2 class="text-2xl font-bold text-white">Bienvenido, {data.profile?.full_name?.split(' ')[0] ?? 'Usuario'}</h2>
		<p class="text-zinc-400">Resumen general de {data.profile?.company?.name ?? 'tu empresa'}.</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		{#each stats as stat}
			<div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition">
				<p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{stat.label}</p>
				<div class="flex items-baseline gap-2">
					<span class="text-2xl font-bold text-white">{stat.value}</span>
					<span class="text-xs font-semibold {stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}">
						{stat.change}
					</span>
				</div>
			</div>
		{/each}
	</div>

	<!-- Recent Activity Placeholder -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<div class="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-64 flex flex-col items-center justify-center text-center space-y-2">
			<div class="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">📈</div>
			<h3 class="text-sm font-medium text-white">Gráfico de Ventas</h3>
			<p class="text-xs text-zinc-500 max-w-xs">Los datos de ventas aparecerán aquí una vez que comiences a generar facturas.</p>
		</div>
		<div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-64">
			<h3 class="text-sm font-medium text-white mb-4">Actividad Reciente</h3>
			<div class="space-y-4">
				{#each Array(4) as _, i}
					<div class="flex items-start gap-3">
						<div class="h-2 w-2 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
						<div class="min-w-0">
							<p class="text-xs text-zinc-300 truncate">Nueva factura #F-2024-{100 + i}</p>
							<p class="text-[10px] text-zinc-500">Hace {i + 1} horas</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
