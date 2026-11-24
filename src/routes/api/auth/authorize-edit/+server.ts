import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { getSupabaseAdmin } from '$lib/server/supabase';
import type { Profile } from '$lib/server/auth';
import type { RequestHandler } from './$types';

async function fetchRolesMap(fetchFn: typeof fetch): Promise<Map<string, any>> {
	const map = new Map<string, any>();

	try {
		const supabaseAdmin = getSupabaseAdmin(fetchFn);
		const { data, error } = await supabaseAdmin
			.from('roles')
			.select('id, name, permissions, branch_ids');

		if (!error && Array.isArray(data)) {
			for (const role of data) {
				if (role?.id) {
					map.set(String(role.id).toLowerCase(), role);
				}
			}
			return map;
		}
	} catch {
		// Continuar a fallback local
	}

	try {
		const { queryLocalDb } = await import('$lib/server/local-db');
		const res = await queryLocalDb('SELECT id, name, permissions, branch_ids FROM roles', []);
		for (const role of res.rows || []) {
			if (role?.id) {
				map.set(String(role.id).toLowerCase(), role);
			}
		}
	} catch {
		// Ignorar
	}

	return map;
}

function canProfileAuthorizeModule(
	p: Profile,
	module: string,
	branchId: string,
	rolesMap: Map<string, any>
): boolean {
	const cleanModule = String(module || '').trim();
	if (!cleanModule) return false;

	const userRoles = Array.isArray(p?.roles) ? p.roles : [];
	if (userRoles.length === 0) return false;

	const authorizingRoles: any[] = [];
	for (const r of userRoles) {
		const roleId = typeof r === 'object' ? String(r?.id || '').trim().toLowerCase() : '';
		let roleObj = roleId ? rolesMap.get(roleId) : undefined;

		if (!roleObj && typeof r === 'string') {
			const cleanRef = r.trim().toLowerCase();
			roleObj =
				rolesMap.get(cleanRef) ||
				Array.from(rolesMap.values()).find(
					(candidate) => String(candidate?.name || '').trim().toLowerCase() === cleanRef
				);
		}

		if (roleObj?.permissions?.[cleanModule]?.authorize === true) {
			authorizingRoles.push(roleObj);
		}
	}

	if (authorizingRoles.length === 0) {
		return false;
	}

	const cleanBranchId = String(branchId || '').trim().toLowerCase();
	if (!cleanBranchId) {
		return true;
	}

	const profileBranchIds = new Set(
		(Array.isArray(p?.allowed_branches) ? p.allowed_branches : [])
			.map((b: any) => String(b?.id || '').trim().toLowerCase())
			.filter(Boolean)
	);

	return authorizingRoles.some((roleObj) => {
		const roleBranchIds = Array.isArray(roleObj?.branch_ids)
			? roleObj.branch_ids.map((id: any) => String(id || '').trim().toLowerCase()).filter(Boolean)
			: [];
		return roleBranchIds.includes(cleanBranchId) || profileBranchIds.has(cleanBranchId);
	});
}

async function fetchActiveProfiles(fetchFn: typeof fetch): Promise<Profile[]> {
	try {
		const supabaseAdmin = getSupabaseAdmin(fetchFn);
		const { data, error } = await supabaseAdmin
			.from('profile_complete')
			.select('*')
			.eq('active', true);

		if (!error && Array.isArray(data)) {
			return data as Profile[];
		}
	} catch {
		// Continuar a fallback local
	}

	try {
		const { queryLocalDb } = await import('$lib/server/local-db');
		const res = await queryLocalDb('SELECT * FROM profile_complete WHERE active = true', []);
		return (res.rows || []) as Profile[];
	} catch {
		return [];
	}
}

