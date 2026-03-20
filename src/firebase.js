import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDaGZ3HJKOe4q7Eh6dT8yoL577GQ8nx1Ao",
    authDomain: "punx-dtr.firebaseapp.com",
    projectId: "punx-dtr",
    storageBucket: "punx-dtr.firebasestorage.app",
    messagingSenderId: "1090058586450",
    appId: "1:1090058586450:web:262cbfb2ac8790f2aad28b",
    measurementId: "G-HV0ENWGEDV"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
