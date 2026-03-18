// src/routes/dashboard/users/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { adminDb, MasterCollections, adminAuth } from '$lib/server/firebase-admin';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Helper para evitar bloqueos infinitos
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(`Timeout: ${label} excedió los ${ms}ms`)), ms);
	});
	return Promise.race([promise, timeout]);
};

export const load: PageServerLoad = protectLoad('sec_users', async () => {
	let users: any[] = [];
	let availableRoles: any[] = [];
	let tenants: any[] = [];

	if (adminDb) {
		try {
			console.time('[LOAD USERS PAGE]');
			// 1. Cargar Usuarios
			const usersSnap = await withTimeout(
				adminDb.collection(MasterCollections.USERS).get(),
				5000,
				'Fetch Users'
			);
			const usersList = usersSnap.docs.map(doc => {
				const data = doc.data();
				return { 
					id: doc.id,
					full_name: data.full_name || '',
					email: data.email || '',
					is_active: data.is_active ?? true,
					globalRoles: data.roles || [], // Roles globales
					tenantRoles: [] as any[], // Llenaremos esto después
					updatedAt: data.updatedAt 
						? (typeof data.updatedAt === 'string' ? data.updatedAt : (data.updatedAt.toDate?.()?.toISOString() || data.updatedAt.toString()))
						: null
				};
			});

			// 2. Cargar Roles por Empresa (roles_usuarios)
			const userTenantsSnap = await withTimeout(
				adminDb.collection(MasterCollections.USER_TENANTS).get(),
				5000,
				'Fetch Roles-Usuarios'
			);
			
			// 3. Cargar Roles disponibles
			const rolesSnap = await withTimeout(
				adminDb.collection(MasterCollections.PERMISSIONS).get(),
				5000,
				'Fetch Available Roles'
			);
			availableRoles = rolesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name ?? doc.id }));

			// 4. Cargar Empresas
			const tenantsSnap = await withTimeout(
				adminDb.collection(MasterCollections.CONNECTIONS).get(),
				5000,
				'Fetch Tenants'
			);
			tenants = tenantsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id }));

			// 5. Unificar datos: Asignar tenantRoles a cada usuario
			users = usersList.map(user => {
				const assignments = userTenantsSnap.docs
					.filter(doc => doc.data().uid === user.id)
					.map(doc => {
						const d = doc.data();
						return {
							tenantId: d.tenant_slug || d.tenantId,
							roles: d.roles || [],
							profit_user: d.profit_user || ''
						};
					});
				return { ...user, tenantRoles: assignments };
			});

			console.timeEnd('[LOAD USERS PAGE]');
		} catch (error) {
			console.error('Error fetching data for users page:', error);
		}
	}

	return {
		users,
		availableRoles,
		tenants
	};
});

