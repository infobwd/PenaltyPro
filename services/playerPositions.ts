/**
 * รหัสตำแหน่งมาตรฐานที่ Lineup, Live Wall และการจัดอันดับใช้ร่วมกัน
 *
 * ข้อมูลเก่ามีทั้งภาษาไทย/อังกฤษและคำย่อ จึงต้อง normalize ก่อนเปรียบเทียบ
 * ไม่เช่นนั้น "Goalkeeper" จะไม่ถูกนับเป็น GK และหลุดจากผังผู้รักษาประตู
 */
export const PLAYER_POSITIONS = [
  { value: 'GK', label: 'ผู้รักษาประตู' },
  { value: 'DF', label: 'กองหลัง' },
  { value: 'MF', label: 'กองกลาง' },
  { value: 'FW', label: 'กองหน้า' },
  { value: 'Player', label: 'นักกีฬา (ไม่ระบุตำแหน่ง)' },
] as const;

export type PlayerPositionCode = typeof PLAYER_POSITIONS[number]['value'];

const POSITION_ALIASES: Record<string, PlayerPositionCode> = {
  GK: 'GK', G: 'GK', GOALKEEPER: 'GK', KEEPER: 'GK', 'ผู้รักษาประตู': 'GK', 'ประตู': 'GK',
  DF: 'DF', D: 'DF', DEFENDER: 'DF', DEFENCE: 'DF', DEFENSE: 'DF', 'กองหลัง': 'DF',
  MF: 'MF', M: 'MF', MIDFIELDER: 'MF', MIDFIELD: 'MF', 'กองกลาง': 'MF',
  FW: 'FW', F: 'FW', FORWARD: 'FW', STRIKER: 'FW', ATTACKER: 'FW', 'กองหน้า': 'FW',
  PLAYER: 'Player', 'นักกีฬา': 'Player', 'ผู้เล่น': 'Player', 'ไม่ระบุ': 'Player',
};

export const normalizePlayerPosition = (value?: string | null): PlayerPositionCode => {
  const key = String(value || '').trim();
  if (!key) return 'Player';
  return POSITION_ALIASES[key] ?? POSITION_ALIASES[key.toUpperCase()] ?? 'Player';
};

export const playerPositionLabel = (value?: string | null): string => {
  const normalized = normalizePlayerPosition(value);
  return PLAYER_POSITIONS.find(item => item.value === normalized)?.label || 'นักกีฬา';
};

export const playerPositionRank = (value?: string | null): number => {
  const normalized = normalizePlayerPosition(value);
  return PLAYER_POSITIONS.findIndex(item => item.value === normalized);
};

export const isGoalkeeper = (value?: string | null): boolean =>
  normalizePlayerPosition(value) === 'GK';
