import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  async function check() {
    const collections = ['users', 'profiles', 'products', 'links', 'themes', 'orders', 'leads'];
    for (const coll of collections) {
      try {
        const snapshot = await getDocs(collection(db, coll));
        console.log(`Collection '${coll}': found ${snapshot.size} documents.`);
        snapshot.forEach(doc => {
          console.log(`  Document ID: ${doc.id} =>`, doc.data());
        });
      } catch (err) {
        console.error(`Error reading ${coll}:`, err);
      }
    }
    process.exit(0);
  }
  
  check();
} catch (e) {
  console.error("Initialization error:", e);
  process.exit(1);
}
