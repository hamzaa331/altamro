// src/lib/firebase-admin.ts
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
}

// On parse la string JSON qui est dans ton .env
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// On initialise Firebase Admin une seule fois
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

// Exporte l'auth admin
export const adminAuth = getAuth();

// Exporte Firestore admin
export const adminDb = getFirestore();
