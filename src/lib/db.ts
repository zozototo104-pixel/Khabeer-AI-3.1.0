import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: any;
}

export interface Meeting {
  id: string;
  orgId: string;
  title: string;
  type: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
  createdBy: string;
  createdAt: any;
  summary?: string;
}

export interface Task {
  id: string;
  orgId: string;
  meetingId: string;
  title: string;
  assignee: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: any;
}

export interface Decision {
  id: string;
  orgId: string;
  meetingId: string;
  title: string;
  description: string;
  impact?: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  createdAt: any;
}

// Database Helpers
export const createOrganization = async (name: string, userId: string) => {
  const orgRef = await addDoc(collection(db, 'organizations'), {
    name,
    ownerId: userId,
    createdAt: serverTimestamp()
  });
  return orgRef.id;
};

export const getOrganizations = async (userId: string) => {
  const q = query(collection(db, 'organizations'), where('ownerId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
};

export const createMeeting = async (orgId: string, title: string, type: string, userId: string) => {
  const meetingRef = await addDoc(collection(db, 'meetings'), {
    orgId,
    title,
    type,
    status: 'ACTIVE',
    createdBy: userId,
    createdAt: serverTimestamp()
  });
  return meetingRef.id;
};

export const endMeeting = async (meetingId: string, summary: string) => {
  await updateDoc(doc(db, 'meetings', meetingId), {
    status: 'COMPLETED',
    summary,
    endedAt: serverTimestamp()
  });
};

export const addDecision = async (orgId: string, meetingId: string, title: string, description: string) => {
  await addDoc(collection(db, 'decisions'), {
    orgId,
    meetingId,
    title,
    description,
    status: 'APPROVED',
    createdAt: serverTimestamp()
  });
};

export const addTask = async (orgId: string, meetingId: string, title: string, assignee: string) => {
  await addDoc(collection(db, 'tasks'), {
    orgId,
    meetingId,
    title,
    assignee,
    status: 'PENDING',
    createdAt: serverTimestamp()
  });
};
