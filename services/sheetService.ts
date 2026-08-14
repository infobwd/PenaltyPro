
// ... existing imports ...
import { Team, Player, MatchState, RegistrationData, AppSettings, School, NewsItem, Kick, UserProfile, Tournament, MatchEvent, Donation, Contest, ContestEntry, ContestComment, Prediction, Sponsor, MusicTrack, TickerMessage } from '../types';

import { DB_API, apiGet, apiPost, apiUpload, setToken } from './apiConfig';

const CACHE_KEY_DB = 'penalty_pro_db_cache';
const CACHE_KEY_TIMESTAMP = 'penalty_pro_db_timestamp';
// เดิม 5 นาที ซึ่งซ้อนกับ cache ฝั่ง server อีก 5 นาที = ข้อมูลเก่าค้างได้ถึง
// 10 นาที ทำให้ "แก้ในฐานข้อมูลแล้วหน้าเว็บไม่เปลี่ยน" ลดเหลือ 60 วินาที
// เพื่อให้ยังช่วยเรื่องเปิดแอปซ้ำเร็ว ๆ แต่ไม่หน่วงจนดูเหมือนระบบพัง
//
// การแก้ผ่าน API จะล้าง cache ฝั่ง server ให้เองอยู่แล้ว ส่วนการแก้ฐานข้อมูล
// ตรง ๆ (phpMyAdmin) ต้องสั่ง ?action=flushCache เพราะ API ไม่มีทางรู้
const CACHE_DURATION = 60 * 1000;

/** ปลายทาง API ปัจจุบัน — ใช้แสดงในหน้าตั้งค่าเพื่อให้ตรวจได้ว่าชี้ไปที่ไหน */
// getStoredScriptUrl/setStoredScriptUrl ถูกลบแล้ว — ไม่มี Apps Script ให้ตั้งค่าอีกต่อไป
// ปลายทางคือ /api/ ของโฮสต์เราเอง กำหนดตอน build ไม่ใช่ให้ผู้ใช้พิมพ์เอง

// ... existing functions ...

// --- TICKER FUNCTIONS ---



// ... existing functions submitDonation, submitPrediction etc ...

export const submitDonation = async (data: any): Promise<boolean> => {
    await apiPost('submitDonation', data);
    return true;
};

export const submitPrediction = async (data: { matchId: string, userId: string, userDisplayName: string, userPic: string, prediction: 'A' | 'B', tournamentId: string }): Promise<boolean> => {
    await apiPost('submitPrediction', data);
    return true;
};

// ... existing functions ...




// CONTEST FUNCTIONS

export const fetchContests = async (): Promise<{ contests: Contest[], entries: ContestEntry[] }> => {
    try {
        const d = await apiGet('getContests');
        return { contests: d.contests ?? [], entries: d.entries ?? [] };
    } catch (error) {
        console.error("fetchContests error", error);
        return { contests: [], entries: [] };
    }
};

export const submitContestEntry = async (data: { contestId: string, userId: string, userDisplayName: string, userPic: string, photoFile?: string, photoUrl?: string, caption: string }): Promise<boolean> => {
    await apiPost('submitContestEntry', data);
    return true;
};

export const deleteContestEntry = async (entryId: string, userId: string): Promise<boolean> => {
    await apiPost('deleteContestEntry', { entryId, userId });
    return true;
};

export const toggleEntryLike = async (entryId: string, userId: string): Promise<{ status: string, newCount?: number, likedBy?: string[] }> => {
    try {
        const r = await apiPost('toggleEntryLike', { entryId, userId });
        return { status: 'success', newCount: r.newCount, likedBy: r.likedBy };
    } catch (e) {
        return { status: 'error' };
    }
};

export const manageContest = async (data: any): Promise<boolean> => {
    await apiPost('manageContest', data);
    return true;
};

export const fetchContestComments = async (entryId: string): Promise<ContestComment[]> => {
    try {
        const d = await apiGet('getComments', { entryId });
        return d.comments ?? [];
    } catch (error) {
        return [];
    }
};

