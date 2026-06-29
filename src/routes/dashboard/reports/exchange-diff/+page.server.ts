import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_exchange_diff', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            binanceAverage: 0,
            binanceAds: [],
            profitRate: 0,
            branches: [],
            selectedBranchId: '',
            transAmount: 0,
            filterType: 'p2p',
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    const transAmountStr = url.searchParams.get('trans_amount') || '15000000';
    const transAmount = parseFloat(transAmountStr) || 15000000;
    const filterType = url.searchParams.get('filter_type') || 'block'; // Default to 'block' (merchant)

    let binanceAverage = 0;
    let binanceAds: any[] = [];
    let binanceError: string | null = null;

    // 1. Fetch Binance P2P Ads
    try {
        const publisherType = filterType === 'block' ? 'merchant' : null;
        const classify = filterType === 'block' ? 'BLOCK' : null;

        const binanceRes = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            body: JSON.stringify({
                asset: 'USDT',
                fiat: 'VES',
                tradeType: 'BUY',
                page: 1,
                rows: 20,
                payTypes: [],
                countries: [],
                publisherType,
                classify,
                transAmount,
            })
        });

        if (!binanceRes.ok) {
            throw new Error(`Error al consultar Binance P2P: ${binanceRes.statusText}`);
        }

        const binanceData = await binanceRes.json();
        if (binanceData.data && Array.isArray(binanceData.data)) {
            binanceAds = binanceData.data;
            const validPrices = binanceAds.map(ad => parseFloat(ad.adv.price)).filter(p => !isNaN(p));
            if (validPrices.length > 0) {
                const total = validPrices.reduce((sum, p) => sum + p, 0);
                binanceAverage = total / validPrices.length;
            }
        } else {
            console.warn('[BINANCE P2P] No ads returned:', binanceData);
        }
    } catch (e: any) {
        console.error('[BINANCE P2P FETCH ERROR]:', e);
        binanceError = 'No se pudieron obtener las tasas de Binance. ' + e.message;
    }

    // 2. Fetch Profit Rate via Agent
    let profitRate = 0;
    let agentError: string | null = null;

    if (selectedBranch && selectedBranch.agent_url) {
        try {
            const agentClient = new AgentClient({
                slug: selectedBranch.id,
                agent_url: selectedBranch.agent_url,
                agent_api_key: selectedBranch.agent_token
            }, profile, fetch);

            const res = await agentClient.request<any>('/catalogos/tasa');
            const data = (res as any).data || (Array.isArray(res) ? res : []);
            if (data.length > 0) {
                profitRate = parseFloat(data[0].tasa) || 0;
            }
        } catch (e: any) {
            console.error('[AGENT RATE FETCH ERROR]:', e);
            agentError = 'No se pudo obtener la tasa de Profit de la sucursal seleccionada. ' + e.message;
        }
    } else {
        agentError = 'La sucursal seleccionada no tiene un agente configurado.';
    }

    return {
        binanceAverage,
        binanceAds: binanceAds.slice(0, 10), // Limit to 10 for displaying in table
        profitRate,
        branches: allowedBranches,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        transAmount,
        filterType,
        error: binanceError || agentError || null
    };
});
