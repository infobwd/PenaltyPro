
export enum KickResult {
  GOAL = 'GOAL',
  SAVED = 'SAVED',
  MISSED = 'MISSED',
  WAITING = 'WAITING'
}

export interface AppSettings {
  competitionName: string;
  competitionLogo: string; 
  bankName: string;
  bankAccount: string;
  accountName: string;
  locationName: string;
  locationLink: string;
  announcement: string;
  adminPin?: string; 
  locationLat?: number;
  locationLng?: number;
  registrationFee?: number; 
  fundraisingGoal?: number; 
  objectiveTitle?: string; 
  objectiveDescription?: string; 
  objectiveImageUrl?: string;
  // New Configs
  liffId?: string;
  pwaStartUrl?: string;
  pwaScope?: string;
  // Support Configs
  coffeeSupportPhone?: string;
  educationSupportQrUrl?: string;
  educationSupportAccountName?: string;
  educationSupportBankName?: string;
  educationSupportAccountNumber?: string;
  showPenaltyModeCard?: boolean | string;
  showSupportButton?: boolean | string;
  /**
   * หน้าจอต้อนรับก่อนเข้าเว็บ — ผู้ดูแลส่วนกลางตั้งได้ (เก็บใน app_settings)
   * splashLogoUrl รับได้ทั้งรูปนิ่ง GIF/WebP เคลื่อนไหว และลิงก์วิดีโอ (.mp4/.webm)
   */
  splashLogoUrl?: string;
  splashTitle?: string;
  splashSubtitle?: string;
  splashFooter?: string;
  /** วินาทีที่ค้างจออย่างน้อย — ว่างหรือ 0 = ปิดทันทีที่โหลดเสร็จ */
  splashSeconds?: string | number;
  /** ช่องทางรับเงินผู้สนับสนุนของรายการ (ต่างจากบัญชีค่าสมัครได้) */
  sponsorDonationEnabled?: boolean;
  sponsorDonationUseExistingBank?: boolean;
  sponsorDonationQrUrl?: string;
  sponsorDonationBankName?: string;
  sponsorDonationBankAccount?: string;
  sponsorDonationAccountName?: string;
  /** บัญชีรับเงิน "ร่วมสนับสนุนโครงการ" บนหน้าแรก — คนละกระเป๋ากับเงินจัดแข่งขัน */
  projectDonationUseExistingBank?: boolean;
  projectDonationQrUrl?: string;
  projectDonationBankName?: string;
  projectDonationBankAccount?: string;
  projectDonationAccountName?: string;
  /** ค่าใช้ชั่วคราวเมื่อเปิดหน้าต่างแจ้งโอนจาก Sponsors/Standings */
  donationQrUrl?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  documentUrl?: string; 
  timestamp: number;
  tournamentId?: string;
}

export interface School {
  id: string;
  name: string;
  district: string;
  province: string;
}

export interface ProjectImage {
  id: string;
  url: string;
  type: 'before' | 'after' | 'general';
  caption?: string;
}

export interface TournamentPrize {
  id: string;
  rankLabel: string; 
  amount: string; 
  description?: string;
  winnerTeamId?: string; // ID of the winning team
}

export interface TournamentConfig {
  halfTimeDuration?: number; 
  playersPerTeam?: number; 
  maxSubs?: number; 
  extraTime?: boolean;
  registrationDeadline?: string; 
  registrationEnabled?: boolean;
  teamEditingEnabled?: boolean;
  teamEditDeadline?: string;
  maxTeams?: number;

  /**
   * เอกสารรับรองของทีมในหน้า /school
   * Off = ไม่รับ · Optional = รับแต่ไม่บังคับ · Required = ต้องแนบก่อนส่งรายชื่อ
   */
  docMode?: 'Off' | 'Optional' | 'Required';
  /** ไฟล์ตัวอย่าง/แบบฟอร์มให้โรงเรียนดาวน์โหลด — ว่างคือไม่มี */
  docTemplateUrl?: string;