export const submitContestComment = async (data: { entryId: string, userId: string, userDisplayName: string, userPic: string, message: string }): Promise<string | null> => {
    const r = await apiPost('submitContestComment', data);
    return r.commentId ?? null;
};

export const incrementShareCount = async (entryId: string): Promise<boolean> => {
    await apiPost('incrementShareCount', { entryId });
    return true;
};

// --- SPONSOR FUNCTIONS ---



// --- MUSIC TRACK FUNCTIONS ---



// RE-EXPORT all existing functions to maintain file integrity
/** ปลายทางถูกกำหนดตอน build แล้ว (path สัมพัทธ์ /api/) แก้จากหน้าเว็บไม่ได้ */

export const fetchDatabase = async (forceRefresh: boolean = false): Promise<{ teams: Team[], players: Player[], matches: any[], config: AppSettings, schools: School[], news: NewsItem[], tournaments: Tournament[], donations: Donation[], predictions: Prediction[] } | null> => {
  try {
    // 1. Check Cache Validity
    if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEY_DB);
        const cachedTime = localStorage.getItem(CACHE_KEY_TIMESTAMP);
        
        if (cachedData && cachedTime) {
            const now = Date.now();
            if (now - parseInt(cachedTime) < CACHE_DURATION) {
                return JSON.parse(cachedData);
            }
        }
    }

    // 2. ดึงจาก PHP/MySQL (ย้ายมาแล้ว) — ไม่ใช่ Google Sheets อีกต่อไป
    //    apiGet ตรวจผลลัพธ์จริงและโยน error ถ้าเซิร์ฟเวอร์ล้มเหลว
    //    ต่างจากของเดิมที่ต่อไม่ติดแล้วยังคืน array ว่างเหมือนไม่มีข้อมูล
    const data = await apiGet<any>('getData');

    const configData = (data && data.config) ? data.config : {};
    const parsedData = {
        teams: (data && data.teams) || [],
        players: (data && data.players) || [],
        matches: (data && data.matches) || [],
        config: { ...configData, adminPin: configData.adminPin || '1234' },
        schools: (data && data.schools) || [],
        news: (data && data.news) || [],
        tournaments: (data && data.tournaments) || [],
        donations: (data && data.donations) || [],
        predictions: (data && data.predictions) || []
    };
    
    // 3. Update Cache
    localStorage.setItem(CACHE_KEY_DB, JSON.stringify(parsedData));
    localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
    return parsedData;
  } catch (error: any) {
    console.warn("Network fetch failed, attempting offline cache:", error);
    // Fallback: Return old cache even if expired if network fails
    const cachedData = localStorage.getItem(CACHE_KEY_DB);
    if (cachedData) { try { return JSON.parse(cachedData); } catch (e) { console.error("Cache corrupted", e); } }
    throw error;
  }
};

export const createTournament = async (name: string, type: string): Promise<string | null> => {
  const r = await apiPost('createTournament', { name, type });
  return r.tournamentId ?? null;
};
export const updateTournament = async (tournament: Tournament): Promise<boolean> => {
  // เดิมยิงไป Apps Script (เขียนลงชีต) ทั้งที่หน้าเว็บอ่านจาก MySQL
  // แก้ชื่อรายการแล้วจึงไม่มีทางเห็นผล — ตอนนี้เขียนลงฐานเดียวกับที่อ่าน
  await apiPost('updateTournament', { tournament });
  return true;
};

