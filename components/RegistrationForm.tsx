


import React, { useState, useEffect, useRef } from 'react';
import { Upload, ArrowLeft, CheckCircle, School, User, FileText, Search, Image as ImageIcon, CreditCard, AlertCircle, X, Printer, Loader2, Share2, Plus, Trash2, Calendar, Camera, Copy, Check, ChevronDown, Printer as PrinterIcon } from 'lucide-react';
import { registerTeam, fileToBase64, updateMyTeam } from '../services/sheetService';
import { shareRegistration } from '../services/liffService';
import { RegistrationData, AppSettings, School as SchoolType, UserProfile, Team, Player } from '../types';

interface RegistrationFormProps {
  onBack: () => void;
  schools: SchoolType[];
  config: AppSettings;
  showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  user?: UserProfile | null;
  initialData?: { team: Team, players: Player[] } | null;
  registrationDeadline?: string;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3MB

// Image compression utility
const compressImage = async (file: File): Promise<File> => {
    if (file.type === 'application/pdf') return file; // Skip PDF
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                const scaleSize = MAX_WIDTH / img.width;
                const width = (scaleSize < 1) ? MAX_WIDTH : img.width;
                const height = (scaleSize < 1) ? img.height * scaleSize : img.height;

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas is empty'));
                    }
                }, 'image/jpeg', 0.7); // 70% Quality
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

