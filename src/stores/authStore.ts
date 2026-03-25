import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ADMIN_EMAILS } from '@/constants/config';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  initialize: () => () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAdmin: false,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      set({
        user,
        isLoading: false,
        isAdmin: user?.email ? ADMIN_EMAILS.includes(user.email) : false,
      });
    });
    return unsubscribe;
  },

  login: async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('로그인 실패:', error);
    }
  },

  logout: async () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      await signOut(auth);
    }
  },
}));
