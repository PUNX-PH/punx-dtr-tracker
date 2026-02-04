import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, setDoc, addDoc, updateDoc, doc, Timestamp, orderBy, limit } from "firebase/firestore";

export const api = {
    login: async (pin) => {
        try {
            const q = query(collection(db, "users"), where("pin", "==", pin));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                return { success: true, user: { id: userDoc.id, ...userDoc.data() } };
            }
            return { success: false, message: 'Invalid PIN' };
        } catch (error) {
            console.error("Login error:", error);
            return { success: false, message: 'Connection failed' };
        }
    },

    logTime: async (userId, type) => {
        try {
            const newLog = {
                employeeId: userId,
                type: type, // 'IN' or 'OUT'
                timestamp: Timestamp.now()
            };

            const docRef = await addDoc(collection(db, "logs"), newLog);

            return {
                success: true,
                log: {
                    id: docRef.id,
                    ...newLog,
                    timestamp: newLog.timestamp.toDate().toISOString()
                }
            };
        } catch (error) {
            console.error("Log time error:", error);
            throw error;
        }
    },

    getHistory: async (userId) => {
        try {
            const q = query(
                collection(db, "logs"),
                where("employeeId", "==", userId),
                limit(100)
            );

            const querySnapshot = await getDocs(q);
            const logs = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp.toDate().toISOString()
            }));

            // Sort client-side to avoid needing a composite index in Firestore
            return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } catch (error) {
            console.error("Get history error:", error);
            return [];
        }
    },

    createLog: async (userId, type, dateObj, timeString, reason = '') => {
        try {
            // content of timeString is "HH:MM", we combine with dateObj
            const [hours, minutes] = timeString.split(':');
            const newDate = new Date(dateObj);
            newDate.setHours(parseInt(hours), parseInt(minutes));

            const newLog = {
                employeeId: userId,
                type: type,
                timestamp: Timestamp.fromDate(newDate),
                reason: reason
            };

            await addDoc(collection(db, "logs"), newLog);
            return { success: true };
        } catch (error) {
            console.error("Create log error", error);
            return { success: false, message: error.message };
        }
    },

    updateLog: async (logId, newDateObj, reason) => {
        try {
            const logRef = doc(db, "logs", logId);
            const updates = {
                timestamp: Timestamp.fromDate(newDateObj)
            };
            if (reason !== undefined) {
                updates.reason = reason;
            }
            await updateDoc(logRef, updates);
            return { success: true };
        } catch (error) {
            console.error("Update log error", error);
            return { success: false, message: error.message };
        }
    },

    getUserProfile: async (uid) => {
        try {
            // First try to find by uid field (if stored that way) or document ID
            // Assuming for now user documents might be stored by auto-ID or UID
            // Let's query by pin first? No, we have UID from auth. 
            // Let's assume document ID IS the UID if created strictly, but since we are migrating...
            // Let's try to get doc by UID first if we wrote it that way.
            // If not found, query for a field "uid"? 
            // Actually, user creation isn't fully strict yet.
            // But let's assume valid Firestore structure: collection("users").doc(uid) OR query where("uid" == uid)

            // Query for now to be safe if ID isn't UID
            const q = query(collection(db, "users"), where("uid", "==", uid));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }

            // Fallback: Check if document ID matches UID (standard Firebase practice)
            const docRef = doc(db, "users", uid);
            try {
                const { getDoc } = await import("firebase/firestore");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    return { id: docSnap.id, ...docSnap.data() };
                }
            } catch (e) {
                // Ignore fallback error
            }

            return null;
        } catch (error) {
            console.error("Get profile error", error);
            return null;
        }
    },

    getAllUsers: async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Get all users error", error);
            return [];
        }
    },

    ensureUserProfile: async (firebaseUser) => {
        try {
            const uid = firebaseUser.uid;

            // Check if user exists using our existing logic (ID or uid field)
            // For simplicity/standardization, let's enforce using UID as Document ID for new users
            const docRef = doc(db, "users", uid);
            let userSnap = await getDoc(docRef);

            if (userSnap.exists()) {
                return { id: userSnap.id, ...userSnap.data() };
            }

            // Double check query if we used to store random IDs (legacy check)
            const q = query(collection(db, "users"), where("uid", "==", uid));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }

            // If not found, create new 'employee' profile
            const newProfile = {
                uid: uid,
                name: firebaseUser.displayName,
                email: firebaseUser.email,
                photoURL: firebaseUser.photoURL,
                role: 'employee', // Default role
                createdAt: Timestamp.now()
            };

            await setDoc(docRef, newProfile);
            return { id: uid, ...newProfile };

        } catch (error) {
            console.error("Ensure profile error", error);
            // Fallback to basic info if DB write fails, but don't block login
            return {
                id: firebaseUser.uid,
                role: 'employee',
                name: firebaseUser.displayName,
                email: firebaseUser.email
            };
        }
    },

    // Cutoff Management
    setCutoff: async (startDate, endDate) => {
        try {
            const newCutoff = {
                startDate: Timestamp.fromDate(new Date(startDate)),
                endDate: Timestamp.fromDate(new Date(endDate)),
                createdAt: Timestamp.now()
            };
            const docRef = await addDoc(collection(db, "cutoffs"), newCutoff);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error("Set cutoff error", error);
            return { success: false, message: error.message };
        }
    },

    getActiveCutoff: async () => {
        try {
            // Get the most recently created cutoff
            const q = query(collection(db, "cutoffs"), orderBy("createdAt", "desc"), limit(1));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error("Get active cutoff error", error);
            return null;
        }
    },

    // DTR Submission
    submitDTR: async (userId, cutoffId, attachments) => {
        try {
            // Use composite ID to prevent duplicates per cutoff
            const submissionId = `${userId}_${cutoffId}`;
            const subRef = doc(db, "submissions", submissionId);

            const submission = {
                userId,
                cutoffId,
                attachments: attachments, // Array of Base64 strings
                status: 'pending',
                submittedAt: Timestamp.now()
            };

            await setDoc(subRef, submission);
            return { success: true };
        } catch (error) {
            console.error("Submit DTR error", error);
            return { success: false, message: error.message };
        }
    },

    getSubmission: async (userId, cutoffId) => {
        try {
            const submissionId = `${userId}_${cutoffId}`;
            const subRef = doc(db, "submissions", submissionId);
            const docSnap = await getDoc(subRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error("Get submission error", error);
            return null;
        }
    },

    getSubmissionsForCutoff: async (cutoffId) => {
        try {
            const q = query(collection(db, "submissions"), where("cutoffId", "==", cutoffId));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Get submissions error", error);
            return [];
        }
    }
};