export const deleteTournament = async (
  tournamentId: string, confirmName: string, force = false,
): Promise<any> => apiPost('deleteTournament', { tournamentId, confirmName, force });
export const authenticateUser = async (data: any): Promise<UserProfile | null> => {
  // ย้ายมา PHP/MySQL แล้ว — และเก็บ token ไว้ใช้กับทุก endpoint ที่ต้องมีสิทธิ์
  // ถ้าไม่เก็บ การกดปุ่มในหน้าแอดมินจะได้ 401 ทั้งหมดทั้งที่ล็อกอินแล้ว
  const payload = data.authType === 'line'
    ? { authType: 'line', idToken: data.idToken }
    : { authType: 'login', username: data.username, password: data.password };

  const r = await apiPost('auth', payload);
  setToken(r.token);
  return {
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    pictureUrl: r.pictureUrl,
    type: data.authType === 'line' ? 'line' : 'credentials',
    phoneNumber: r.phoneNumber,
    role: r.role,
    lineUserId: r.lineUserId,
    schoolId: r.schoolId ?? null,
    schoolName: r.schoolName ?? null,
    schoolVerified: !!r.schoolVerified,
    needsSchool: !!r.needsSchool,
  };
};
export const generateGeminiContent = async (prompt: string, initialModel: string = 'gemini-1.5-flash'): Promise<string> => { return "AI Response Placeholder"; };
export const registerTeam = async (data: RegistrationData, tournamentId: string = 'default', creatorId: string = ''): Promise<string | null> => {
  const r = await apiPost('register', {
    tournamentId,
    creatorId,
    schoolName: data.schoolName,
    teamName: data.schoolName,
    shortName: data.shortName,
    color: data.color,
    logoFile: data.logoFile,
    documentFile: data.documentFile,
    slipFile: data.slipFile,
    district: data.district,
    province: data.province,
    phone: data.phone,
    directorName: data.directorName,
    managerName: data.managerName,
    managerPhone: data.managerPhone,
    coachName: data.coachName,
    coachPhone: data.coachPhone,
    lineUserId: data.lineUserId,
    players: data.players.map(p => ({
      name: p.name,
      number: p.number ?? String(p.sequence ?? ''),
      position: 'Player',
      birthDate: p.birthDate,
      photoFile: p.photoFile,
    })),
  });
  // ไฟล์ที่แนบไม่ผ่านจะไม่ทำให้ใบสมัครหาย แต่ต้องบอกให้รู้ว่าต้องแนบใหม่
  if (Array.isArray(r.warnings) && r.warnings.length > 0) {
    console.warn('register: แนบไฟล์ไม่ครบ', r.warnings);
  }
  return r.teamId ?? null;
};
/**
 * บันทึกผลการแข่งขัน (สกอร์ + ลูกจุดโทษ) ลง MySQL
 *
 * ของเดิมยิงด้วย mode:'no-cors' ทำให้ตรวจผลไม่ได้เลย — หน้าเว็บขึ้น
 * "บันทึกสำเร็จ" ทุกครั้งแม้เซิร์ฟเวอร์ล้ม ซึ่งเป็นที่มาของอาการ
 * "บันทึกแล้วผลหาย" ตรงนี้ throw ออกมาให้ผู้เรียกแจ้งผู้ใช้ได้จริง
 */
export const saveMatchToSheet = async (
  matchState: any,
  summary: string,
  skipKicks: boolean = false,
  tournamentId: string = 'default',
): Promise<boolean> => {
  const matchId = matchState.matchId || matchState.id;
  if (!matchId) throw new Error('ไม่มีรหัสนัดแข่ง (matchId)');

  const name = (v: any) => (typeof v === 'string' ? v : v?.name ?? '');

  await apiPost('saveMatchResult', {
    matchId,
    tournamentId,
    teamA: name(matchState.teamA),
    teamB: name(matchState.teamB),
    scoreA: matchState.scoreA,
    scoreB: matchState.scoreB,
    winner: matchState.winner,
    status: matchState.isFinished ? 'Finished' : 'Live',
    summary,
    roundLabel: matchState.roundLabel,
    venue: matchState.venue,
    livestreamUrl: matchState.livestreamUrl,
    livestreamCover: matchState.livestreamCover,
    skipKicks,
    kicks: skipKicks ? [] : (matchState.kicks || []),
  });
  return true;
};

/** เหตุการณ์ในเกม (ประตู/ใบเหลือง/เปลี่ยนตัว) — ใช้กับ 7v7 และ 11v11 */
export const saveMatchEventsToSheet = async (events: MatchEvent[]): Promise<boolean> => {
  if (!events || events.length === 0) return true;
  await apiPost('saveMatchEvents', { events });
  return true;
};

