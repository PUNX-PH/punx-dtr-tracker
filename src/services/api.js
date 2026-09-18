import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, setDoc, addDoc, updateDoc, doc, Timestamp, orderBy, limit, onSnapshot, writeBatch } from "firebase/firestore";

/**
 * The deadline a cutoff gets unless someone changes it: 10:00 AM the day after
 * the period closes. Matches what the reminder has always said — a period
 * ending Thu Sep 10 was due 10:00 AM Fri Sep 11.
 *
 * This is a DEFAULT, not a rule. It prefills the admin form so setting a
 * cutoff stays one click, and the moment a holiday or long weekend moves the
 * real deadline, someone edits the field instead of discovering the message
 * has been quoting a fiction.
 *
 * Takes and returns the `YYYY-MM-DDTHH:mm` that `<input type="datetime-local">`
 * uses, and builds the date in LOCAL time deliberately: `new Date('2026-09-10')`
 * parses as UTC and lands on the 9th for anyone behind it, which is exactly the
 * off-by-one this field exists to prevent.
 */
export function defaultSubmitBy(endDateStr) {
    if (!endDateStr) return '';
    const [y, m, d] = endDateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    const due = new Date(y, m - 1, d + 1, 10, 0, 0, 0); // rolls months/years itself
    const pad = (n) => String(n).padStart(2, '0');
    return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T10:00`;
}

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
        // Fast path: order by timestamp descending, capped at 1000. Requires a
        // composite index on (employeeId ASC, timestamp DESC).
        try {
            const q = query(
                collection(db, "logs"),
                where("employeeId", "==", userId),
                orderBy("timestamp", "desc"),
                limit(1000)
            );
            const snap = await getDocs(q);
            return snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp.toDate().toISOString()
            }));
        } catch (error) {
            // If the composite index doesn't exist yet, Firestore throws
            // failed-precondition. Fall back to fetching all of this user's
            // logs (single-field index on employeeId is auto-provisioned) and
            // sorting client-side. Previously this catch returned [] which made
            // the table render fully blank after a save.
            const isIndexError = error.code === 'failed-precondition' ||
                /index/i.test(error.message || '');
            if (!isIndexError) {
                console.error("Get history error:", error);
                return [];
            }
            try {
                console.warn("Composite index missing on logs(employeeId, timestamp). Falling back to client-side sort. Create the index in Firebase console to remove this fallback.");
                const fallbackQ = query(
                    collection(db, "logs"),
                    where("employeeId", "==", userId)
                );
                const snap = await getDocs(fallbackQ);
                const logs = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp.toDate().toISOString()
                }));
                return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            } catch (fallbackErr) {
                console.error("Get history fallback error:", fallbackErr);
                return [];
            }
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

    // Atomic DTR save. All updates/creates/deletes commit together — if any fail,
    // the whole thing rolls back and the error is thrown to the caller. This
    // replaces the prior fire-and-pray Promise.all of individual writes, which
    // could silently leave a day half-written (fragmented).
    //
    // updates: [{ logId, newTimestamp?: Date, newReason?: string }]
    // creates: [{ type, dateObj: Date, timeStr: "HH:MM", reason?: string, session?: number }]
    // deletes: iterable of logId strings
    saveDTRBatch: async (userId, { updates = [], creates = [], deletes = [] }) => {
        const batch = writeBatch(db);

        for (const u of updates) {
            const logRef = doc(db, "logs", u.logId);
            const fields = {};
            if (u.newTimestamp) fields.timestamp = Timestamp.fromDate(u.newTimestamp);
            if (u.newReason !== undefined) fields.reason = u.newReason;
            if (Object.keys(fields).length > 0) batch.update(logRef, fields);
        }

        for (const id of deletes) {
            batch.delete(doc(db, "logs", id));
        }

        for (const c of creates) {
            const [hours, minutes] = c.timeStr.split(':');
            const newDate = new Date(c.dateObj);
            newDate.setHours(parseInt(hours), parseInt(minutes));
            const newRef = doc(collection(db, "logs"));
            const newLog = {
                employeeId: userId,
                type: c.type,
                timestamp: Timestamp.fromDate(newDate),
                reason: c.reason || ''
            };
            // session distinguishes multiple OT_IN/OT_OUT pairs on the same day
            // (split overtime). Omitted for IN/OUT/NOTE, which only ever have one.
            if (c.session !== undefined) newLog.session = c.session;
            batch.set(newRef, newLog);
        }

        await batch.commit();
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
        // Same shape as getHistory's index-fallback pattern. Original used
        // limit(50) with no orderBy, which returned the OLDEST 50 by doc ID —
        // new notifications never appeared once a user accumulated >50 lifetime.
        // Try ordered query first (needs composite index recipientId+createdAt);
        // fall back to single-field query + client-side sort on failed-precondition.
        let activeUnsub = null;

        const subscribeWithOrder = () => onSnapshot(
            query(
                collection(db, "notifications"),
                where("recipientId", "==", userId),
                orderBy("createdAt", "desc"),
                limit(100)
            ),
            (snapshot) => {
                callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            },
            (error) => {
                const isIndexError = error.code === 'failed-precondition' ||
                    /index/i.test(error.message || '');
                if (isIndexError) {
                    console.warn("Composite index missing on notifications(recipientId, createdAt). Falling back to client-side sort.");
                    if (activeUnsub) activeUnsub();
                    activeUnsub = subscribeWithoutOrder();
                } else {
                    console.error("Firebase getNotifications error:", error);
                }
            }
        );

        const subscribeWithoutOrder = () => onSnapshot(
            query(
                collection(db, "notifications"),
                where("recipientId", "==", userId)
            ),
            (snapshot) => {
                const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                notifs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                callback(notifs);
            },
            (error) => {
                console.error("Firebase getNotifications fallback error:", error);
            }
        );

        activeUnsub = subscribeWithOrder();
        return () => { if (activeUnsub) activeUnsub(); };
    },

    markNotificationRead: async (id) => {
        try {
            const notifRef = doc(db, "notifications", id);
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error("Mark read error", error);
        }
    },

    markNotificationsRead: async (ids) => {
        if (!ids || ids.length === 0) return { success: true };
        try {
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db, "notifications", id), { read: true }));
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error("Mark notifications read batch error", error);
            return { success: false, message: error.message };
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

    updateDTRStatus: async (submissionId, status, employeeId, seniorName) => {
        try {
            const subRef = doc(db, "submissions", submissionId);
            await updateDoc(subRef, { status: status }); // 'approved' or 'rejected'
            
            // If rejected, notify the original user
            if (status === 'rejected' && employeeId) {
                await api.createNotification(
                    employeeId,
                    'DTR_REJECTED',
                    'DTR Rejected',
                    `Your assigned senior (${seniorName}) has rejected your DTR. Please revise and resubmit.`,
                    { submissionId }
                );
            }
            return { success: true };
        } catch (error) {
            console.error("Update DTR status error", error);
            return { success: false, message: error.message };
        }
    },

    // Cutoff Management
    // submitBy is the deadline quoted to everyone in the reminder — "no later
    // than 10:00 AM on Friday, September 11". It is STORED rather than derived
    // from endDate because a derived deadline is right until the first holiday
    // or long weekend moves it, and that failure is silent and goes to the
    // whole team at once: everyone reads an authoritative-looking time, submits
    // against it, and misses the real one. Getting the send DAY wrong costs a
    // reminder arriving early; getting this wrong costs payroll.
    //
    // Optional so existing callers and the cutoffs already in Firestore keep
    // working — anything reading it must handle absence, see defaultSubmitBy.
    setCutoff: async (startDate, endDate, submitBy = null) => {
        try {
            const newCutoff = {
                startDate: Timestamp.fromDate(new Date(startDate)),
                endDate: Timestamp.fromDate(new Date(endDate)),
                submitBy: submitBy ? Timestamp.fromDate(new Date(submitBy)) : null,
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
        submitDTR: async (userId, cutoffId, attachments, attachmentComments = [], links = []) => {
        try {
            // Use composite ID to prevent duplicates per cutoff
            const submissionId = `${userId}_${cutoffId}`;
            const subRef = doc(db, "submissions", submissionId);

            // Fetch user to get assigned senior before creating submission
            let assignedSeniorId = null;
            let employeeName = "Unknown";
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                assignedSeniorId = userData.assignedSeniorId;
                employeeName = userData.name;
            }

            const initialStatus = assignedSeniorId ? 'pending_senior' : 'pending';

            // Combine with existing attachments if present (so we don't lose previous files on resubmission)
            let finalAttachments = attachments;
            let finalComments = attachmentComments;
            let finalLinks = links;

            const existingSub = await getDoc(subRef);
            if (existingSub.exists()) {
                const prevData = existingSub.data();
                if (prevData.attachments && prevData.attachments.length > 0) {
                    finalAttachments = [...prevData.attachments, ...attachments];
                    finalComments = [...(prevData.attachmentComments || []), ...attachmentComments];
                }
                if (prevData.links && prevData.links.length > 0) {
                    finalLinks = [...(prevData.links || []), ...links];
                }
            }

            const submission = {
                userId,
                cutoffId,
                attachments: finalAttachments,
                attachmentComments: finalComments,
                links: finalLinks,
                status: initialStatus,
                submittedAt: Timestamp.now()
            };

            await setDoc(subRef, submission);

            // If user has a senior, trigger DTR approval notification to them
            if (assignedSeniorId) {
                await api.createNotification(
                    assignedSeniorId,
                    'DTR_APPROVAL',
                    'DTR Approval Required',
                    `${employeeName} has submitted their DTR for approval.`,
                    { submissionId, employeeId: userId, employeeName }
                );
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

    deleteSubmission: async (submissionId) => {
        try {
            const { deleteDoc } = await import("firebase/firestore");
            const subRef = doc(db, "submissions", submissionId);
            await deleteDoc(subRef);
            return { success: true };
        } catch (error) {
            console.error("Delete submission error", error);
            return { success: false, message: error.message };
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
    },

    logEditActivity: async (userId, summary, details = []) => {
        try {
            const editLog = {
                employeeId: userId,
                type: 'EDIT',
                timestamp: Timestamp.now(),
                reason: summary,
                editDetails: details
            };
            const docRef = await addDoc(collection(db, "logs"), editLog);
            return {
                success: true,
                log: {
                    id: docRef.id,
                    ...editLog,
                    timestamp: editLog.timestamp.toDate().toISOString()
                }
            };
        } catch (error) {
            console.error("Log edit activity error:", error);
            return { success: false, message: error.message };
        }
    }
};