  /**
   * เปิดหน้าเกียรติบัตรให้ผู้ใช้ทั่วไป
   * ปิดอยู่ = เห็นและเข้าได้เฉพาะเจ้าภาพ/ผู้ดูแล (ตั้งค่าที่หน้า /certificates)
   */
  certPublic?: boolean;

  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  locationName?: string;
  locationLink?: string;
  locationLat?: number;
  locationLng?: number;
  registrationFee?: number;

  sponsorDonationEnabled?: boolean;
  sponsorDonationUseExistingBank?: boolean;
  sponsorDonationQrUrl?: string;
  sponsorDonationBankName?: string;
  sponsorDonationBankAccount?: string;
  sponsorDonationAccountName?: string;
  /** บัญชีรับเงิน "ร่วมสนับสนุนโครงการ" บนหน้าแรก — คนละกระเป๋ากับเงินจัดแข่งขัน */
  projectDonationUseExistingBank?: boolean;
  projectDonationQrUrl?: string;
  projectDonationBankName?: string;
  projectDonationBankAccount?: string;
  projectDonationAccountName?: string;

  // ป้ายหน้าร้านของรายการ — ย้ายมาจากแท็บตั้งค่าระบบ
  // ทุกปีเปลี่ยนโลโก้และประกาศใหม่ ถ้าเก็บไว้ระดับระบบ พอสลับไปดูรายการเก่า
  // จะเห็นโลโก้ปีปัจจุบันติดอยู่ ซึ่งไม่ตรงกับความจริง
  competitionLogo?: string;
  announcement?: string;

  objective?: {
    isEnabled: boolean;
    title: string;
    description: string;
    goal: number;
    images: ProjectImage[];
    docUrl?: string; 
  };

  prizes?: TournamentPrize[];
}

export interface DonationRequest {
  tournamentId: string;
  amount: number;
  slipFile: string; 
  isEdonation: boolean;
  donorName: string;
  donorPhone: string;
  taxId?: string;
  address?: string;
  lineUserId?: string; 
  isAnonymous?: boolean;
  taxFile?: string;
}

export interface Donation {
  id: string;
  timestamp: string;
  donorName: string;
  amount: number;
  phone: string;
  isEdonation: boolean;
  taxId?: string;
  address?: string;
  slipUrl: string;
  tournamentId: string;
  lineUserId?: string; 
  status: 'Pending' | 'Verified' | 'Rejected'; 
  isAnonymous?: boolean;
  taxFileUrl?: string;
}

export interface Tournament {
  id: string;
  name: string;
  type: 'Penalty' | '7v7' | '11v11';
  status: 'Active' | 'Archived' | 'Upcoming';
  /** โรงเรียนเจ้าภาพ ใช้เปิดสิทธิ์จัดการเนื้อหาระดับรายการ เช่น สปอนเซอร์ */
  hostSchoolId?: string | null;
  config?: string; 
}

export interface Team {
  id: string;
  name: string; 
  shortName: string;
  color: string;
  logoUrl: string;
  /** คลิปแนะนำทีม (YouTube) — เล่นเป็นพื้นหลังตอนเปิดตัวทีมบนผังตัวนักกีฬา */
  introVideoUrl?: string;
  /** คำโปรยประจำทีม เช่น "แชมป์เก่า 2 สมัย" — ขึ้นใต้ชื่อทีมบนจอ */
  hypeText?: string;
  status?: 'Invited' | 'Draft' | 'Submitted' | 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  group?: string; 
  rejectReason?: string; 
  
  docUrl?: string;
  slipUrl?: string;
  paymentStatus?: 'Unpaid' | 'Pending' | 'Verified' | 'Rejected';
  /** ยืนยันการชำระค่าสมัครแล้ว — เห็นได้ทุกคน ต่างจาก paymentStatus ที่เห็นเฉพาะเจ้าของทีม/เจ้าหน้าที่ */
  isPaid?: boolean;
  paymentNote?: string;
  paymentReviewedAt?: string | null;

