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

export interface ServiceItemLike {
	co_art?: string | null;
	codigo?: string | null;
	co_lin?: string | null;
	co_subl?: string | null;
	art_des?: string | null;
	descripcion?: string | null;
}

export interface OrderIslrRetentionInfo {
	applies: boolean;
	porcIslr: number;
	serviceKind: 'flete' | 'corte' | null;
	serviceLabel: string;
}

export interface OrderItemizedIslrRetention {
	applies: boolean;
	hasFlete: boolean;
	fleteBase: number;
	retencionFlete: number;
	porcFlete: number;
	hasCorte: boolean;
	corteBase: number;
	retencionCorte: number;
	porcCorte: number;
	totalRetencionIslr: number;
}

/**
 * Determina si un renglón corresponde a servicio de Flete (sublínea 0901 / código 0901*).
 * El flete es el único servicio 09 exento de IVA y aplica 3% de retención ISLR.
 */
export function isFleteServiceItem(item: ServiceItemLike | null | undefined): boolean {
	if (!item) return false;
	const coArt = String(item.co_art ?? item.codigo ?? '')
		.trim()
		.toUpperCase();
	const coSubl = String(item.co_subl ?? '')
		.trim()
		.toUpperCase();
	const coLin = String(item.co_lin ?? '')
		.trim()
		.toUpperCase();
	const desc = String(item.art_des ?? item.descripcion ?? '')
		.trim()
		.toUpperCase();

	if (coSubl === '0901' || coArt.startsWith('0901') || coArt.startsWith('901001')) {
		return true;
	}
	if ((coArt.startsWith('09') || coLin === '09') && desc.includes('FLETE')) {
		return true;
	}
	return false;
}

/**
 * Determina si un renglón corresponde a Corte u otro servicio de línea 09 distinto de Flete (ej. 0902*).
 * Estos servicios sí llevan IVA (cuando el documento es fiscal) y aplican 2% de retención ISLR.
 */
export function isCorteOrService09Item(item: ServiceItemLike | null | undefined): boolean {
	if (!item || isFleteServiceItem(item)) return false;
	const coArt = String(item.co_art ?? item.codigo ?? '')
		.trim()
		.toUpperCase();
	const coSubl = String(item.co_subl ?? '')
		.trim()
		.toUpperCase();
	const coLin = String(item.co_lin ?? '')
		.trim()
		.toUpperCase();

	return (
		coArt.startsWith('09') ||
		coLin === '09' ||
		coSubl.startsWith('09') ||
		coArt.startsWith('902001') ||
		coArt.startsWith('902002')
	);
}

/**
 * Evalúa si un pedido aplica retención de ISLR para un Contribuyente Especial
 * cuando incluye algún servicio cuyo código inicia por 09 (-3% Flete / -2% Corte).
 */
export function getOrderServiceIslrInfo(
	client: ClientTaxLike | null | undefined,
	items: ServiceItemLike[] | null | undefined,
	isFiscalOrder = true
): OrderIslrRetentionInfo {
	if (
		!isFiscalOrder ||
		!isContribuyenteEspecialClient(client) ||
		!Array.isArray(items) ||
		items.length === 0
	) {
		return { applies: false, porcIslr: 0, serviceKind: null, serviceLabel: '' };
	}

	let hasFlete = false;
	let hasCorte = false;

	for (const item of items) {
		if (isFleteServiceItem(item)) {
			hasFlete = true;
		} else if (isCorteOrService09Item(item)) {
			hasCorte = true;
		}
	}

	if (hasFlete) {
		return { applies: true, porcIslr: 3, serviceKind: 'flete', serviceLabel: 'Flete' };
	}
	if (hasCorte) {
		return { applies: true, porcIslr: 2, serviceKind: 'corte', serviceLabel: 'Corte' };
	}

	return { applies: false, porcIslr: 0, serviceKind: null, serviceLabel: '' };
}

/**
 * Calcula las retenciones de ISLR desglosadas por renglón de servicio:
 * - 3% sobre el monto base del Flete (0901*)
 * - 2% sobre el monto base del Corte u otro servicio (0902*)
 * No aplica a bienes ni materiales (cemento, arena, etc.).
 */
export function calculateOrderServicesIslr(
	client: ClientTaxLike | null | undefined,
	itemsWithAmounts: Array<{ item: ServiceItemLike; baseAmount: number }> | null | undefined,
	isFiscalOrder = true
): OrderItemizedIslrRetention {
	if (
		!isFiscalOrder ||
		!isContribuyenteEspecialClient(client) ||
		!Array.isArray(itemsWithAmounts) ||
		itemsWithAmounts.length === 0
	) {
		return {
			applies: false,
			hasFlete: false,
			fleteBase: 0,
			retencionFlete: 0,
			porcFlete: 3,
			hasCorte: false,
			corteBase: 0,
			retencionCorte: 2,
			totalRetencionIslr: 0,
		};
	}

	let fleteBase = 0;
	let corteBase = 0;

	for (const entry of itemsWithAmounts) {
		const it = entry?.item;
		const amt = Number(entry?.baseAmount || 0);
		if (amt <= 0) continue;

		if (isFleteServiceItem(it)) {
			fleteBase += amt;
		} else if (isCorteOrService09Item(it)) {
			corteBase += amt;
		}
	}

	const retencionFlete = fleteBase > 0 ? fleteBase * 0.03 : 0;
	const retencionCorte = corteBase > 0 ? corteBase * 0.02 : 0;
	const totalRetencionIslr = retencionFlete + retencionCorte;

	return {
		applies: totalRetencionIslr > 0,
		hasFlete: fleteBase > 0,
		fleteBase,
		retencionFlete,
		porcFlete: 3,
		hasCorte: corteBase > 0,
		corteBase,
		retencionCorte,
		porcCorte: 2,
		totalRetencionIslr,
	};
}