/**
 * ยกเลิกรายการที่กดผิดจากหน้าโต๊ะพากย์
 *
 * ให้เซิร์ฟเวอร์เป็นผู้ลบและคำนวณคะแนนใหม่ใน transaction เดียว เพื่อไม่ให้เกิด
 * ช่วงที่ลูกยิงหายแล้วแต่คะแนนยังเป็นค่าเดิมบน Live Wall
 */
export const cancelMatchRecord = async (request: {
  matchId: string;
  kind: 'kick' | 'goal';
  round?: number;
  teamId?: 'A' | 'B';
  eventId?: string;
}): Promise<{ scoreA: number; scoreB: number }> => {
  const response = await apiPost<any>('cancelMatchRecord', request);
  return {
    scoreA: Number(response.scoreA || 0),
    scoreB: Number(response.scoreB || 0),
  };
};

/** ล้างผลสดที่เกิดจากการทดสอบ เมื่อกดออกจากหน้าบันทึกผลโดยไม่บันทึก */
export const discardMatchDraft = async (matchId: string): Promise<boolean> => {
  await apiPost('discardMatchDraft', { matchId });
  return true;
};

/** จัดตาราง: สร้าง/แก้คู่แข่ง วันเวลา และสนาม (ยังไม่มีผลการแข่ง) */
export const scheduleMatch = async (
  matchId: string, teamA: string, teamB: string, roundLabel: string,
  venue?: string, scheduledTime?: string,
  livestreamUrl?: string, livestreamCover?: string,
  tournamentId: string = 'default',
  highlightUrl?: string, highlightTitle?: string,
): Promise<boolean> => {
  await apiPost('saveMatch', {
    matchId, teamA, teamB, roundLabel, venue, scheduledTime,
    // '-' = ตั้งใจล้างค่า / ว่าง = ไม่ได้แตะช่องนี้ (ดูเหตุผลใน fixtures.php)
    livestreamUrl: livestreamUrl === '' ? '-' : livestreamUrl,
    livestreamCover, tournamentId,
    // ส่ง '-' เมื่อผู้ใช้ล้างช่องทิ้ง เพื่อแยกจาก "ไม่ได้แตะช่องนี้"
    // ฝั่ง server ตีความว่างเปล่าว่า "ไม่เปลี่ยน" ไม่งั้นแก้เวลาแข่งอย่างเดียว
    // จะลบลิงก์ไฮไลต์ทิ้งโดยไม่มีใครตั้งใจ
    highlightUrl: highlightUrl === '' ? '-' : highlightUrl,
    highlightTitle: highlightTitle === '' ? '-' : highlightTitle,
  });
  return true;
};

export const deleteMatch = async (matchId: string): Promise<boolean> => {
  // force=true เพราะแอดมินยืนยันบนหน้าจอแล้ว ไม่งั้นนัดที่แข่งไปแล้วจะลบไม่ออก
  await apiPost('deleteMatch', { matchId, force: true });
  return true;
};
/**
 * บันทึกข้อมูลทีม + รายชื่อผู้เล่น (ฝั่งแอดมิน)
 *
 * เดิมใช้ mode:'no-cors' ยิงไป Apps Script แล้ว return true เสมอ — แอดมินเห็น
 * "บันทึกสำเร็จ" ทุกครั้งทั้งที่เขียนลงชีตคนละที่กับที่หน้าเว็บอ่าน
 */
export const updateTeamData = async (
  team: Partial<Team> & { status?: string; groupName?: string; schoolId?: string },
  players: Partial<Player>[],
  /**
   * URL ไฟล์ที่เพิ่งอัปใหม่ — ส่งเฉพาะตัวที่เปลี่ยนจริง
   *
   * ห้ามส่งคีย์ที่ไม่ได้แก้: ฝั่ง server ตีความ slipUrl ที่เปลี่ยนว่าเป็นสลิปใบใหม่
   * แล้วรีเซ็ตสถานะการชำระเงินกลับไปรอตรวจ การส่งค่าเดิมซ้ำจึงทำให้สลิปที่
   * ยืนยันไปแล้วกลับมารอตรวจใหม่โดยไม่มีใครตั้งใจ
   */
  files: { logoUrl?: string; docUrl?: string; slipUrl?: string } = {},
) => {
  await apiPost('saveTeam', {
    teamId: team.id,
    name: team.name,
    shortName: team.shortName,
    managerName: team.managerName,
    managerPhone: team.managerPhone,
    coachName: team.coachName,
    coachPhone: team.coachPhone,
    directorName: team.directorName,
    status: team.status,
    groupName: team.groupName ?? team.group,
    schoolId: team.schoolId,
    ...files,
    // ส่ง id กลับไปด้วยเสมอ — server ใช้จับคู่ว่าใครเป็นคนเดิม
    // ถ้าไม่ส่ง แถวเดิมจะถูกลบแล้วสร้างใหม่ สถิติยิงจุดโทษและผลรายงานตัวหายตาม
    players: players.map(p => ({
      id: p.id, name: p.name, number: p.number, birthDate: p.birthDate, photoUrl: p.photoUrl,
    })),
  });
  return true;
};