  district?: string;
  province?: string;
  schoolId?: string;
  schoolName?: string;
  directorName?: string;
  managerName?: string;
  managerPhone?: string;
  coachName?: string;
  coachPhone?: string;

  tournamentId?: string;
  creatorId?: string;
  registrationTime?: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: string;
  position: string;
  photoUrl: string;
  /** คลิปแนะนำตัวสั้น ๆ (YouTube) — ใช้บนผังตัวนักกีฬา ว่างคือไม่มี */
  introVideoUrl?: string;
  birthDate?: string;
  tournamentId?: string;
}

export interface Kick {
  id: string;
  round: number;
  teamId: 'A' | 'B';
  player: string;
  result: KickResult;
  timestamp: number;
  commentary?: string;
  tournamentId?: string; 
  matchId?: string;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  /** ไม่ได้เก็บรายเหตุการณ์ — นัดที่เหตุการณ์สังกัดอยู่รู้รายการแข่งขันอยู่แล้ว */
  tournamentId?: string;
  minute: number;
  type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUB_IN' | 'SUB_OUT' | 'OWN_GOAL' | 'BLUE_CARD';
  player: string;
  teamId: 'A' | 'B';
  relatedPlayer?: string;
  timestamp: number;
}

export interface Match {
  id: string;
  teamA: Team | string; 
  teamB: Team | string;
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | string | null; 
  date: string;
  summary?: string;
  kicks?: Kick[];
  events?: MatchEvent[];
  /** id ของทีมในนัดนั้น — ใช้ย้อนไปหาโรงเรียนได้ ต่างจาก teamA ที่เป็นชื่อ/snapshot */
  teamAId?: string;
  teamBId?: string;
  roundLabel?: string; 
  status?: 'Scheduled' | 'Finished' | 'Walkover' | 'Live';
  venue?: string; 
  scheduledTime?: string; 
  livestreamUrl?: string; 
  livestreamCover?: string;
  /** คลิปไฮไลต์/ย้อนหลัง (YouTube) — คนละอันกับ livestreamUrl มีพร้อมกันได้ */
  highlightUrl?: string;
  highlightTitle?: string;
  tournamentId?: string;
  /** เพิ่มขึ้นทุกครั้งที่สกอร์ถูกบันทึกทับ — ใช้รู้ว่าข้อมูลที่ถืออยู่เก่าหรือยัง */
  rowVersion?: number;
  /** โลโก้ที่ liveBoard ส่งมาให้ตรง ๆ — หน้าที่ poll ไม่ได้โหลดตาราง teams มาด้วย */
  teamALogo?: string;
  teamBLogo?: string;
}

export interface MatchState {
  matchId?: string;
  teamA: Team;
  teamB: Team;
  currentRound: number;
  currentTurn: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  kicks: Kick[];
  events?: MatchEvent[];
  timer?: number;
  isPaused?: boolean;
  isFinished: boolean;
  winner: 'A' | 'B' | null;
  roundLabel?: string;
  tournamentId?: string;
  /** ทีมที่แตะก่อนในรอบปกติ (5 คนแรก) — เลือกจากเสี่ยงทายหัวก้อยหรือเลือกเองก่อนเริ่มบันทึก ไม่ระบุ = A */
  firstKicker?: 'A' | 'B';
  /**
   * รอบต่อเวลาหลังเสมอในรอบปกติ (sudden death) — เพิ่มทีละช่วงเมื่อกรรมการเลือก
   * ทีมที่แตะก่อนและจำนวนคนที่จะแตะของรอบนั้น หลังแตะครบแล้วถ้ายังเสมออยู่จะถามใหม่อีกครั้ง
   */
  extraPhases?: { firstTeam: 'A' | 'B'; size: number }[];
  /** แตะครบทุกช่วงที่กำหนดไว้แล้วแต่ยังเสมอ — ต้องให้กรรมการเลือกช่วงต่อเวลาใหม่ก่อนแตะต่อได้ */
  needsExtraPhase?: boolean;
}

