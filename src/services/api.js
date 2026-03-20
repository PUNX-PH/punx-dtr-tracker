import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, setDoc, addDoc, updateDoc, doc, Timestamp, orderBy, limit, onSnapshot, writeBatch } from "firebase/firestore";

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

    deleteLog: async (logId) => {
        try {
            const { deleteDoc } = await import("firebase/firestore");
            const logRef = doc(db, "logs", logId);
            await deleteDoc(logRef);
            return { success: true };
        } catch (error) {
            console.error("Delete log error", error);
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
                const docSnap = querySnapshot.docs[0];
                return { id: docSnap.id, ...docSnap.data() };
            }

            // Final fallback: Check by email (in case user was manually added to DB as admin without a UID)
            const emailQuery = query(collection(db, "users"), where("email", "==", firebaseUser.email));
            const emailSnapshot = await getDocs(emailQuery);
            if (!emailSnapshot.empty) {
                const emailDoc = emailSnapshot.docs[0];
                // Update this existing document with their UID for future logins
                await updateDoc(doc(db, "users", emailDoc.id), { uid: uid });
                return { id: emailDoc.id, ...emailDoc.data(), uid: uid };
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

    updateUserRole: async (userId, newRole) => {
        try {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, { role: newRole });
            return { success: true };
        } catch (error) {
            console.error("Update role error", error);
            return { success: false, message: error.message };
        }
    },

    updateUserSeniorStatus: async (userId, isSenior) => {
        try {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, { isSenior: isSenior });
            return { success: true };
        } catch (error) {
            console.error("Update senior status error", error);
            return { success: false, message: error.message };
        }
    },

    assignSenior: async (employeeId, seniorId) => {
        try {
            const userRef = doc(db, "users", employeeId);
            await updateDoc(userRef, { assignedSeniorId: seniorId });
            return { success: true };
        } catch (error) {
            console.error("Assign senior error", error);
            return { success: false, message: error.message };
        }
    },

    getSeniors: async () => {
        try {
            const q = query(collection(db, "users"), where("isSenior", "==", true));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Get seniors error", error);
            return [];
        }
    },

    // Notifications
    createNotification: async (recipientId, type, title, message, data = {}) => {
        try {
            await addDoc(collection(db, "notifications"), {
                recipientId,
                type,
                title,
                message,
                data,
                read: false,
                createdAt: Timestamp.now()
            });
            return { success: true };
        } catch (error) {
            console.error("Create notification error", error);
            return { success: false };
        }
    },

    getNotifications: (userId, callback) => {
        const q = query(
            collection(db, "notifications"),
            where("recipientId", "==", userId),
            orderBy("createdAt", "desc"),
            limit(20)
        );
        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(notifications);
        });
    },

    markNotificationRead: async (id) => {
        try {
            const notifRef = doc(db, "notifications", id);
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error("Mark read error", error);
        }
    },

    updateOTStatus: async (submissionId, status) => { // status: 'approved' | 'declined'
        try {
            const subRef = doc(db, "submissions", submissionId);
            await updateDoc(subRef, { otStatus: status });
            return { success: true };
        } catch (error) {
            console.error("Update OT status error", error);
            return { success: false, message: error.message };
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

    getAllCutoffs: async () => {
        try {
            const q = query(collection(db, "cutoffs"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Get all cutoffs error", error);
            return [];
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

            // Check for overtime to notify senior
            if (submission.hasOvertime) {
                // Fetch user to get assigned senior
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.assignedSeniorId) {
                        // Create notification for senior
                        await api.createNotification(
                            userData.assignedSeniorId,
                            'OT_APPROVAL',
                            'Overtime Approval Needed',
                            `${userData.name} has submitted DTR with overtime.`,
                            { submissionId, employeeId: userId, employeeName: userData.name }
                        );
                    }
                }
            }

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
