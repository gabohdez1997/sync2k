<!-- src/routes/dashboard/users/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-white">Gestión de Usuarios</h2>
			<p class="text-zinc-400">Administra los accesos y roles de tu equipo.</p>
		</div>
		<button class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
			+ Invitar Usuario
		</button>
	</div>

	<div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
		<table class="w-full text-left">
			<thead>
				<tr class="border-b border-zinc-800 bg-zinc-900/50">
					<th class="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Usuario</th>
					<th class="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Roles</th>
					<th class="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Estado</th>
					<th class="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Acciones</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-zinc-800">
				{#each data.users as user}
					<tr class="hover:bg-zinc-800/30 transition-colors">
						<td class="px-6 py-4">
							<div class="flex items-center gap-3">
								<div class="h-8 w-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
									{user.full_name?.[0]?.toUpperCase() ?? '?'}
								</div>
								<div>
									<p class="text-sm font-medium text-white">{user.full_name}</p>
									<p class="text-xs text-zinc-500">{user.id.slice(0, 8)}...</p>
								</div>
							</div>
						</td>
						<td class="px-6 py-4">
							<div class="flex flex-wrap gap-1">
								{#each user.user_roles || [] as ur}
									<span class="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] border border-zinc-700">
										{ur.roles?.name}
									</span>
								{/each}
							</div>
						</td>
						<td class="px-6 py-4">
							<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium 
								{user.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">
								<span class="h-1 w-1 rounded-full {user.is_active ? 'bg-emerald-400' : 'bg-red-400'}"></span>
								{user.is_active ? 'Activo' : 'Inactivo'}
							</span>
						</td>
						<td class="px-6 py-4">
							<div class="flex items-center gap-3">
								<form method="POST" action="?/toggleStatus" use:enhance>
									<input type="hidden" name="userId" value={user.id} />
									<input type="hidden" name="active" value={user.is_active} />
									<button class="text-xs text-zinc-400 hover:text-white transition">
										{user.is_active ? 'Desactivar' : 'Activar'}
									</button>
								</form>
								<button class="text-xs text-indigo-400 hover:text-indigo-300 transition">Editar</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
