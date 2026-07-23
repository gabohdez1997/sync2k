import { supabaseAdmin } from './lib/server/supabase';

async function run() {
    const { data: tr, error } = await supabaseAdmin
        .from('stock_transfers')
        .select(`
            *,
            items:stock_transfer_items(*)
        `)
        .eq('transfer_number', 'TR-20260723-6012')
        .single();

    console.log('Resultado TR-20260723-6012:', tr, error);
    process.exit(0);
}

run();
