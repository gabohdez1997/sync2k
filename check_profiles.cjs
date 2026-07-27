// Script to check profiles table in Supabase
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

(async () => {
    try {
        const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data, error } = await supabase.from('profiles').select('*').limit(1);
        if (error) throw error;
        console.log('Perfiles (columnas):', Object.keys(data[0] || {}));
        console.log('Muestra:', data);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