export const updateTeamStatus = async (
  teamId: string, status: string, group?: string, reason?: string,
) => {
  if (status === 'Approved' || status === 'Rejected') {
    await apiPost('reviewTeam', {
      teamId, decision: status === 'Approved' ? 'approve' : 'reject', reason: reason ?? '',
    });
    if (group !== undefined) await apiPost('setTeamMeta', { teamId, groupName: group });
  } else {
    await apiPost('setTeamMeta', { teamId, groupName: group });
  }
  return true;
};

export const deleteTeam = async (teamId: string, force = false) => {
  await apiPost('deleteTeam', { teamId, force });
  return true;
};

export const createTeam = async (data: {
  tournamentId: string; schoolId: string; name?: string; groupName?: string;
}) => apiPost('createTeam', data);

export const setTeamMeta = async (data: {
  teamId: string; schoolId?: string; groupName?: string | null;
}) => apiPost('setTeamMeta', data);

/**
 * คลิปแนะนำทีม/รายคน สำหรับผังตัวนักกีฬา
 *
 * แยกจาก saveTeam โดยตั้งใจ — ส่งเฉพาะช่องที่ต้องการแก้ ช่องที่ไม่ส่งจะไม่ถูกแตะ
 * และไม่กระทบสถานะอนุมัติทีมหรือรายชื่อนักกีฬาเลย (ดู set_lineup_media ใน teams.php)
 */
export const setLineupMedia = async (data: {
  teamId: string;
  introVideoUrl?: string;
  hypeText?: string;
  players?: { id: string; introVideoUrl: string }[];
}) => apiPost('setLineupMedia', data);

/** กรรมการแก้เฉพาะเบอร์เสื้อจากหน้าผังตัว ไม่แตะข้อมูลอื่นของนักกีฬา */
export const updatePlayerShirtNumber = async (data: {
  teamId: string;
  playerId: string;
  number: string;
}) => apiPost('updatePlayerNumber', data);

/** แก้เบอร์เสื้อและตำแหน่งมาตรฐานที่ Lineup/Live Wall ใช้ร่วมกัน */
export const updatePlayerLineup = async (data: {
  teamId: string;
  playerId: string;
  number: string;
  position: 'GK' | 'DF' | 'MF' | 'FW' | 'Player';
}) => apiPost('updatePlayerLineup', data);

export const listSchools = async (tournamentId?: string) =>
  apiGet('listSchools', { tournamentId });

export const searchUsers = async (q: string) => apiGet('searchUsers', { q });

export const downloadSchoolAccessCodes = async (tournamentId: string): Promise<{
  tournamentName: string;
  schools: Array<{ schoolId: string; schoolName: string; accessCode: string | null }>;
}> => apiGet('downloadAccessCodes', { tournamentId });

export const fileToBase64 = (file: File): Promise<string> => { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result as string); reader.onerror = error => reject(error); }); };

// ── งานหลังบ้าน (ย้ายมา PHP/MySQL แล้ว) ───────────────────────────────────
// ทั้งหมดนี้เคยใช้ mode:'no-cors' ซึ่งตอบ "สำเร็จ" เสมอแล้วเขียนลงชีต
// คนละที่กับที่หน้าเว็บอ่าน — ตอนนี้เขียนลงฐานเดียวกับที่อ่านและตรวจผลจริง

