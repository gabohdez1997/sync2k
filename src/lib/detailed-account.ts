export interface DetailedAccountDoc {
    nro_doc: string;
    co_tipo_doc: string;
    fec_emis: string | Date;
    fec_venc?: string | Date;
    nro_orig?: string | null;
    doc_orig?: string | null;
    total_usd: number;
    total_bs: number;
    saldo_usd?: number;
    saldo_bs?: number;
    anulado?: boolean;
    sede_id?: string;
    isChild?: boolean;
    [key: string]: any;
}

/**
 * Agrupa y ordena los documentos de cuenta detallada.
 * - Los documentos principales (Facturas, Notas de Débito, Giros) encabezan su grupo.
 * - Los cobros (COBR), notas de crédito (NCR / N/CR) y retenciones asociadas se sitúan inmediatamente debajo de la factura a la que pertenecen.
 * - Los grupos se ordenan por la fecha de emisión del documento principal (o del grupo) de forma cronológica ascendente.
 * - Dentro de cada grupo, la factura va primero y sus cobros/NCR le siguen cronológicamente.
 */
export function organizeDetailedAccountDocs(docs: DetailedAccountDoc[]): DetailedAccountDoc[] {
    if (!docs || docs.length === 0) return [];

    const clean = (s: any) => String(s || '').trim();
    const cleanUpper = (s: any) => clean(s).toUpperCase();
    const cleanNum = (s: any) => clean(s).replace(/^0+/, '') || '0';

    const normalizeDocType = (t: any) => {
        const s = cleanUpper(t);
        if (s === 'NCR') return 'N/CR';
        if (s === 'NDEB') return 'N/DB';
        if (s === 'FAC') return 'FACT';
        if (s === 'COB') return 'COBR';
        return s;
    };

    const isMatch = (docA: any, nroOrig: string, docOrig: string) => {
        const docANro = clean(docA.nro_doc);
        const origNro = clean(nroOrig);
        const numMatch = docANro === origNro || (cleanNum(docANro) === cleanNum(origNro) && cleanNum(origNro) !== '0');
        if (!numMatch) return false;

        if (!docOrig) return true;
        return normalizeDocType(docA.co_tipo_doc) === normalizeDocType(docOrig);
    };

    // Tipos de documentos principales (Debe / Deuda) que nunca son hijos subordinados de otros en este estado de cuenta
    const DEBIT_PARENT_TYPES = new Set(['FACT', 'N/DB', 'NDEB', 'GIRO', 'AJPA', 'AJPM', 'IVAP']);

    // Identificar si un documento es un pago / crédito / retención dependiente de un origen
    const childCandidate = (d: DetailedAccountDoc) => {
        const tipo = normalizeDocType(d.co_tipo_doc);
        if (DEBIT_PARENT_TYPES.has(tipo)) return false;

        const nroOrig = clean(d.nro_orig);
        const docOrig = cleanUpper(d.doc_orig);
        const nroDoc = clean(d.nro_doc);

        if (!nroOrig) return false;
        // Si el número de origen y tipo apuntan a sí mismo, no es hijo
        if (nroDoc === nroOrig && (!docOrig || normalizeDocType(docOrig) === tipo)) return false;

        return true;
    };

    interface Group {
        id: string;
        parent: DetailedAccountDoc | null;
        children: DetailedAccountDoc[];
        baseDate: number;
        sortKey: string;
    }

    const groups: Group[] = [];
    const parentToGroup = new Map<DetailedAccountDoc, Group>();
    const unparentedChildren: DetailedAccountDoc[] = [];

    // Paso 1: Crear grupo para cada documento principal (Facturas, Giros, etc. o documentos no subordinados)
    for (const doc of docs) {
        if (!childCandidate(doc)) {
            const grp: Group = {
                id: `${normalizeDocType(doc.co_tipo_doc)}_${clean(doc.nro_doc)}`,
                parent: doc,
                children: [],
                baseDate: new Date(doc.fec_emis).getTime(),
                sortKey: clean(doc.nro_doc)
            };
            groups.push(grp);
            parentToGroup.set(doc, grp);
        }
    }

    // Paso 2: Asociar cobros, NCR y retenciones con su factura u origen en docs
    for (const doc of docs) {
        if (childCandidate(doc)) {
            const nroOrig = clean(doc.nro_orig);
            const docOrig = cleanUpper(doc.doc_orig);

            let matchedGrp: Group | undefined;

            for (const grp of groups) {
                if (grp.parent && isMatch(grp.parent, nroOrig, docOrig)) {
                    // Priorizar la misma sede si existe
                    if (doc.sede_id && grp.parent.sede_id && doc.sede_id === grp.parent.sede_id) {
                        matchedGrp = grp;
                        break;
                    }
                    if (!matchedGrp) {
                        matchedGrp = grp;
                    }
                }
            }

            if (matchedGrp) {
                matchedGrp.children.push(doc);
            } else {
                unparentedChildren.push(doc);
            }
        }
    }

    // Paso 3: Agrupar documentos hijos cuyo origen no se encuentra en la lista (ej. cobros de facturas antiguas)
    const orphanGroups = new Map<string, Group>();
    for (const child of unparentedChildren) {
        const nroOrig = clean(child.nro_orig);
        const docOrig = cleanUpper(child.doc_orig);
        const orphanKey = nroOrig ? `${docOrig || 'DOC'}_${nroOrig}` : `STANDALONE_${child.co_tipo_doc}_${child.nro_doc}`;

        let grp = orphanGroups.get(orphanKey);
        if (!grp) {
            grp = {
                id: orphanKey,
                parent: null,
                children: [child],
                baseDate: new Date(child.fec_emis).getTime(),
                sortKey: nroOrig || clean(child.nro_doc)
            };
            orphanGroups.set(orphanKey, grp);
            groups.push(grp);
        } else {
            grp.children.push(child);
            const cDate = new Date(child.fec_emis).getTime();
            if (cDate < grp.baseDate) {
                grp.baseDate = cDate;
            }
        }
    }

    // Paso 4: Ordenar grupos por fecha de emisión ascendente y número de documento origen
    groups.sort((a, b) => {
        if (a.baseDate !== b.baseDate) {
            return a.baseDate - b.baseDate;
        }
        return a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true });
    });

    // Paso 5: Aplanar grupos en la lista final con la factura primero y sus cobros/NCR debajo
    const result: DetailedAccountDoc[] = [];

    for (const grp of groups) {
        if (grp.parent) {
            result.push({
                ...grp.parent,
                isChild: false
            });
        }

        // Ordenar los cobros/NCR del grupo: por fecha de emisión, luego tipo (NCR antes de COBR), luego correlativo
        grp.children.sort((a, b) => {
            const dateDiff = new Date(a.fec_emis).getTime() - new Date(b.fec_emis).getTime();
            if (dateDiff !== 0) return dateDiff;

            const typeWeight = (t: any) => {
                const norm = normalizeDocType(t);
                if (norm === 'N/CR') return 1;
                if (norm === 'ISLR' || norm === 'IVAN' || norm === 'IVAP') return 2;
                if (norm === 'COBR') return 3;
                return 4;
            };

            const wDiff = typeWeight(a.co_tipo_doc) - typeWeight(b.co_tipo_doc);
            if (wDiff !== 0) return wDiff;

            return clean(a.nro_doc).localeCompare(clean(b.nro_doc), undefined, { numeric: true });
        });

        for (const child of grp.children) {
            result.push({
                ...child,
                isChild: !!grp.parent
            });
        }
    }

    return result;
}
