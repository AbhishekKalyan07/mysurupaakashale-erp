import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, deleteField } from 'firebase/firestore';
import { db, getMessagingIfSupported } from '@/shared/lib/firebase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { toast } from 'react-hot-toast';

export function usePushNotifications() {
  const { firebaseUser } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;

    async function setupForegroundListener() {
      if (!firebaseUser) return;
      const messaging = await getMessagingIfSupported();
      if (messaging) {
        unsubscribe = onMessage(messaging, (payload) => {
          if (payload.notification) {
            toast(payload.notification.title || 'New notification', {
              icon: '🔔',
            });
          } else if (payload.data && payload.data.title) {
            toast(payload.data.title, { icon: '🔔' });
          }
        });
      }
    }

    setupForegroundListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [firebaseUser]);

  const requestPermission = async () => {
    if (!firebaseUser) {
      toast.error('You must be logged in to enable push notifications');
      return;
    }

    if (!('Notification' in window)) {
      toast.error('This browser does not support desktop notification');
      return;
    }

    try {
      setIsRequesting(true);
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        const messaging = await getMessagingIfSupported();
        if (!messaging) {
          toast.error('Push notifications are not supported in this environment');
          return;
        }
        
        // Use the VAPID key from environment variables
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.error('VITE_FIREBASE_VAPID_KEY is missing');
          toast.error('Push notifications are not fully configured yet');
          return;
        }

        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : undefined;
        const currentToken = await getToken(messaging, { 
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        
        if (currentToken) {
          // Save the token to the user's document using arrayUnion for multi-device support
          // Also remove the legacy fcmToken string if it exists
          const userRef = doc(db, 'users', firebaseUser.uid);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(currentToken),
            fcmToken: deleteField(),
          });
          
          try { localStorage.setItem('current_fcm_token', currentToken); } catch {}
          
          toast.success('Push notifications enabled!');
        } else {
          toast.error('Failed to generate push notification token');
        }
      } else {
        toast.error('Notification permission was denied');
      }
    } catch (error) {
      console.error('An error occurred while retrieving token. ', error);
      toast.error('Failed to enable push notifications');
    } finally {
      setIsRequesting(false);
    }
  };

  const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const permissionStatus = isSupported ? Notification.permission : 'denied';

  return {
    requestPermission,
    isRequesting,
    isSupported,
    permissionStatus
  };
}
