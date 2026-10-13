import { auth, db } from '../firebase';
import { collection, query, where, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, limit, onSnapshot, writeBatch, runTransaction } from "firebase/firestore";
import { DEFAULT_ALLOTMENT, LEAVE_TYPE_KEYS, LEAVE_TYPES, STATUS, summarize, validateRequest, formatAmount, formatRange, requestAmount } from './leave';

const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

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

            // Double check query if we used to store random IDs (legacy check).
            // Its own try/catch on purpose: a refused lookup must fall through to
            // the create below, not abort it. Before this, a denial landed in the
            // outer catch, which returns an unsaved stand-in profile — the person
            // worked normally (their own logs need no profile) but never got a
            // users doc, so no admin could ever see them.
            try {
                const q = query(collection(db, "users"), where("uid", "==", uid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            } catch (legacyError) {
                console.warn("Legacy profile lookup refused; creating a profile for", uid, legacyError.code || legacyError.message);
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

    /**
     * Offboard employees who have left. A SOFT removal: the profile is flagged,
     * never deleted, because their logs and submissions are payroll records
     * that must survive them — and because deleting the doc would not even
     * work, since their next Google sign-in would recreate it as a fresh
     * employee via ensureUserProfile.
     *
     * Anyone assigned to a removed senior is unassigned in the same batch, so
     * their next DTR routes to the super admin instead of a reviewer who will
     * never see it.
     *
     * Throws on failure (one batch, all or nothing).
     */
    removeUsers: async (userIds, removedById, allUsers) => {
        const ids = new Set(userIds);
        const batch = writeBatch(db);
        userIds.forEach(id => batch.update(doc(db, "users", id), {
            removed: true,
            removedAt: Timestamp.now(),
            removedBy: removedById,
        }));
        allUsers
            .filter(u => !ids.has(u.id) && u.assignedSeniorId && ids.has(u.assignedSeniorId))
            .forEach(u => batch.update(doc(db, "users", u.id), { assignedSeniorId: '' }));
        await batch.commit();
    },

    /** Undo removeUsers for one person. Senior assignments it cleared stay cleared. Throws. */
    restoreUser: async (userId) => {
        await updateDoc(doc(db, "users", userId), { removed: false, removedAt: null, removedBy: null });
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

    // Cutoffs could only ever be CREATED, which made submitBy unreachable for
    // every period already running — including the one live when the field
    // shipped. Without this the reminder falls back to a derived deadline for
    // months, which is the exact thing the field exists to stop: the first
    // fallback it produced landed on a Saturday.
    //
    // Deliberately narrow. The dates define a period people have already
    // logged time against and are not something to edit casually; the deadline
    // is a scheduling decision that legitimately changes for a holiday.
    updateCutoffDeadline: async (cutoffId, submitBy) => {
        try {
            await updateDoc(doc(db, "cutoffs", cutoffId), {
                submitBy: Timestamp.fromDate(new Date(submitBy)),
            });
            // Read back rather than trusting the write. This value is broadcast
            // to the whole team as fact, and a save that reports success it did
            // not earn is how a Saturday deadline reached 22 people.
            const after = await getDoc(doc(db, "cutoffs", cutoffId));
            if (!after.exists() || !after.data().submitBy) {
                return { success: false, message: "the write reported success but nothing was stored" };
            }
            return { success: true };
        } catch (error) {
            console.error("Update cutoff deadline error", error);
            // permission-denied is the likely one and the least obvious: this is
            // the FIRST thing in the app to update a cutoff — every other write
            // to that collection is an addDoc — so punx-dtr's rules may simply
            // have no update rule for `cutoffs`. The rules are not in this repo;
            // they live in the Firebase console.
            if (error.code === "permission-denied") {
                return {
                    success: false,
                    message: "permission denied by Firestore rules. `cutoffs` has only ever been "
                        + "CREATED by this app, so the rules likely allow create but not update. "
                        + "Add an update rule for cutoffs in the Firebase console (punx-dtr).",
                };
            }
            return { success: false, message: `${error.code || "error"}: ${error.message}` };
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

// ---- Leave & offset ----
//
// Three collections, all behind rules in firestore.rules:
//   leaveRequests/{id}      one request: type, startDate/endDate (YYYY-MM-DD
//                           strings, never Timestamps — see leave.js), days or
//                           hours, status pending|approved|rejected.
//   leaveBalances/{userId}  what HR has GRANTED per type. Absent = defaults.
//                           "Used" is derived from approved requests, not kept
//                           here — see summarize() in leave.js.
//   leaveAdjustments/{id}   append-only audit trail of every HR change.
//
// Approved requests are not copied into `logs`. The DTR overlays them at read
// time (DTRTable `leaves` prop), so revoking a leave takes it off the DTR with
// no cleanup, and payroll's own log records are never touched by this feature.

const round2 = (n) => Math.round(n * 100) / 100;

// These throw; the public wrappers below decide what a failure looks like.
// submit() and review() must NOT fall back to an empty list on a read error,
// or an outage would quietly turn off the overlap and balance checks.
async function fetchAllotted(userId) {
    const snap = await getDoc(doc(db, "leaveBalances", userId));
    const data = snap.exists() ? snap.data() : {};
    const out = { ...DEFAULT_ALLOTMENT };
    LEAVE_TYPE_KEYS.forEach(k => { if (Number.isFinite(Number(data[k]))) out[k] = Number(data[k]); });
    return out;
}

async function fetchUserRequests(userId) {
    // Single-field filter only: a composite index (userId + createdAt) would
    // have to be created by hand in the console before this screen worked.
    const snap = await getDocs(query(collection(db, "leaveRequests"), where("userId", "==", userId)));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

export const leaveApi = {
    /** Balances + requests + the derived summary for one person. Throws. */
    getOverview: async (userId) => {
        const [allotted, requests] = await Promise.all([fetchAllotted(userId), fetchUserRequests(userId)]);
        return { allotted, requests, summary: summarize(allotted, requests) };
    },

    /** Just the requests — what the DTR needs to overlay. [] on failure so the DTR still renders. */
    getUserRequests: async (userId) => {
        try {
            return await fetchUserRequests(userId);
        } catch (error) {
            console.error("Get leave requests error", error);
            return [];
        }
    },

    /**
     * Staff queue. `status` narrows it (the approval queue asks for 'pending');
     * without it, the most recent 500, newest first. Callers filter by employee
     * themselves — a senior only acts on their own assigned people, and the
     * rules enforce that on write.
     */
    getRequests: async (status = null) => {
        const col = collection(db, "leaveRequests");
        const q = status
            ? query(col, where("status", "==", status))
            : query(col, orderBy("createdAt", "desc"), limit(500));
        const snap = await getDocs(q);
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    },

    /** { [userId]: { sick, vacation, offset } } for everyone HR has set a balance for. */
    getAllAllotted: async () => {
        const snap = await getDocs(collection(db, "leaveBalances"));
        const map = {};
        snap.docs.forEach(d => {
            const out = { ...DEFAULT_ALLOTMENT };
            LEAVE_TYPE_KEYS.forEach(k => { if (Number.isFinite(Number(d.data()[k]))) out[k] = Number(d.data()[k]); });
            map[d.id] = out;
        });
        return map;
    },

    getAdjustments: async (userId) => {
        const snap = await getDocs(query(collection(db, "leaveAdjustments"), where("userId", "==", userId)));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    },

    /**
     * File a request. Validated against the live balance and the person's other
     * requests here, not just in the form: the form can be stale, and this is
     * the one place every request passes through.
     */
    submit: async (user, input) => {
        try {
            const [allotted, requests, userSnap] = await Promise.all([
                fetchAllotted(user.id),
                fetchUserRequests(user.id),
                getDoc(doc(db, "users", user.id)),
            ]);
            const v = validateRequest(input, summarize(allotted, requests), requests);
            if (v.error) return { success: false, message: v.error };

            const isOffset = input.type === 'offset';
            const request = {
                userId: user.id,
                userName: user.name || '',
                type: input.type,
                startDate: v.startDate,
                endDate: v.endDate,
                days: isOffset ? 0 : v.amount,
                hours: isOffset ? v.amount : 0,
                reason: (input.reason || '').trim().slice(0, 500),
                status: STATUS.PENDING,
                createdAt: Timestamp.now(),
            };
            const ref = await addDoc(collection(db, "leaveRequests"), request);

            // Only the assigned senior can be told: employees cannot list users,
            // so they cannot find the admins either (same limit as submitDTR).
            // Admins find it in the Leave tab's queue.
            const seniorId = userSnap.exists() ? userSnap.data().assignedSeniorId : null;
            if (seniorId) {
                await api.createNotification(
                    seniorId,
                    'LEAVE_APPROVAL',
                    'Leave Approval Required',
                    `${request.userName || 'An employee'} requested ${LEAVE_TYPES[request.type].label} for ${formatRange(request)} (${formatAmount(request.type, v.amount)}).`,
                    { requestId: ref.id, employeeId: user.id, employeeName: request.userName }
                );
            }
            return { success: true, id: ref.id };
        } catch (error) {
            console.error("Submit leave request error", error);
            return { success: false, message: error.message };
        }
    },

    /** Withdraw a request that has not been decided yet (the rules refuse anything else). */
    cancel: async (requestId) => {
        try {
            await deleteDoc(doc(db, "leaveRequests", requestId));
            return { success: true };
        } catch (error) {
            console.error("Cancel leave request error", error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Approve or reject. Approval re-checks the balance at the moment of
     * approving — a request that fitted when filed may not after HR deducted
     * something — so a decision can never push anyone below zero. Every approver
     * path (queue, notification toast) goes through here for that reason.
     */
    review: async (requestId, status, reviewer, note = '') => {
        try {
            const ref = doc(db, "leaveRequests", requestId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return { success: false, message: "That request no longer exists." };
            const req = { id: snap.id, ...snap.data() };

            if (req.userId === reviewer.id) return { success: false, message: "You can't decide your own request." };
            if (req.status === status) return { success: false, message: `It is already ${status}.` };

            if (status === STATUS.APPROVED) {
                const [allotted, requests] = await Promise.all([fetchAllotted(req.userId), fetchUserRequests(req.userId)]);
                const bucket = summarize(allotted, requests.filter(r => r.id !== requestId))[req.type];
                const amount = requestAmount(req);
                if (amount > bucket.remaining) {
                    return {
                        success: false,
                        message: `Can't approve: ${req.userName || 'this employee'} has ${formatAmount(req.type, Math.max(0, bucket.remaining))} of ${LEAVE_TYPES[req.type].label.toLowerCase()} left and this asks for ${formatAmount(req.type, amount)}. Adjust their balance first if that is intended.`,
                    };
                }
            }

            await updateDoc(ref, {
                status,
                reviewerId: reviewer.id,
                reviewerName: reviewer.name || '',
                reviewedAt: Timestamp.now(),
                reviewNote: (note || '').trim().slice(0, 500),
            });

            await api.createNotification(
                req.userId,
                status === STATUS.APPROVED ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
                status === STATUS.APPROVED ? 'Request Approved' : 'Request Rejected',
                `${reviewer.name || 'Your reviewer'} ${status} your ${LEAVE_TYPES[req.type].label} request for ${formatRange(req)}.${note ? ` Note: ${note.trim()}` : ''}`,
                { requestId, employeeId: req.userId }
            );
            return { success: true, request: { ...req, status } };
        } catch (error) {
            console.error("Review leave request error", error);
            // The rules decide who may decide whose request; say so plainly.
            if (error.code === 'permission-denied') {
                return { success: false, message: "You aren't allowed to decide this request. Only the employee's assigned senior or an admin can." };
            }
            return { success: false, message: error.message };
        }
    },

    /**
     * HR/admin: credit or deduct one balance. `delta` is signed, in the type's
     * own unit (days or hours). The balance write and its audit row commit
     * together or not at all, and the read-modify-write is a transaction so two
     * admins adjusting at once cannot lose one of the changes.
     */
    adjustBalance: async (userId, type, delta, reason, admin) => {
        try {
            if (!LEAVE_TYPES[type]) return { success: false, message: "Unknown balance type." };
            if (!Number.isFinite(delta) || delta === 0) return { success: false, message: "Enter an amount to credit or deduct." };
            if (!reason || !reason.trim()) return { success: false, message: "A reason is required — it is the audit trail." };

            let result;
            await runTransaction(db, async (tx) => {
                const balRef = doc(db, "leaveBalances", userId);
                const snap = await tx.get(balRef);
                const current = { ...DEFAULT_ALLOTMENT };
                if (snap.exists()) {
                    LEAVE_TYPE_KEYS.forEach(k => { if (Number.isFinite(Number(snap.data()[k]))) current[k] = Number(snap.data()[k]); });
                }
                const before = current[type];
                const after = round2(before + delta);
                if (after < 0) throw new Error(`That would take the balance below zero (it is ${before}).`);

                tx.set(balRef, { ...current, [type]: after, updatedAt: Timestamp.now(), updatedBy: admin.id });
                tx.set(doc(collection(db, "leaveAdjustments")), {
                    userId, type, delta: round2(delta), before, after,
                    reason: reason.trim().slice(0, 500),
                    byId: admin.id,
                    byName: admin.name || '',
                    createdAt: Timestamp.now(),
                });
                result = { before, after };
            });

            await api.createNotification(
                userId,
                'LEAVE_ADJUSTED',
                'Leave Balance Updated',
                `${admin.name || 'HR'} ${delta > 0 ? 'credited' : 'deducted'} ${formatAmount(type, Math.abs(delta))} ${delta > 0 ? 'to' : 'from'} your ${LEAVE_TYPES[type].label}. Reason: ${reason.trim()}`,
                { employeeId: userId }
            );
            return { success: true, ...result };
        } catch (error) {
            console.error("Adjust leave balance error", error);
            return { success: false, message: error.message };
        }
    },
};

// ---- DTR reminder (punx-messenger Worker) ----
//
// The reminder itself runs on a Cloudflare Worker, not here: it has to fire on
// a schedule when nobody has this app open, and it writes into a DIFFERENT
// Firebase project (punx-msg) that this client has no credentials for.
//
// Authenticated with the admin's own Firebase ID token rather than a shared
// key. A key that unlocks "DM the entire workspace" cannot ship inside a React
// bundle — that publishes it to everyone who opens the app. The Worker
// verifies the token against punx-dtr and re-reads the caller's role, so
// demoting someone takes effect at once.
const REMINDER_API = 'https://punx-messenger-gifs.rey-433.workers.dev'

async function reminderFetch(path, init = {}) {
    const user = auth.currentUser
    if (!user) return { success: false, message: 'Not signed in' }
    try {
        const res = await fetch(`${REMINDER_API}${path}`, {
            ...init,
            headers: {
                ...(init.headers || {}),
                Authorization: `Bearer ${await user.getIdToken()}`,
                'Content-Type': 'application/json',
            },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return { success: false, message: data.error || `HTTP ${res.status}` }
        return { success: true, data }
    } catch (error) {
        // A CORS rejection and an offline browser are indistinguishable from
        // here; say so rather than reporting a misleading cause.
        return { success: false, message: `Could not reach the reminder service: ${error.message}` }
    }
}

export const reminderApi = {
    /** Render the message and count recipients. Writes nothing. */
    preview: () => reminderFetch('/dtr/remind?dry=1&force=1', { method: 'POST' }),

    /**
     * Send for real. `onlyUid` restricts it to ONE punx-messenger user — the
     * way to see the actual DM without involving 22 colleagues. A test send
     * deliberately does not mark the cutoff as reminded, or testing it would
     * cancel the real send.
     */
    send: (onlyUid = null) => reminderFetch(
        `/dtr/remind?force=1${onlyUid ? `&only=${encodeURIComponent(onlyUid)}` : ''}`,
        { method: 'POST' },
    ),

    getAutoSend: () => reminderFetch('/dtr/auto-send', { method: 'GET' }),
    setAutoSend: (enabled) => reminderFetch('/dtr/auto-send', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
    }),
}
