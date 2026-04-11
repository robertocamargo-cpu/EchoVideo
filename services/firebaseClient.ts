import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyDT2jresvDKecs1kNvuPF5RBqsW_mQa3w4",
    authDomain: "manifest-altar-323123.firebaseapp.com",
    projectId: "manifest-altar-323123",
    storageBucket: "manifest-altar-323123.firebasestorage.app",
    messagingSenderId: "533759879075",
    appId: "1:533759879075:web:e6ee7f7d88f7e3c4a89c16"
};
console.log("FIREBASE CONFIG INJECTED:", firebaseConfig);

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, 'echovid');
export const storage = getStorage(app);
storage.maxUploadRetryTime = 5000; // Force fail fast on CORS/network errors
