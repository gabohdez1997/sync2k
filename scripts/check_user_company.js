// scripts/check_user_company.js
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
    const userEmail = 'admin@sync2k.com';
    
    console.log(`🔍 Checking user: ${userEmail}`);
    const userSnap = await db.collection('usuarios').where('email', '==', userEmail).limit(1).get();
    
    if (userSnap.empty) {
        console.log('❌ User not found');
        return;
    }

    const userData = userSnap.docs[0].data();
    console.log(`✅ User found. Company Data:`, JSON.stringify(userData.company, null, 2));

    if (userData.company && userData.company.id) {
        const branchesSnap = await db.collection('conexiones').doc(userData.company.id).collection('branches').get();
        console.log(`📂 Branches in company doc ${userData.company.id}: ${branchesSnap.docs.length}`);
        branchesSnap.docs.forEach(doc => {
            console.log(`- ${doc.id}: ${doc.data().name} (${doc.data().co_sucur || 'SIN CÓDIGO'})`);
        });
    }
}

main().catch(console.error);
