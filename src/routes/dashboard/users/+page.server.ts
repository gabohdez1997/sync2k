// src/routes/dashboard/users/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('gestionar_usuarios', async ({ locals }) => {
	const { supabase, profile } = locals;

	// Obtener todos los usuarios de la misma empresa
	const { data: users, error } = await supabase
		.from('profiles')
		.select('*, user_roles(roles(name))')
		.eq('company_id', profile!.company_id);

	// Obtener roles disponibles para esta empresa
	const { data: roles } = await supabase
		.from('roles')
		.select('*')
		.eq('company_id', profile!.company_id);

	return {
		users: users ?? [],
		availableRoles: roles ?? []
	};
});

export const actions: Actions = {
	updateRole: protectAction('gestionar_usuarios', async ({ request, locals }) => {
		const { supabase } = locals;
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const roleId = formData.get('roleId') as string;

		if (!userId || !roleId) return fail(400, { message: 'Datos incompletos' });

		// Actualizar rol (en este ejemplo simple, borramos anteriores y asignamos el nuevo)
		await supabase.from('user_roles').delete().eq('user_id', userId);
		const { error } = await supabase.from('user_roles').insert({
			user_id: userId,
			role_id: roleId
		});

		if (error) return fail(500, { message: 'Error al actualizar rol' });
		return { success: true };
	}),

	toggleStatus: protectAction('gestionar_usuarios', async ({ request, locals }) => {
		const { supabase } = locals;
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const active = formData.get('active') === 'true';

		const { error } = await supabase
			.from('profiles')
			.update({ is_active: !active })
			.eq('id', userId);

		if (error) return fail(500, { message: 'Error al cambiar estado' });
		return { success: true };
	})
};