export interface RegistrationData {
  id?: string;
  schoolName: string;
  shortName?: string;
  district: string;
  province: string;
  phone: string;
  directorName: string;
  managerName: string;
  managerPhone: string;
  coachName: string;
  coachPhone: string;
  color: string;
  logoFile: string | null; 
  documentFile: string | null; 
  slipFile: string | null; 
  registrationTime?: string;
  players: {
    id?: string;
    sequence: number; 
    name: string;
    number?: string;
    birthDate: string; 
    photoFile: string | null; 
    photoUrl?: string;
  }[];
  tournamentId?: string;
  creatorId?: string;
  lineUserId?: string;
}

export interface Standing {
  teamId: string;
  teamName: string;
  logoUrl: string;
  group: string; 
  played: number;
  won: number;
  lost: number;
  goalsFor: number; 
  goalsAgainst: number; 
  points: number; 
}

export interface UserProfile {
  /** โรงเรียนต้นสังกัด — ผู้ใช้เลือกเองตอนเข้าครั้งแรก หรือแอดมินกำหนดให้ */
  schoolId?: string | null;
  schoolName?: string | null;
  /** ยังไม่เคยเลือกโรงเรียน — ให้ถามก่อนใช้งาน */
  needsSchool?: boolean;
  /** เคยตอบเรื่องโรงเรียนแล้ว (ตอบว่า "ไม่สังกัด" ก็นับ) — ใช้แยกจาก "ยังไม่ได้เลือก" */
  schoolChosen?: boolean;
  /** ผู้ดูแลรับรองการผูกโรงเรียนแล้ว — เข้าจัดการทีมได้โดยไม่ต้องกรอกรหัส 8 ตัว */
  schoolVerified?: boolean;
  userId: string;
  username?: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  type: 'line' | 'guest' | 'credentials';
  phoneNumber?: string; 
  /** referee = กรรมการบันทึกผล เข้าหน้าบันทึกผลได้อย่างเดียว ไม่เห็นหลังบ้าน */
  role?: 'admin' | 'staff' | 'referee' | 'user';
  lineUserId?: string;
  lastLogin?: string;
  fanPoints?: number; // Calculated on client
}

export interface Contest {
  id: string;
  /** รายการแข่งขันที่การประกวดนี้สังกัด — null/ว่าง = ส่วนกลาง ใช้ได้ทุกรายการ */
  tournamentId?: string | null;
  title: string;
  description: string;
  status: 'Open' | 'Closed';
  createdDate: string;
  closingDate?: string;
}

export interface ContestEntry {
  id: string;
  contestId: string;
  userId: string;
  userDisplayName: string;
  userPictureUrl?: string;
  photoUrl: string;
  caption: string;
  likeCount: number;
  likedBy: string[]; // Array of UserIDs
  timestamp: string;
  commentCount?: number;
  shareCount?: number;
}

export interface ContestComment {
  id: string;
  entryId: string;
  userId: string;
  userDisplayName: string;
  userPictureUrl?: string;
  message: string;
  timestamp: string;
}

export interface Prediction {
  id: string;
  matchId: string;
  userId: string;
  userDisplayName: string;
  userPictureUrl?: string;
  prediction: 'A' | 'B';
  timestamp: string;
  tournamentId?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  /** รูปแบบจริงอาจต่อท้ายขอบเขตรายการ เช่น Main::TRN_123 */
  type?: string;
  contributionType?: 'Money' | 'Goods' | 'Unspecified';
  /** จำนวนเงิน หรือมูลค่าโดยประมาณของสิ่งของ */
  contributionAmount?: number | null;
  contributionDetail?: string;
  acknowledgementNo?: string;
  acknowledgementDate?: string;
  signerName?: string;
  signerTitle?: string;
  signatureUrl?: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  type: 'Youtube' | 'Spotify' | 'Suno' | 'Other';
}

export interface TickerMessage {
  id: string;
  message: string;
  isActive: boolean;
  type?: string; // e.g., 'global' or 'tournament_id'
}
