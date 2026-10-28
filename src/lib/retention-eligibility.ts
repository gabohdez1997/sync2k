export interface ClientTaxLike {
	co_cli?: string | null;
	rif?: string | null;
	tipo_per?: string | null;
	sTipo_Per?: string | null;
	contrib?: boolean | number | string | null;
	bContrib?: boolean | number | string | null;
	contribuyente?: boolean | number | string | null;
	contribu_e?: boolean | number | string | null;
	bContribu_E?: boolean | number | string | null;
	porc_esp?: number | string | null;
	dePorc_Esp?: number | string | null;
}

function toBool(val: unknown): boolean {
	return (
		val === true ||
		val === 1 ||
		val === '1' ||
		String(val ?? '')
			.trim()
			.toLowerCase() === 'true'
	);
}

function normalizeTaxId(raw: string | null | undefined): string {
	return String(raw ?? '')
		.trim()
		.toUpperCase()
		.replace(/[\s.-]/g, '');
}

/**
 * Determina si un cliente es Persona Natural según su RIF/Cédula y tipo_per de Profit Plus.
 * - RIF con formato J/G/C + dígitos => Persona Jurídica / Ente Gubernamental / Comuna (NO es Persona Natural).
 * - RIF con formato V/E/P + dígitos o solo dígitos (Cédula) => Persona Natural.
 * - Si el RIF no es concluyente, se evalúa co_cli (si tiene formato RIF/Cédula) y finalmente tipo_per ('1' PNR, '2' PNNR).
 */
export function isPersonaNaturalClient(client: ClientTaxLike | null | undefined): boolean {
	if (!client) return false;

	const cleanRif = normalizeTaxId(client.rif);
	if (/^[JGC]\d{5,12}$/.test(cleanRif)) return false;
	if (/^[VEP]\d{5,12}$/.test(cleanRif)) return true;
	if (/^\d{5,12}$/.test(cleanRif)) return true;

	const cleanCoCli = normalizeTaxId(client.co_cli);
	if (/^[JGC]\d{5,12}$/.test(cleanCoCli)) return false;
	if (/^[VEP]\d{5,12}$/.test(cleanCoCli)) return true;

	const tp = String(client.sTipo_Per ?? client.tipo_per ?? '').trim();
	if (tp === '1' || tp === '2') return true;
	if (tp === '3' || tp === '4' || tp === '6') return false;

	if (/^\d{6,12}$/.test(cleanCoCli)) return true;
	return false;
}

/**
 * Infiere el código tipo_per sugerido en Profit Plus a partir de un RIF/Cédula:
 * - J/G/C => '3' (Persona Jurídica Domiciliada), respetando '4', '5' o '6' si ya estaban seleccionados.
 * - V/E/P o Cédula numérica => '1' (Persona Natural Residente), respetando '2' (PNNR) si ya estaba seleccionado.
 */
export function inferTipoPerFromRif(rif: string | null | undefined, currentTipoPer = '1'): string {
	const cleanRif = normalizeTaxId(rif);
	const current = String(currentTipoPer || '1').trim() || '1';

	if (/^[JGC]\d{5,12}$/.test(cleanRif)) {
		return current === '4' || current === '5' || current === '6' ? current : '3';
	}
	if (/^[VEP]\d{5,12}$/.test(cleanRif) || /^\d{5,12}$/.test(cleanRif)) {
		return current === '2' ? '2' : '1';
	}
	return current;
}

/**
 * Determina si el cliente califica como Agente de Retención de IVA (Contribuyente Especial):
 * 1) NO es Persona Natural,
 * 2) Posee marca de Contribuyente Especial activa (contribu_e),
 * 3) Posee porcentaje de retención especial > 0 (ej. 75% o 100%).
 */
export function isContribuyenteEspecialClient(client: ClientTaxLike | null | undefined): boolean {
	if (!client) return false;
	if (isPersonaNaturalClient(client)) return false;
	const hasFlag = toBool(client.bContribu_E ?? client.contribu_e);
	const porc = Number(client.dePorc_Esp ?? client.porc_esp ?? 0) || 0;
	return hasFlag && porc > 0;
}

/**
 * Devuelve el porcentaje efectivo de retención de IVA del cliente (0 si no califica).
 */
export function getEffectivePorcEsp(client: ClientTaxLike | null | undefined): number {
	if (!isContribuyenteEspecialClient(client)) return 0;
	return Number(client?.dePorc_Esp ?? client?.porc_esp ?? 0) || 0;
}

/**
 * Determina si el cliente puede aplicar retención de ISLR sobre documentos fiscales (FACT / N/DB):
 * Exclusivamente Personas Jurídicas / Entes (nunca Personas Naturales).
 */
export function canClientRetainIslr(client: ClientTaxLike | null | undefined): boolean {
	if (!client) return false;
	return !isPersonaNaturalClient(client);
}
