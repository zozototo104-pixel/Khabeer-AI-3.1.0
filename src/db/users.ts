import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export interface UserProfileUpdate {
  nickname?: string;
  displayName?: string;
  roleTitle?: string;
  preferences?: {
    preferredVoice?: string;
    tone?: string;
    directAddress?: string;
    honorific?: string;
    [key: string]: any;
  };
}

export async function getUserByUid(uid: string) {
  const result = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getOrCreateUser(uid: string, email: string, initialProfile?: Partial<UserProfileUpdate>) {
  const existing = await getUserByUid(uid);
  if (existing) {
    if (initialProfile && (initialProfile.nickname || initialProfile.displayName || initialProfile.preferences)) {
      const updated = await updateUserProfile(uid, initialProfile);
      return updated || existing;
    }
    return existing;
  }

  const result = await db.insert(users)
    .values({
      uid,
      email,
      nickname: initialProfile?.nickname || 'رئيس الجلسة',
      displayName: initialProfile?.displayName || 'المستخدم',
      roleTitle: initialProfile?.roleTitle || 'رئيس الجلسة',
      preferences: initialProfile?.preferences || {
        preferredVoice: 'Zephyr',
        tone: 'warm_professional',
        directAddress: 'حضرتك',
        honorific: 'حضرتك'
      }
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { 
        email,
        updatedAt: new Date()
      },
    })
    .returning();

  return result[0];
}

export async function updateUserProfile(uid: string, profile: UserProfileUpdate) {
  const updateData: any = {
    updatedAt: new Date()
  };
  if (profile.nickname !== undefined) updateData.nickname = profile.nickname.trim();
  if (profile.displayName !== undefined) updateData.displayName = profile.displayName.trim();
  if (profile.roleTitle !== undefined) updateData.roleTitle = profile.roleTitle.trim();
  if (profile.preferences !== undefined) updateData.preferences = profile.preferences;

  const result = await db.update(users)
    .set(updateData)
    .where(eq(users.uid, uid))
    .returning();

  return result.length > 0 ? result[0] : null;
}
