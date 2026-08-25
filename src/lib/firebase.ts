import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'ar';

// Set local persistence for better mobile & PWA compatibility
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Firebase persistence warning:', err);
});

export const googleAuthProvider = new GoogleAuthProvider();
// Allow smooth account selection
googleAuthProvider.setCustomParameters({
  prompt: 'select_account'
});
export const db = getFirestore(app);

export async function getAuthToken(): Promise<string | null> {
  try {
    if (auth.currentUser) {
      const t = await auth.currentUser.getIdToken();
      if (t) return t;
    }
    const savedDirect = localStorage.getItem('direct_user_session');
    if (savedDirect) {
      const parsed = JSON.parse(savedDirect);
      if (parsed?.token) return parsed.token;
    }
  } catch (e) {
    console.warn('Error retrieving token:', e);
  }
  return null;
}
