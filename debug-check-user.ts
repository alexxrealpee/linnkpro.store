import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  async function check() {
    const userId = "gb4Plz9nB9RJdlEJGf0yULrsZEx2";
    console.log(`Checking database documents for userId '${userId}':`);
    
    const collections = ['users', 'profiles', 'themes'];
    for (const coll of collections) {
      try {
        const d = await getDoc(doc(db, coll, userId));
        if (d.exists()) {
          console.log(`  Document found in '${coll}':`, d.data());
        } else {
          console.log(`  No document found in '${coll}'`);
        }
      } catch (err) {
        console.error(`  Error reading ${coll}/${userId}:`, err);
      }
    }
    process.exit(0);
  }
  
  check();
} catch (e) {
  console.error("Initialization error:", e);
  process.exit(1);
}
