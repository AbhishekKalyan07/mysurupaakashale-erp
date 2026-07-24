import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '@/shared/lib/firebase';

/**
 * Uploads a payment screenshot to Firebase Storage.
 * Path: payment-screenshots/{uid}/{uuid}.{ext}
 * Returns the public download URL.
 */
export async function uploadPaymentScreenshot(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to upload a payment screenshot.');

  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `payment-screenshots/${user.uid}/${filename}`;

  const storage = getStorage();
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: user.uid },
  });

  return getDownloadURL(storageRef);
}