async function fetchProfileByEmail(email: string, fetchFn: typeof fetch): Promise<Profile | null> {
	const cleanEmail = email.trim();
	try {
		const supabaseAdmin = getSupabaseAdmin(fetchFn);
		const { data, error } = await supabaseAdmin
			.from('profile_complete')
			.select('*')
			.ilike('email', cleanEmail)
			.limit(1);

		if (!error && data && data.length > 0) {
			return data[0] as Profile;
		}
	} catch {
		// Continuar a fallback local
	}

	try {
		const { queryLocalDb } = await import('$lib/server/local-db');
		const res = await queryLocalDb(
			'SELECT * FROM profile_complete WHERE LOWER(email) = LOWER($1) LIMIT 1',
			[cleanEmail]
		);
		if (res.rows && res.rows.length > 0) {
			return res.rows[0] as Profile;
		}
	} catch {
		// Ignorar
	}

	return null;
}

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	const currentProfile = (locals as any).profile;
	if (!currentProfile) {
		return json({ success: false, message: 'No autenticado.' }, { status: 401 });
	}

	const module = (url.searchParams.get('module') || '').trim();
	const branchId = (url.searchParams.get('branch_id') || '').trim();

	if (!module) {
		return json({ success: false, message: 'Parámetro module es requerido.' }, { status: 400 });
	}

	try {
		const [allProfiles, rolesMap] = await Promise.all([
			fetchActiveProfiles(fetch),
			fetchRolesMap(fetch)
		]);
		const authorizers = allProfiles
			.filter((p) => p && p.active && p.email)
			.filter((p) => canProfileAuthorizeModule(p, module, branchId, rolesMap))
			.map((p) => ({
				id: p.id,
				email: p.email,
				full_name: p.full_name || p.email
			}))
			.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

		return json({ success: true, authorizers });
	} catch (err: any) {
		return json(
			{ success: false, message: 'Error consultando autorizadores: ' + (err?.message || 'Error interno') },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	const currentProfile = (locals as any).profile;
	if (!currentProfile) {
		return json({ success: false, message: 'No autenticado.' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const module = String(body.module || '').trim();
		const branchId = String(body.branch_id || '').trim();
		const authorizerEmail = String(body.authorizer_email || '').trim();
		const password = String(body.password || '');
		const description = String(body.description || '').trim();
		const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

		if (!module || !authorizerEmail || !password) {
			return json(
				{ success: false, message: 'Debe seleccionar el usuario autorizador e ingresar su contraseña.' },
				{ status: 400 }
			);
		}

		const [authorizerProfile, rolesMap] = await Promise.all([
			fetchProfileByEmail(authorizerEmail, fetch),
			fetchRolesMap(fetch)
		]);
		if (!authorizerProfile || !authorizerProfile.email) {
			return json(
				{ success: false, message: 'Usuario autorizador no encontrado.' },
				{ status: 404 }
			);
		}

		if (!authorizerProfile.active) {
			return json(
				{ success: false, message: 'La cuenta del usuario autorizador está inactiva.' },
				{ status: 403 }
			);
		}

		if (!canProfileAuthorizeModule(authorizerProfile, module, '', rolesMap)) {
			return json(
				{ success: false, message: 'El usuario seleccionado no tiene permiso de Autorizar en este módulo.' },
				{ status: 403 }
			);
		}

		if (branchId && !canProfileAuthorizeModule(authorizerProfile, module, branchId, rolesMap)) {
			return json(
				{ success: false, message: 'El usuario autorizador no tiene acceso a esta sucursal.' },
				{ status: 403 }
			);
		}

		let passwordVerified = false;
		let useOfflineFallback = false;

		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
		const supabaseAnonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';

		if (supabaseUrl && supabaseAnonKey) {
			try {
				const statelessSupabase = createClient(supabaseUrl, supabaseAnonKey, {
					global: { fetch },
					auth: {
						persistSession: false,
						autoRefreshToken: false,
						detectSessionInUrl: false
					}
				});

				const { data: authData, error: authErr } = await statelessSupabase.auth.signInWithPassword({
					email: authorizerProfile.email,
					password
				});

				if (authErr) {
					const msg = authErr.message || '';
					if (
						msg.includes('fetch failed') ||
						msg.includes('Failed to fetch') ||
						msg.includes('ETIMEDOUT')
					) {
						useOfflineFallback = true;
					} else {
						return json(
							{ success: false, message: 'Contraseña incorrecta para el usuario autorizador.' },
							{ status: 401 }
						);
					}
				} else if (authData?.user) {
					passwordVerified = true;
				}
			} catch (err: any) {
				const msg = err?.message || '';
				if (msg.includes('fetch failed') || msg.includes('Failed to fetch') || msg.includes('ETIMEDOUT')) {
					useOfflineFallback = true;
				} else {
					return json(
						{ success: false, message: 'No se pudo validar la contraseña: ' + msg },
						{ status: 500 }
					);
				}
			}
		} else {
			useOfflineFallback = true;
		}

		if (!passwordVerified && useOfflineFallback) {
			try {
				const { queryLocalDb } = await import('$lib/server/local-db');
				const bcrypt = (await import('bcryptjs')).default;
				const res = await queryLocalDb(
					'SELECT id, password_hash, active FROM profiles WHERE LOWER(email) = LOWER($1) LIMIT 1',
					[authorizerProfile.email]
				);
				if (!res.rows || res.rows.length === 0 || !res.rows[0].password_hash) {
					return json(
						{ success: false, message: 'Credenciales inválidas en modo local.' },
						{ status: 401 }
					);
				}
				const isValid = await bcrypt.compare(password, res.rows[0].password_hash);
				if (!isValid) {
					return json(
						{ success: false, message: 'Contraseña incorrecta para el usuario autorizador.' },
						{ status: 401 }
					);
				}
				passwordVerified = true;
			} catch (localErr: any) {
				return json(
					{ success: false, message: 'Error validando credenciales locales: ' + (localErr?.message || '') },
					{ status: 500 }
				);
			}
		}

		if (!passwordVerified) {
			return json({ success: false, message: 'No se pudo verificar la autorización.' }, { status: 401 });
		}

		// Registrar evento en audit_log sin bloquear si falla
		try {
			const supabaseAdmin = getSupabaseAdmin(fetch);
			await supabaseAdmin.from('audit_log').insert({
				action: 'AUTHORIZE_EDIT',
				module,
				record_id: String(metadata?.record_id || 'EDIT_OVERRIDE'),
				user_email: authorizerProfile.email,
				branch_id: branchId || null,
				metadata: {
					requested_by: currentProfile?.email || 'system',
					description,
					...metadata
				}
			});
		} catch (auditErr) {
			console.warn('[AUTHORIZE-EDIT] No se pudo registrar auditoría:', auditErr);
		}

		return json({
			success: true,
			authorizer: {
				email: authorizerProfile.email,
				full_name: authorizerProfile.full_name || authorizerProfile.email
			}
		});
	} catch (err: any) {
		console.error('[AUTHORIZE-EDIT ERROR]:', err);
		return json(
			{ success: false, message: 'Error procesando autorización: ' + (err?.message || 'Error interno') },
			{ status: 500 }
		);
	}
};

