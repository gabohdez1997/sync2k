// scripts/clean_branches.js
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
    
    console.log(`🧹 Cleaning tenant: ${tenantSlug}`);
    const tenantSnap = await db.collection('conexiones').where('slug', '==', tenantSlug).limit(1).get();
    
    if (tenantSnap.empty) {
        console.log('❌ Tenant not found');
        return;
    }

    const tenantDocId = tenantSnap.docs[0].id;
    console.log(`✅ Tenant Doc ID: ${tenantDocId}`);

    const branchesSnap = await db.collection('conexiones').doc(tenantDocId).collection('branches').get();
    console.log(`📂 Scanning ${branchesSnap.docs.length} branches...`);
    
    let deletedCount = 0;
    for (const doc of branchesSnap.docs) {
        const data = doc.data();
        if (data.co_sucur === undefined || data.co_sucur === null || data.co_sucur === "") {
            console.log(`🗑️ Deleting branch: ${doc.id} (Name: ${data.name}) - Reason: Empty/Undefined co_sucur`);
            await doc.ref.delete();
            deletedCount++;
        }
    }
    
    console.log(`✨ Cleanup finished. Deleted ${deletedCount} branches.`);
}

main().catch(err => {
    console.error('💥 Error:', err);
    process.exit(1);
});
