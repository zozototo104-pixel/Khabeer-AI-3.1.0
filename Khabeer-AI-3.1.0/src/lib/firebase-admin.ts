import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// @ts-ignore
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  const serializedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  
  if (serializedServiceAccount) {
    try {
      const serviceAccount = JSON.parse(serializedServiceAccount);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      });
    } catch {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is invalid, falling back to projectId only.');
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId });
    }
  } else {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId });
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
