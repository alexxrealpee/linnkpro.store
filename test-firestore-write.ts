import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

async function run() {
  try {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const email = `test_${Date.now()}@example.com`;
    const password = "password123";
    
    console.log(`Creating test user with email ${email}...`);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    console.log(`User created. UID: ${uid}`);

    // Try writing to profiles
    console.log(`Attempting to write to profiles collection...`);
    await setDoc(doc(db, 'profiles', uid), {
      uid,
      email,
      username: "testuser_" + uid.substring(0, 5).toLowerCase(),
      displayName: "Test User",
      bio: "This is a test profile",
      role: 'user',
      plan: 'free',
      currency: '$',
      createdAt: new Date().toISOString()
    });
    console.log(`Successfully wrote profile to Firestore!`);

    // Try writing to products
    console.log(`Attempting to write to products collection...`);
    const testProductId = "test_prod_" + Date.now();
    await setDoc(doc(db, 'products', testProductId), {
      id: testProductId,
      userId: uid,
      name: "Test Product",
      price: 15.99,
      active: true,
      createdAt: new Date().toISOString()
    });
    console.log(`Successfully wrote product to Firestore!`);

    // Try writing to links
    console.log(`Attempting to write to links collection...`);
    const testLinkId = "test_link_" + Date.now();
    await setDoc(doc(db, 'links', testLinkId), {
      id: testLinkId,
      userId: uid,
      title: "Test Link",
      url: "https://example.com",
      order: 0,
      active: true
    });
    console.log(`Successfully wrote link to Firestore!`);

    process.exit(0);
  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  }
}

run();