const RegistrationForm: React.FC<RegistrationFormProps> = ({ onBack, schools, config, showNotification, user, initialData, registrationDeadline }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredData, setRegisteredData] = useState<RegistrationData | null>(null);
  const [registeredTeamId, setRegisteredTeamId] = useState<string | null>(null);
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');

  // 1. School & Team Info
  const [schoolName, setSchoolName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [district, setDistrict] = useState('');
  const [province, setProvince] = useState('กาญจนบุรี');
  const [phone, setPhone] = useState('');
  
  // Dual Colors
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');

  const [teamLogo, setTeamLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // 2. Personnel Info
  const [directorName, setDirectorName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachPhone, setCoachPhone] = useState('');

  // 3. Players (Dynamic)
  const [players, setPlayers] = useState(Array(7).fill(null).map((_, i) => ({
    sequence: i + 1,
    name: '',
    number: '', // Added number field
    birthDate: '',
    photoFile: null as File | null,
    photoPreview: null as string | null
  })));

  // 4. Documents
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  
  // Check Deadline
  useEffect(() => {
      if (registrationDeadline) {
          const deadline = new Date(registrationDeadline);
          const now = new Date();
          // Reset time part to compare just dates if needed, or exact time
          if (now > deadline) {
              setIsDeadlinePassed(true);
          }
      }
  }, [registrationDeadline]);

  // Load Initial Data (Editing Mode)
  useEffect(() => {
      if (initialData) {
          const { team, players: initialPlayers } = initialData;
          setSchoolName(team.name);
          setDistrict(team.district || '');
          setProvince(team.province || '');
          setPhone(team.managerPhone || ''); // Approximated
          setDirectorName(team.directorName || '');
          setManagerName(team.managerName || '');
          setManagerPhone(team.managerPhone || '');
          setCoachName(team.coachName || '');
          setCoachPhone(team.coachPhone || '');
          setLogoPreview(team.logoUrl || null);
          
          try {
              const colors = JSON.parse(team.color);
              if (Array.isArray(colors)) {
                  setPrimaryColor(colors[0]);
                  setSecondaryColor(colors[1]);
              }
          } catch(e) {}

          const loadedPlayers = initialPlayers.map((p, i) => ({
              sequence: i + 1,
              name: p.name,
              number: p.number,
              birthDate: p.birthDate || '',
              photoFile: null,
              photoPreview: p.photoUrl || null
          }));
          setPlayers(loadedPlayers);
          
          // Populate registeredData for printing purposes even before edit
          setRegisteredData({
              schoolName: team.name, shortName: team.shortName, district: team.district || '', province: team.province || '',
              phone: team.managerPhone || '', directorName: team.directorName || '', managerName: team.managerName || '',
              managerPhone: team.managerPhone || '', coachName: team.coachName || '', coachPhone: team.coachPhone || '',
              color: team.color, logoFile: null, documentFile: null, slipFile: null,
              players: loadedPlayers.map(p => ({
                  sequence: p.sequence, name: p.name, number: p.number, birthDate: p.birthDate, photoFile: null, photoUrl: p.photoPreview || undefined
              })),
              registrationTime: team.registrationTime
          });
          
          setRegisteredTeamId(team.id); // Set ID for sharing
          // Files are not re-loaded as Files, just kept as null to signify no change unless user uploads new
          if (team.slipUrl) setSlipPreview(team.slipUrl);
      } else if (user) {
        if (!managerName) setManagerName(user.displayName);
        if (!managerPhone && user.phoneNumber) setManagerPhone(user.phoneNumber);
      }
  }, [initialData, user]);

  const handleShare = () => {
      if (registeredData && registeredTeamId) {
          shareRegistration(registeredData, registeredTeamId);
      }
  };

  const handlePrint = () => {
      window.print();
  };

  useEffect(() => {
    if (teamLogo) {
        const url = URL.createObjectURL(teamLogo);
        setLogoPreview(url);
        return () => URL.revokeObjectURL(url);
    }
  }, [teamLogo]);

  useEffect(() => {
    if (slipFile) {
        const url = URL.createObjectURL(slipFile);
        setSlipPreview(url);
        return () => URL.revokeObjectURL(url);
    }
  }, [slipFile]);

  const notify = (title: string, msg: string, type: 'success' | 'error' | 'info') => {
      if (showNotification) showNotification(title, msg, type);
      else alert(`${title}: ${msg}`);
  };

  const validateFile = (file: File, type: 'image' | 'doc') => {
    const limit = type === 'image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > limit) {
        notify("ไฟล์ใหญ่เกินไป", `ขนาดไฟล์ต้องไม่เกิน ${limit / 1024 / 1024}MB (ระบบจะพยายามบีบอัด)`, "info");
        if(type === 'doc') return false; 
    }
    return true;
  };

  const handleCopy = () => {
    if (config.bankAccount) {
        navigator.clipboard.writeText(config.bankAccount);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const updatePlayer = (index: number, field: string, value: any) => { const newPlayers = [...players]; if (field === 'photoFile' && value) { const immediateUrl = URL.createObjectURL(value); newPlayers[index] = { ...newPlayers[index], photoFile: value, photoPreview: immediateUrl }; setPlayers(newPlayers); compressImage(value).then(compressed => { const compressedUrl = URL.createObjectURL(compressed); setPlayers(prev => { const updated = [...prev]; updated[index] = { ...updated[index], photoFile: compressed }; return updated; }); }).catch(err => { console.error("Compression failed, using original", err); }); } else { newPlayers[index] = { ...newPlayers[index], [field]: value }; setPlayers(newPlayers); } };
  const updatePlayerDate = (index: number, value: string) => { let cleaned = value.replace(/[^0-9]/g, ''); if (cleaned.length > 8) cleaned = cleaned.substring(0, 8); let formatted = cleaned; if (cleaned.length > 2) { formatted = cleaned.substring(0, 2) + '/' + cleaned.substring(2); } if (cleaned.length > 4) { formatted = formatted.substring(0, 5) + '/' + cleaned.substring(4); } updatePlayer(index, 'birthDate', formatted); };
  const addPlayer = () => { setPlayers([...players, { sequence: players.length + 1, name: '', number: '', birthDate: '', photoFile: null, photoPreview: null }]); };
  const removePlayer = (index: number) => { const newPlayers = players.filter((_, i) => i !== index).map((p, i) => ({ ...p, sequence: i + 1 })); setPlayers(newPlayers); };
  const handleLogoChange = async (file: File) => { try { const compressed = await compressImage(file); setTeamLogo(compressed); } catch (e) { setTeamLogo(file); } };
  const handleDocChange = (file: File) => { if (validateFile(file, 'doc')) { setDocumentFile(file); } };
  const handleSlipChange = async (file: File) => { try { const compressed = await compressImage(file); setSlipFile(compressed); } catch (e) { setSlipFile(file); } };
  
  // School Autocomplete Logic
  const handleSchoolSelect = (school: SchoolType) => { 
      setSchoolName(school.name); 
      setDistrict(school.district); 
      setProvince(school.province); 
      setShowSuggestions(false); 
  };
  const filteredSchools = schools.filter(s => s.name.toLowerCase().includes(schoolName.toLowerCase()));
  
  const generateThaiAcronym = (name: string): string => { if (/^[A-Za-z0-9\s]+$/.test(name)) { const parts = name.split(/\s+/); if (parts.length === 1) return name.substring(0, 3).toUpperCase(); return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase(); } return "T" + Math.floor(Math.random() * 100).toString().padStart(2, '0'); };

  const handleSubmit = async () => {
    if (!initialData && (!documentFile || !slipFile)) { // Files mandatory for new, optional for edit
        notify("ข้อมูลไม่ครบ", "กรุณาแนบเอกสารและหลักฐานการโอนเงิน", "error");
        return;
    }
    if (!schoolName) {
        notify("ข้อมูลไม่ครบ", "กรุณาระบุชื่อโรงเรียน", "error");
        return;
    }

    setIsSubmitting(true);
    setUploadProgress(10);
    setUploadStage("เตรียมข้อมูล...");

    try {
      setUploadStage("กำลังประมวลผลโลโก้ทีม...");
      let logoBase64 = initialData?.team.logoUrl || null;
      if (teamLogo) logoBase64 = await fileToBase64(teamLogo);
      setUploadProgress(25);

      setUploadStage("กำลังอัปโหลดเอกสาร...");
      let docBase64 = initialData?.team.docUrl || null;
      let slipBase64 = initialData?.team.slipUrl || null;
      if (documentFile) docBase64 = await fileToBase64(documentFile);
      if (slipFile) slipBase64 = await fileToBase64(slipFile);
      setUploadProgress(40);

      setUploadStage("กำลังประมวลผลข้อมูลผู้เล่น...");
      const processedPlayers = await Promise.all(players.map(async (p, idx) => {
        if (p.photoFile) setUploadStage(`กำลังอัปโหลดรูปนักกีฬาคนที่ ${p.sequence}...`);
        return {
            sequence: p.sequence,
            name: p.name,
            number: p.number,
            birthDate: p.birthDate,
            photoFile: p.photoFile ? await fileToBase64(p.photoFile) : null,
            photoUrl: p.photoPreview // Keep old URL if no new file
        };
      }));
      setUploadProgress(80);

      const validPlayers = processedPlayers.filter(p => p.name.trim() !== '');
      const combinedColors = JSON.stringify([primaryColor, secondaryColor]);
      const shortName = generateThaiAcronym(schoolName);

      if (initialData) {
          // UPDATE MODE
          const teamUpdate: Partial<Team> = {
              id: initialData.team.id,
              name: schoolName,
              shortName,
              district, province,
              directorName, managerName, managerPhone, coachName, coachPhone,
              color: combinedColors,
              logoUrl: logoBase64 || '',
              docUrl: docBase64 || '',
              slipUrl: slipBase64 || ''
          };
          const playersUpdate: Partial<Player>[] = validPlayers.map(p => ({
              name: p.name,
              number: p.number,
              birthDate: p.birthDate,
              photoUrl: p.photoFile || p.photoUrl || ''
          }));

          setUploadStage("กำลังบันทึกการแก้ไข...");
          await updateMyTeam(teamUpdate, playersUpdate, user?.userId || '');
          
          // Reconstruct data for view/print
          const finalData: RegistrationData = {
              schoolName, shortName, district, province, phone, directorName, managerName, managerPhone, coachName, coachPhone,
              color: combinedColors, logoFile: logoBase64, documentFile: docBase64, slipFile: slipBase64,
              players: validPlayers.map(p => ({ sequence: parseInt(p.number || '0'), name: p.name, number: p.number, birthDate: p.birthDate, photoFile: null, photoUrl: p.photoUrl || undefined })),
              registrationTime: initialData.team.registrationTime,
              lineUserId: user?.lineUserId
          };
          setRegisteredData(finalData);
          setRegisteredTeamId(initialData.team.id);
          
          setUploadProgress(100);
          setUploadStage("บันทึกเสร็จสิ้น");
          setIsSuccess(true);
          notify("สำเร็จ", "แก้ไขข้อมูลทีมเรียบร้อย", "success");
      } else {
          // REGISTER MODE
          const payload: RegistrationData = {
            schoolName, shortName, district, province, phone, directorName, managerName, managerPhone, coachName, coachPhone,
            color: combinedColors, logoFile: logoBase64, documentFile: docBase64, slipFile: slipBase64,
            players: validPlayers.map(p => ({
                sequence: parseInt(p.number || p.sequence.toString()),
                name: p.name, number: p.number, birthDate: p.birthDate, photoFile: p.photoFile
            })),
            registrationTime: new Date().toISOString(),
            lineUserId: user?.lineUserId // Include Line User ID if available
          };

          setUploadStage("กำลังบันทึกลงฐานข้อมูล...");
          // Pass user.userId as creatorId
          const teamId = await registerTeam(payload, 'default', user?.userId); 
          
          if (teamId) {
              setRegisteredData(payload);
              setRegisteredTeamId(teamId);
              setUploadProgress(100);
              setUploadStage("เสร็จสิ้น!");
              setIsSuccess(true);
          } else {
              throw new Error("Server did not return Team ID");
          }
      }
    } catch (error: any) {
      console.error(error);
      // Specific handling for duplicate team name error from backend
      if (error.message && error.message.includes("Duplicate")) {
          notify("ชื่อซ้ำ", "ชื่อทีมนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น", "error");
      } else {
          notify("ผิดพลาด", error.message || "เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const PrintableForm = () => {
      if (!registeredData) return null;
      return (
          <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black" style={{ fontFamily: "'Kanit', sans-serif" }}>
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                  <div className="flex items-center gap-4">
                      {config.competitionLogo && <img src={config.competitionLogo} className="w-24 h-24 object-contain" />}
                      <div>
                          <h1 className="text-3xl font-bold">{config.competitionName}</h1>
                          <p className="text-lg">ใบสมัครเข้าร่วมการแข่งขัน</p>
                      </div>
                  </div>
                  <div className="text-right">
                      <p className="font-bold text-xl">TEAM: {registeredData.schoolName}</p>
                      <p className="text-sm">วันที่สมัคร: {new Date(registeredData.registrationTime || Date.now()).toLocaleDateString('th-TH')}</p>
                      <p className="text-sm text-gray-500">ID: {registeredTeamId?.slice(-6)}</p>
                  </div>
              </div>

              <div className="mb-8 grid grid-cols-2 gap-8 text-base border-b border-gray-300 pb-6">
                  <div>
                      <h3 className="font-bold mb-3 text-xl border-b w-fit border-black pb-1">ข้อมูลโรงเรียน</h3>
                      <div className="space-y-1">
                        <p><span className="font-bold w-24 inline-block">โรงเรียน:</span> {registeredData.schoolName}</p>
                        <p><span className="font-bold w-24 inline-block">อำเภอ:</span> {registeredData.district}</p> 
                        <p><span className="font-bold w-24 inline-block">จังหวัด:</span> {registeredData.province}</p>
                        <p><span className="font-bold w-24 inline-block">ผู้ติดต่อ:</span> {registeredData.phone}</p>
                      </div>
                  </div>
                  <div>
                      <h3 className="font-bold mb-3 text-xl border-b w-fit border-black pb-1">คณะผู้ควบคุมทีม</h3>
                      <div className="space-y-1">
                        <p><span className="font-bold w-28 inline-block">ผู้อำนวยการ:</span> {registeredData.directorName}</p>
                        <p><span className="font-bold w-28 inline-block">ผู้จัดการทีม:</span> {registeredData.managerName} ({registeredData.managerPhone})</p>
                        <p><span className="font-bold w-28 inline-block">ผู้ฝึกสอน:</span> {registeredData.coachName} ({registeredData.coachPhone})</p>
                      </div>
                  </div>
              </div>

              <div>
                  <h3 className="font-bold mb-4 text-xl border-b w-fit border-black pb-1">รายชื่อนักกีฬา</h3>
                  <div className="grid grid-cols-4 gap-4">
                      {registeredData.players.map((p, idx) => (
                          <div key={idx} className="border border-gray-400 p-2 rounded flex flex-col items-center text-center">
                              <div className="w-32 h-40 bg-gray-100 mb-2 border border-gray-200 flex items-center justify-center overflow-hidden relative">
                                  {p.photoUrl ? (
                                      <img src={p.photoUrl} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="flex flex-col items-center text-gray-400">
                                          <User className="w-12 h-12 mb-1 opacity-20"/>
                                          <span className="text-[10px]">ติดรูปถ่าย</span>
                                      </div>
                                  )}
                                  <div className="absolute top-1 left-1 bg-black text-white text-xs px-1.5 rounded font-bold">{idx + 1}</div>
                              </div>
                              <div className="text-2xl font-black">{p.number || '-'}</div>
                              <div className="font-bold text-sm leading-tight h-10 flex items-center justify-center w-full px-1">{p.name}</div>
                              <div className="text-xs text-gray-600 mt-1 border-t w-full pt-1">เกิด: {p.birthDate || '-'}</div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="mt-16 flex justify-around text-center pt-8">
                  <div>
                      <div className="border-b border-black w-64 mb-2"></div>
                      <p className="font-bold">({registeredData.managerName || '......................................................'})</p>
                      <p className="text-sm">ผู้จัดการทีม</p>
                  </div>
                  <div>
                      <div className="border-b border-black w-64 mb-2"></div>
                      <p className="font-bold">({registeredData.directorName || '......................................................'})</p>
                      <p className="text-sm">ผู้อำนวยการสถานศึกษา</p>
                  </div>
              </div>
              
              <div className="absolute bottom-4 right-4 text-xs text-gray-400">
                  Generated by Penalty Pro Recorder
              </div>
          </div>
      );
  };

  if (isDeadlinePassed && !initialData) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl shadow-xl border border-red-100 my-8 max-w-2xl mx-auto">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
                  <Calendar className="w-12 h-12 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">ปิดรับสมัครแล้ว</h2>
              <p className="text-slate-500 mb-8">ขออภัย รายการนี้ปิดรับสมัครแล้ว หรือหมดเขตการลงทะเบียน</p>
              <button onClick={onBack} className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow font-bold transition">กลับหน้าหลัก</button>
          </div>
      );
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl shadow-xl border border-green-100">
        <PrintableForm />
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">{initialData ? 'แก้ไขข้อมูลเรียบร้อย' : 'ลงทะเบียนเรียบร้อย'}</h2>
        <p className="text-slate-500 mb-8 text-lg">ข้อมูลของคุณถูกบันทึกเข้าสู่ระบบแล้ว</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            <button onClick={handlePrint} className="px-6 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl shadow font-bold text-lg transition flex items-center justify-center gap-2">
                <PrinterIcon className="w-5 h-5" /> พิมพ์ใบสมัคร (PDF)
            </button>
            
            <button onClick={handleShare} className="px-6 py-3 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-xl shadow font-bold text-lg transition flex items-center justify-center gap-2">
                <Share2 className="w-5 h-5" /> แชร์ให้แอดมินตรวจสอบ
            </button>
            
            <button onClick={onBack} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 font-bold text-lg transition md:col-span-2">
                กลับหน้าหลัก
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 my-8 relative">
      
      {isSubmitting && (
          <div className="absolute inset-0 z-[60] bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-md space-y-6 text-center">
                  <div className="relative w-24 h-24 mx-auto">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-indigo-600">{uploadProgress}%</div>
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">{uploadStage}</h3>
                      <p className="text-sm text-slate-500">กรุณาอย่าปิดหน้าต่างนี้จนกว่าจะเสร็จสิ้น</p>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                      <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="bg-indigo-900 p-6 text-white flex items-center gap-4 sticky top-0 z-50 shadow-lg">
        <button onClick={onBack} className="hover:bg-white/10 p-2 rounded-full transition">
            <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
            <h2 className="font-bold text-2xl">{initialData ? 'แก้ไขข้อมูลทีม' : 'ใบสมัครแข่งขัน'}</h2>
            <p className="text-indigo-200 text-sm">{config.competitionName}</p>
        </div>
      </div>

      <div className="p-8">
        {/* Steps Indicator - Hide in edit mode */}
        {!initialData && (
            <div className="flex justify-center mb-10">
                <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <React.Fragment key={i}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step === i ? 'bg-indigo-600 text-white scale-110 ring-4 ring-indigo-100' : step > i ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {step > i ? <CheckCircle className="w-6 h-6" /> : i}
                            </div>
                            {i < 4 && <div className={`w-12 h-1 ${step > i ? 'bg-green-500' : 'bg-slate-100'}`}></div>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        )}

        {/* Combined Steps if Editing, else wizard */}
        <div className="space-y-8">
            {(step === 1 || initialData) && (
                // ... (School Info Logic) ...
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xl font-bold text-slate-800 border-b pb-2">
                        <School className="w-6 h-6 text-indigo-600" />
                        <h3>1. ข้อมูลโรงเรียน</h3>
                    </div>
                    {/* ... Existing Inputs for Step 1 ... */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 relative group">
                            <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อโรงเรียน</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                                <input 
                                    type="text" 
                                    value={schoolName} 
                                    onChange={e => {
                                        setSchoolName(e.target.value);
                                        setShowSuggestions(true);
                                    }} 
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    className="w-full pl-10 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="พิมพ์ชื่อโรงเรียนเพื่อค้นหา หรือพิมพ์ใหม่"
                                />
                                {schoolName && <button onClick={() => setSchoolName('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>}
                            </div>
                            {/* Autocomplete Dropdown */}
                            {showSuggestions && (
                                <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                                    {filteredSchools.length > 0 ? (
                                        filteredSchools.map(s => (
                                            <button 
                                                key={s.id}
                                                onClick={() => handleSchoolSelect(s)}
                                                className="w-full text-left p-3 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center"
                                            >
                                                <div>
                                                    <span className="font-bold block text-slate-800">{s.name}</span>
                                                    <span className="text-xs text-slate-500">{s.district}, {s.province}</span>
                                                </div>
                                                <ChevronDown className="w-4 h-4 text-slate-300 -rotate-90" />
                                            </button>
                                        ))
                                    ) : (
                                        <div className="p-3 text-sm text-slate-400 text-center italic">
                                            {schoolName ? 'ไม่พบชื่อโรงเรียน (สามารถพิมพ์ใหม่ได้เลย)' : 'พิมพ์ชื่อเพื่อค้นหา'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">อำเภอ</label><input type="text" value={district} onChange={e => setDistrict(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="เช่น ท่าม่วง" /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">จังหวัด</label><input type="text" value={province} onChange={e => setProvince(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="เช่น กาญจนบุรี" /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทรศัพท์ (ติดต่อ)</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="08x-xxx-xxxx" /></div>
                    </div>
                    {/* ... Colors & Logo ... */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
                        <h4 className="font-bold text-slate-700 mb-4">อัตลักษณ์ทีม</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">สีหลัก</label><div className="flex items-center gap-3"><input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0" /><span className="text-sm text-slate-500 font-mono">{primaryColor}</span></div></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">สีรอง</label><div className="flex items-center gap-3"><input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0" /><span className="text-sm text-slate-500 font-mono">{secondaryColor}</span></div></div>
                            <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">ตราสโมสร</label><div className="flex items-center gap-4">{logoPreview && (<div className="w-16 h-16 rounded-lg border bg-white p-1 relative group"><img src={logoPreview} className="w-full h-full object-contain" /><button onClick={() => {setTeamLogo(null); setLogoPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm"><X className="w-3 h-3"/></button></div>)}<label className="flex-1 flex items-center gap-3 p-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-white transition"><Upload className="w-5 h-5 text-slate-400" /><span className="text-sm text-slate-600 truncate">{teamLogo ? teamLogo.name : 'อัปโหลดไฟล์ภาพ (PNG/JPG)'}</span><input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoChange(e.target.files[0])} className="hidden" /></label></div></div>
                        </div>
                    </div>
                </div>
            )}

            {(step === 2 || initialData) && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xl font-bold text-slate-800 border-b pb-2">
                        <User className="w-6 h-6 text-indigo-600" />
                        <h3>2. คณะผู้ควบคุมทีม</h3>
                    </div>
                    {/* ... Existing Inputs for Step 2 ... */}
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">ผู้อำนวยการโรงเรียน</label><input type="text" value={directorName} onChange={e => setDirectorName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="ชื่อ-นามสกุล ผอ." /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">ผู้จัดการทีม</label><input type="text" value={managerName} onChange={e => setManagerName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="ชื่อ-นามสกุล" /></div><div><label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทร (ผู้ควบคุม)</label><input type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="08x-xxx-xxxx" /></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">ผู้ฝึกสอน (โค้ช)</label><input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="ชื่อ-นามสกุล" /></div><div><label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทรศัพท์ (โค้ช)</label><input type="tel" value={coachPhone} onChange={e => setCoachPhone(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="08x-xxx-xxxx" /></div></div>
                    </div>
                </div>
            )}

            {(step === 3 || initialData) && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xl font-bold text-slate-800 border-b pb-2 justify-between">
                        <div className="flex items-center gap-2"><User className="w-6 h-6 text-indigo-600" /><h3>3. รายชื่อนักกีฬา</h3></div>
                        <button onClick={addPlayer} className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition font-bold"><Plus className="w-4 h-4" /> เพิ่มคน</button>
                    </div>
                    {/* ... Existing Player List ... */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {players.map((player, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <div className="w-20 h-24 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 relative group">
                                    {player.photoPreview ? <img src={player.photoPreview} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><User className="w-8 h-8 mb-1" /><span className="text-[10px] font-bold">No Photo</span></div>}
                                    <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition z-10"><Camera className="w-6 h-6 text-white" /><input type="file" accept="image/*" className="hidden" onChange={(e) => updatePlayer(index, 'photoFile', e.target.files?.[0] || null)} /></label>
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-1 space-y-2">
                                    <div className="flex gap-2"><div className="w-20"><input type="number" value={player.number} onChange={(e) => updatePlayer(index, 'number', e.target.value)} className="w-full p-1.5 text-xs border border-slate-300 rounded text-center font-bold bg-slate-50" placeholder="เบอร์" /></div><div className="flex-1"><input type="text" value={player.name} onChange={(e) => updatePlayer(index, 'name', e.target.value)} className="w-full p-1.5 text-xs border border-slate-300 rounded" placeholder="ชื่อ-นามสกุล" /></div></div>
                                    <div className="relative"><input type="text" value={player.birthDate || ''} onChange={(e) => updatePlayerDate(index, e.target.value)} className="w-full p-1.5 pl-7 text-xs border border-slate-300 rounded" placeholder="วว/ดด/ปปปป" maxLength={10} /><Calendar className="w-3.5 h-3.5 absolute left-2 top-1.5 text-slate-400" /></div>
                                    {players.length > 1 && <button onClick={() => removePlayer(index)} className="text-red-500 text-[10px] flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition w-fit"><Trash2 className="w-3 h-3" /> ลบ</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(step === 4 || initialData) && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xl font-bold text-slate-800 border-b pb-2">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        <h3>4. เอกสารหลักฐาน {initialData && '(แก้ไขได้)'}</h3>
                    </div>

                    {/* PAYMENT INFO BOX */}
                    {config.bankAccount && !initialData && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-4 shadow-sm">
                            <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5"/> รายละเอียดการชำระเงิน</h4>
                            <div className="space-y-3 text-sm text-indigo-800">
                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-indigo-100">
                                    <span>ค่าสมัครทีมละ</span>
                                    <span className="font-bold text-lg text-indigo-600">{config.registrationFee ? `${config.registrationFee.toLocaleString()} บาท` : 'ฟรี'}</span>
                                </div>
                                <div>
                                    <p className="text-xs text-indigo-500 mb-1">โอนเงินเข้าบัญชี:</p>
                                    <p className="font-bold text-base">{config.bankName}</p>
                                    <div className="flex items-center gap-2 my-1 cursor-pointer bg-white w-fit px-3 py-1 rounded border border-indigo-100 hover:bg-indigo-50 transition" onClick={handleCopy}>
                                        <span className="font-mono text-xl font-black tracking-wider text-indigo-700">{config.bankAccount}</span>
                                        {copied ? <Check className="w-4 h-4 text-green-600"/> : <Copy className="w-4 h-4 text-slate-400"/>}
                                    </div>
                                    <p className="text-sm">{config.accountName}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ... Existing Docs ... */}
                    <div className="grid grid-cols-1 gap-6">
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${documentFile ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}>
                            <h4 className="font-bold text-slate-700">เอกสารใบสมัคร</h4>
                            <input type="file" id="doc-upload" accept=".pdf,.doc,.docx" className="hidden" onChange={e => e.target.files?.[0] && handleDocChange(e.target.files[0])} />
                            <label htmlFor="doc-upload" className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-indigo-700 transition mt-2">
                                {documentFile ? 'เปลี่ยนไฟล์' : (initialData?.team.docUrl ? 'อัปโหลดใหม่' : 'เลือกไฟล์')}
                            </label>
                            {documentFile && <p className="mt-2 text-sm font-bold text-indigo-700">{documentFile.name}</p>}
                        </div>
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${slipFile ? 'border-pink-400 bg-pink-50' : 'border-slate-300 bg-slate-50'}`}>
                            {slipPreview && <div className="mb-4"><img src={slipPreview} className="h-32 mx-auto object-contain rounded" /></div>}
                            <h4 className="font-bold text-slate-700">หลักฐานการโอนเงิน</h4>
                            <input type="file" id="slip-upload" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleSlipChange(e.target.files[0])} />
                            <label htmlFor="slip-upload" className="inline-block bg-pink-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-pink-700 transition mt-2">
                                {slipFile ? 'เปลี่ยนรูปภาพ' : (initialData?.team.slipUrl ? 'อัปโหลดใหม่' : 'อัปโหลดสลิป')}
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="flex justify-between mt-10 pt-6 border-t border-slate-100">
            {!initialData && step > 1 ? (
                <button onClick={() => setStep(step - 1)} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">ย้อนกลับ</button>
            ) : <div></div>}
            
            {!initialData && step < 4 ? (
                <button onClick={() => setStep(step + 1)} className="px-8 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition flex items-center gap-2">ถัดไป <ArrowLeft className="w-4 h-4 rotate-180" /></button>
            ) : (
                <button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'กำลังส่งข้อมูล...' : (initialData ? 'บันทึกการแก้ไข' : 'ยืนยันการสมัคร')}
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default RegistrationForm;