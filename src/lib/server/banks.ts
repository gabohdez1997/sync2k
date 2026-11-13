import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission, type Profile } from '$lib/server/auth';
import { getBranchById } from '$lib/server/branches';

export type BankBranch = Profile['allowed_branches'][number];

export function resolveBankBranchClient(
	profile: Profile,
	branchId: string,
	svelteFetch: typeof fetch
): { branch: BankBranch; agentClient: AgentClient } | { error: string; status: number } {
	if (!branchId) {
		return { error: 'Parámetro branch_id es obligatorio.', status: 400 };
	}

	const branch = profile.allowed_branches?.find((b) => b.id === branchId);
	if (!branch) {
		return { error: 'Sucursal no autorizada para este usuario.', status: 403 };
	}
	if (!branch.agent_url) {
		return { error: 'Sucursal sin URL de agente configurada.', status: 400 };
	}

	const agentClient = new AgentClient(
		{
			id: branch.id,
			slug: branch.id,
			name: branch.name,
			agent_url: branch.agent_url,
			agent_token: branch.agent_token,
			agent_api_key: branch.agent_token
		} as any,
		profile,
		svelteFetch
	);

	return { branch, agentClient };
}

export async function assertBankMovementOwnership(
	agentClient: AgentClient,
	branchId: string,
	movNum: string,
	profile: Profile,
	module: 'bank_movements' | 'bank_reconciliation' = 'bank_movements'
): Promise<{ allowed: boolean; message?: string; status?: number }> {
	if (hasPermission(profile, module, 'others')) {
		return { allowed: true };
	}

	const profitUser = (profile.profit_user || '').trim().toUpperCase();
	if (!profitUser) {
		return {
			allowed: false,
			status: 403,
			message: 'Tu perfil no tiene asociado un usuario de Profit Plus para operar movimientos propios.'
		};
	}

	const detail: any = await agentClient.request(
		`/bancos/movimientos/${encodeURIComponent(movNum.trim())}?sede=${encodeURIComponent(branchId)}`
	);
	if (!detail || detail.success === false || !detail.data) {
		return { allowed: false, status: 404, message: detail?.message || 'Movimiento no encontrado.' };
	}

	const owner = String(detail.data.co_us_in || '').trim().toUpperCase();
	if (owner && owner !== profitUser) {
		return {
			allowed: false,
			status: 403,
			message: 'No tienes permiso para ver o modificar movimientos de otros usuarios.'
		};
	}

	return { allowed: true };
}

export async function logBankAudit(params: {
	action: 'CREATE' | 'UPDATE' | 'VOID' | 'DELETE' | 'RECONCILE';
	module: 'bank_movements' | 'bank_reconciliation';
	recordId: string;
	userEmail: string;
	branchId: string;
	metadata?: Record<string, any>;
}) {
	try {
		await supabaseAdmin.from('audit_log').insert({
			action: params.action,
			module: params.module,
			record_id: params.recordId,
			user_email: params.userEmail || 'system',
			branch_id: params.branchId,
			metadata: params.metadata || {}
		});
	} catch (err) {
		console.error(`[AUDIT ERROR] Error logging ${params.module} ${params.action}:`, err);
	}
}

export interface CompanyPrintHeader {
	name: string;
	rif: string;
	address: string;
	phone: string;
	logo_url: string;
	branch_name: string;
}

export async function getCompanyPrintHeader(
	branch: BankBranch,
	allowedBranches?: any[],
	fetchFn?: typeof fetch
): Promise<CompanyPrintHeader> {
	let fullBranch: any = null;
	try {
		fullBranch = await getBranchById(branch?.id, allowedBranches, fetchFn);
	} catch (e) {
		console.warn('[BANKS PRINT] No se pudo cargar sucursal completa:', e);
	}

	let settings: any = {};
	try {
		const { data: sysSettings } = await supabaseAdmin.from('system_settings').select('*').limit(1).maybeSingle();
		if (sysSettings) settings = sysSettings;
	} catch (e) {
		console.warn('[BANKS PRINT] No se pudieron cargar system_settings:', e);
	}

	return {
		name: fullBranch?.business_name || fullBranch?.name || branch?.name || settings?.company_name || 'INVERSIONES GALPE, C.A.',
		rif: fullBranch?.rif || settings?.company_rif || 'J401750354',
		address: fullBranch?.address || settings?.company_address || '',
		phone: fullBranch?.phone || settings?.company_phone || '',
		logo_url: fullBranch?.logo_url || settings?.app_logo_url || settings?.company_logo_url || '',
		branch_name: fullBranch?.name || branch?.name || 'Sede Principal'
	};
}

