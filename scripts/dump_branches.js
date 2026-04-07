// scripts/dump_branches.js
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

async function main() {
    const localKeyPath = path.resolve('firebase');
    const files = fs.readdirSync(localKeyPath);
    const jsonFile = files.find(f => f.endsWith('.json'));
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(localKeyPath, jsonFile), 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    const db = admin.firestore();
    const tenantSlug = 'galpe2021';
    
    console.log(`🔍 Checking tenant: ${tenantSlug}`);
    const tenantSnap = await db.collection('conexiones').where('slug', '==', tenantSlug).limit(1).get();
    
    if (tenantSnap.empty) {
        console.log('❌ Tenant not found');
        return;
    }

    const tenantDocId = tenantSnap.docs[0].id;
    console.log(`✅ Tenant Doc ID: ${tenantDocId}`);

    const branchesSnap = await db.collection('conexiones').doc(tenantDocId).collection('branches').get();
    console.log(`📂 Found ${branchesSnap.docs.length} branches`);
    
    branchesSnap.docs.forEach(doc => {
        const data = doc.data();
        console.log(`--- Branch ID: ${doc.id} ---`);
        console.log(`Name: ${data.name}`);
        console.log(`co_sucur: ${data.co_sucur}`);
        console.log(`is_default: ${data.is_default}`);
        console.log(`Agent ID (if any): ${data.agent_id}`);
    });
}

main().catch(err => {
    console.error('💥 Error:', err);
    process.exit(1);
});
