/**
 * ย่อรูปและแปลงเป็น WebP ตั้งแต่ในเบราว์เซอร์ ก่อนส่งขึ้นเซิร์ฟเวอร์
 *
 * ทำไมต้องทำฝั่ง client ทั้งที่ server แปลงให้อยู่แล้ว:
 *   - รูปจากมือถือใบหนึ่ง 3-5 MB ครูที่สนามใช้เน็ตมือถือ ส่งขึ้นไปเต็มใบแล้วรอนาน
 *     จนคิดว่าค้างแล้วกดซ้ำ ย่อก่อนเหลือ ~300 KB คือต่างกันสิบเท่า
 *   - โฮสต์เป็น shared hosting ยิ่งส่งไฟล์ใหญ่ยิ่งกินหน่วยความจำตอน decode
 *
 * ⚠️ ตัวนี้เป็นแค่ "ตัวช่วย" ไม่ใช่ตัวบังคับ — เบราว์เซอร์เก่าหรือกรณีที่ decode
 * ไม่ได้จะคืนไฟล์เดิมไปเฉย ๆ ฝั่ง server จึงต้องแปลงซ้ำอีกชั้นเสมอ (ดู Media.php)
 */

/** ด้านยาวสุดที่ยอมให้เก็บ — ข่าวขึ้นเว็บกับจอในสนาม 1920 พอเหลือเฟือ */
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

/**
 * เล็กกว่านี้ไม่ต้องบีบซ้ำ
 *
 * รูปที่เล็กอยู่แล้ว (ไอคอน ภาพที่เคยผ่านระบบนี้มาแล้ว) การ re-encode
 * เปลือง CPU ลดคุณภาพลงอีกนิด และบางครั้งได้ไฟล์ "ใหญ่ขึ้น" ด้วยซ้ำ
 */
const SKIP_RECOMPRESS_BELOW_BYTES = 150 * 1024;

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** ใส่ใน accept ของ <input type="file"> ให้ตัวเลือกไฟล์กรองให้ตั้งแต่ต้น */
export const SUPPORTED_IMAGE_ACCEPT = [
  ...SUPPORTED_MIME_TYPES,
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
].join(',');

// ถามเบราว์เซอร์ครั้งเดียวต่อ session ว่าเข้ารหัส WebP ได้ไหม
let webpSupported: boolean | null = null;
const canEncodeWebp = (): boolean => {
  if (webpSupported !== null) return webpSupported;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpSupported = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupported = false;
  }
  return webpSupported;
};

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

const withExtension = (filename: string, ext: string): string => {
  const dot = filename.lastIndexOf('.');
  return (dot > 0 ? filename.slice(0, dot) : filename) + '.' + ext;
};

/**
 * ไฟล์จาก iPhone
 *
 * Safari ส่ง HEIC มาโดยไม่มี MIME หรือเป็น application/octet-stream
 * และเบราว์เซอร์ทั่วไป decode ไม่ได้ จึงต้องปล่อยผ่านไปให้ server แปลง
 */
export const isHeic = (file: File): boolean => {
  const ext = extensionOf(file.name);
  return file.type === 'image/heic' || file.type === 'image/heif'
    || ext === 'heic' || ext === 'heif';
};

export const isSupportedImage = (file: File): boolean =>
  SUPPORTED_MIME_TYPES.includes(file.type)
  || (file.type === '' && SUPPORTED_EXTENSIONS.includes(extensionOf(file.name)))
  || isHeic(file);

/**
 * ย่อ + แปลงเป็น WebP — คืนไฟล์เดิมถ้าทำไม่ได้หรือไม่คุ้มที่จะทำ
 *
 * ไม่เคยโยน error โดยตั้งใจ: การอัปโหลดต้องไม่ล้มเพราะขั้นตอนที่เป็นแค่ตัวช่วย
 */
export const resizeImageBeforeUpload = async (file: File): Promise<File> => {
  if (isHeic(file)) return file;
  if (!file.type.startsWith('image/')) return file;
  // GIF มี animation ที่ canvas เก็บไม่ได้ (จะเหลือเฟรมเดียว) ส่วน SVG เป็น vector
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  return new Promise<File>(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;
      const useWebp = canEncodeWebp();

      if (!needsResize && file.size < SKIP_RECOMPRESS_BELOW_BYTES
          && (!useWebp || file.type === 'image/webp')) {
        resolve(file);
        return;
      }

      const scale = needsResize ? MAX_DIMENSION / Math.max(w, h) : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const [type, quality, ext] = useWebp
        ? ['image/webp', WEBP_QUALITY, 'webp'] as const
        : file.type === 'image/png'
          ? ['image/png', undefined, 'png'] as const
          : ['image/jpeg', JPEG_QUALITY, 'jpg'] as const;

      canvas.toBlob(blob => {
        // บีบแล้วใหญ่กว่าเดิมก็มี (เช่น PNG ลายเส้นล้วน) — เอาใบที่เล็กกว่า
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], withExtension(file.name, ext), { type }));
      }, type, quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);   // decode ไม่ได้ ปล่อยให้ server จัดการต่อ
    };

    img.src = url;
  });
};