export const actions: Actions = {
	saveUser: protectAction('sec_users', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const tenantId = formData.get('tenantId') as string; // Opcional: para roles por empresa
		const fullName = formData.get('full_name') as string;
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const profitUser = formData.get('profit_user') as string;
		const isActive = formData.get('is_active') === 'true';
		const roles = formData.getAll('roles') as string[];

		if (!fullName || !email) return fail(400, { message: 'Datos incompletos' });

		try {
			console.time(`[SAVE USER] ${email}`);
			let finalUid = userId || email;
			
			// 1. Sincronizar con Firebase Auth si hay AdminAuth disponible
			if (adminAuth) {
				try {
					let effectiveUserId = userId;

					if (effectiveUserId) {
						// Actualizar existente
						const updateData: any = { displayName: fullName };
						if (password) updateData.password = password;
						await adminAuth.updateUser(effectiveUserId, updateData);
					} else {
						// Crear nuevo si no existe ID
						try {
							const existingUser = await adminAuth.getUserByEmail(email);
							if (existingUser) {
								effectiveUserId = existingUser.uid;
								const updateData: any = { displayName: fullName };
								if (password) updateData.password = password;
								await adminAuth.updateUser(effectiveUserId, updateData);
							}
						} catch (e: any) {
							if (e.code === 'auth/user-not-found') {
								const newUser = await adminAuth.createUser({
									email,
									password: password || 'sync2k_default_password',
									displayName: fullName,
									emailVerified: true
								});
								effectiveUserId = newUser.uid;
							} else throw e;
						}
					}
					
					// IMPORTANTE: Asegurarnos de que el ID final sea el UID de Firebase
					finalUid = effectiveUserId || email;
				} catch (authError: any) {
					console.error('Firebase Auth Sync Error:', authError);
				}
			}

			const batch = adminDb.batch();
			
			// 2. Perfil base del usuario (USANDO SIEMPRE EL UID como ID de documento)
			const userRef = adminDb.collection(MasterCollections.USERS).doc(finalUid);
			
			const userData: any = {
				full_name: fullName,
				email: email,
				is_active: isActive,
				updatedAt: new Date().toISOString()
			};

			if (!tenantId) {
				userData.roles = roles;
			}

			if (userId) {
				batch.set(userRef, userData, { merge: true });
			} else {
				batch.set(userRef, { ...userData, createdAt: new Date().toISOString() });
			}

			// 3. Roles y Mapping por Empresa
			if (tenantId && finalUid) {
				const userTenantRef = adminDb.collection(MasterCollections.USER_TENANTS).doc(`${finalUid}_${tenantId}`);
				batch.set(userTenantRef, {
					uid: finalUid,
					tenant_slug: tenantId,
					roles: roles,
					profit_user: profitUser || '',
					updatedAt: new Date().toISOString()
				}, { merge: true });
			}

			await withTimeout(batch.commit(), 5000, 'Commit Save User');

			// 4. Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: userId ? 'UPDATE' : 'CREATE',
				entity: 'usuarios',
				entity_id: finalUid,
				tenant_id: tenantId || undefined,
				details: { fullName, email, roles, tenantId }
			});

			console.timeEnd(`[SAVE USER] ${email}`);
			return { success: true };
		} catch (error: any) {
			console.error('Error saving user:', error);
			return fail(500, { message: `Error: ${error.message}` });
		}
	}),

	toggleStatus: protectAction('sec_users', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const currentStatus = formData.get('active') === 'true';
		
		if (!userId) return fail(400, { message: 'ID de usuario no proporcionado' });

		try {
			await withTimeout(
				adminDb.collection(MasterCollections.USERS).doc(userId).update({
					is_active: !currentStatus,
					updatedAt: new Date().toISOString()
				}),
				5000,
				'Toggle User Status'
			);

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: 'TOGGLE_STATUS',
				entity: 'usuarios',
				entity_id: userId,
				details: { newStatus: !currentStatus }
			});

			return { success: true };
		} catch (error: any) {
			console.error('Error toggling status:', error);
			return fail(500, { message: `Error: ${error.message}` });
		}
	}),

	deleteUser: protectAction('sec_users', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const userId = formData.get('userId') as string;

		if (!userId) return fail(400, { message: 'ID de usuario no proporcionado' });

		try {
			const batch = adminDb.batch();
			
			// 1. Eliminar perfil global
			batch.delete(adminDb.collection(MasterCollections.USERS).doc(userId));
			
			// 2. Eliminar todas las asignaciones de tenant (OJO: Esto requiere busca previa para batch.delete)
			// Por ahora solo eliminamos el perfil base. Si se requiere limpieza total:
			const tenantRolesSnap = await adminDb.collection(MasterCollections.USER_TENANTS).where('uid', '==', userId).get();
			tenantRolesSnap.docs.forEach(doc => batch.delete(doc.ref));

			await withTimeout(batch.commit(), 5000, 'Delete User Batch');

			// 3. Eliminar de Firebase Auth (Opcional pero recomendado)
			if (adminAuth) {
				try {
					await adminAuth.deleteUser(userId);
				} catch (e) { console.error('Error deleting from Auth:', e); }
			}

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: 'DELETE',
				entity: 'usuarios',
				entity_id: userId
			});

			return { success: true };
		} catch (error: any) {
			console.error('Error deleting user:', error);
			return fail(500, { message: `Error: ${error.message}` });
		}
	})
};