export const fetchUsers = async (): Promise<UserProfile[]> => {
  const r = await apiGet('getUsers');
  return r.users ?? [];
};

export const createUser = async (data: any) => { await apiPost('createUser', data); return true; };
export const updateUserDetails = async (data: any) => { await apiPost('updateUserDetails', data); return true; };
export const updateUserRole = async (userId: string, role: string) => {
  await apiPost('updateUserRole', { userId, role }); return true;
};
export const deleteUser = async (userId: string) => { await apiPost('deleteUser', { userId }); return true; };

export const manageNews = async (actionType: 'add' | 'delete' | 'edit', newsItem: Partial<NewsItem>) => {
  await apiPost('manageNews', { subAction: actionType, newsItem }); return true;
};

export const saveSettings = async (settings: Partial<AppSettings>) => {
  await apiPost('saveSettings', { settings }); return true;
};

export const verifyDonation = async (donationId: string, status: 'Verified' | 'Rejected') => {
  await apiPost('verifyDonation', { donationId, status }); return true;
};
export const updateDonationDetails = async (donationId: string, updates: any) => {
  await apiPost('updateDonationDetails', { donationId, ...updates }); return true;
};

export const fetchSponsors = async (): Promise<Sponsor[]> => (await apiGet('getSponsors')).sponsors ?? [];
export const fetchSponsorPageData = async (tournamentId: string): Promise<{
  sponsors: Sponsor[];
  canManage: boolean;
}> => {
  const response = await apiGet<any>('getSponsors', { tournamentId });
  return { sponsors: response.sponsors ?? [], canManage: Boolean(response.canManage) };
};
export const manageSponsor = async (data: any) => { await apiPost('manageSponsor', data); return true; };
export const saveSponsorPaymentSettings = async (data: {
  tournamentId: string;
  enabled: boolean;
  useExistingAccount: boolean;
  qrFile?: string;
  qrUrl?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
}) => { await apiPost('saveSponsorPaymentSettings', data); return true; };
export const fetchMusicTracks = async (): Promise<MusicTrack[]> => (await apiGet('getMusicTracks')).tracks ?? [];
export const manageMusicTrack = async (data: any) => { await apiPost('manageMusicTrack', data); return true; };
export const fetchTickerMessages = async (): Promise<TickerMessage[]> => (await apiGet('getTickerMessages')).messages ?? [];
export const manageTickerMessage = async (data: any) => { await apiPost('manageTickerMessage', data); return true; };

/** โรงเรียนแก้ทีมตัวเอง — ใช้ session รหัสโรงเรียน ไม่ใช่ token แอดมิน */
export const updateMyTeam = async (team: Partial<Team>, players: Partial<Player>[], _userId?: string) => {
  await apiPost('saveTeam', {
    teamId: team.id, name: team.name, shortName: team.shortName,
    managerName: team.managerName, managerPhone: team.managerPhone,
    coachName: team.coachName, coachPhone: team.coachPhone,
    directorName: team.directorName, logoUrl: team.logoUrl,
    docUrl: team.docUrl, slipUrl: team.slipUrl,
    // ส่ง id กลับไปด้วยเสมอ — server ใช้จับคู่ว่าใครเป็นคนเดิม
    // ถ้าไม่ส่ง แถวเดิมจะถูกลบแล้วสร้างใหม่ สถิติยิงจุดโทษและผลรายงานตัวหายตาม
    players: players.map(p => ({
      id: p.id, name: p.name, number: p.number, birthDate: p.birthDate, photoUrl: p.photoUrl,
    })),
  });
  return true;
};

/**
 * อัปโหลดไฟล์ขึ้นโฮสต์แล้วคืน URL
 *
 * ส่งเป็น multipart ไม่ใช่ base64 — เล็กกว่า 33% และมี progress จริง
 */
export const uploadFile = async (file: File, kind: 'player' | 'logo' | 'doc' | 'slip' | 'news' | 'general' = 'general'): Promise<string> => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', kind);
  const r = await apiUpload('uploadFile', fd);
  return r.url;
};
