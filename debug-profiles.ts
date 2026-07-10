import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  console.log("Fetching profiles from Firestore...");
  getDocs(collection(db, 'profiles')).then(snapshot => {
    console.log(`Found ${snapshot.size} profiles:`);
    snapshot.forEach(doc => {
      console.log(`ID: ${doc.id} =>`, doc.data());
    });
    process.exit(0);
  }).catch(err => {
    console.error("Error reading profiles:", err);
    process.exit(1);
  });
} catch (e) {
  console.error("Initialization error:", e);
  process.exit(1);
}
