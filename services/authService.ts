
import { UserProfile } from '../types';

export const checkSession = async (): Promise<UserProfile | null> => {
  // 1. Check LINE Login
  try {
    if (window.liff && window.liff.isLoggedIn()) {
      const profile = await window.liff.getProfile();
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        statusMessage: profile.statusMessage,
        type: 'line'
      };
    }
  } catch (e) {
    console.warn("LIFF Profile Error", e);
  }

  // 2. Check Guest/Standard Session (LocalStorage)
  const storedUser = localStorage.getItem('penalty_pro_user');
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch (e) {
      localStorage.removeItem('penalty_pro_user');
    }
  }

  return null;
};

export const loginWithLine = () => {
  if (window.liff) {
    if (!window.liff.isLoggedIn()) {
      window.liff.login();
    }
  } else {
    console.error("LIFF not initialized");
  }
};

export const loginAsGuest = (name: string, phone: string): UserProfile => {
  const user: UserProfile = {
    userId: `guest_${Date.now()}`,
    displayName: name,
    phoneNumber: phone,
    type: 'guest'
  };
  localStorage.setItem('penalty_pro_user', JSON.stringify(user));
  return user;
};

export const logout = () => {
  if (window.liff && window.liff.isLoggedIn()) {
    window.liff.logout();
  }
  localStorage.removeItem('penalty_pro_user');
  window.location.reload();
};
