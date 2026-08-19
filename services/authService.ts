
import { UserProfile } from '../types';
import { apiPost, clearToken, getToken } from './apiConfig';

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

/**
 * ออกจากระบบให้ครบทั้งสองฝั่ง
 *
 * ของเดิมลบแค่ 'penalty_pro_user' (โปรไฟล์ที่เอาไว้โชว์ชื่อ) แล้ว reload
 * ส่วน token ที่ใช้ยืนยันตัวกับ API ยังค้างใน localStorage และยังไม่หมดอายุ
 * บนเซิร์ฟเวอร์ ⇒ หน้าจอบอกว่า "ออกจากระบบแล้ว" แต่ทุกคำขอยังส่ง
 * Authorization กลับไปในฐานะเจ้าภาพ/แอดมินเหมือนเดิม
 * อาการที่เห็นคือหน้าเกียรติบัตรยังโชว์ปุ่ม "ออกแบบใบ"/"ตั้งค่า"
 * เพราะ api ตอบ canManage = true อยู่
 *
 * เพิกถอน token ที่เซิร์ฟเวอร์ก่อน (กันคนที่ก๊อป token ไปแล้วใช้ต่อ)
 * แล้วค่อยล้างของในเครื่อง — เน็ตล่มก็ยังต้องล้างฝั่งเครื่องให้ได้
 */
export const logout = async () => {
  if (getToken()) {
    // background: true — token ที่หมดอายุไปแล้วจะได้ 401 ซึ่งไม่ใช่เรื่องต้องเด้ง
    // "เซสชันหมดอายุ" ให้คนที่กำลังจะออกจากระบบอยู่แล้วเห็น
    try { await apiPost('logout', {}, { background: true }); } catch { /* ล้างฝั่งเครื่องต่อไป */ }
  }
  if (window.liff && window.liff.isLoggedIn()) {
    window.liff.logout();
  }
  clearToken();
  localStorage.removeItem('penalty_pro_user');
  window.location.reload();
};
