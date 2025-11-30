import React, { useState, useEffect } from 'react';
import { Team, Player } from '../types';
import { X, Save, Loader2, User, Plus, Trash2, Camera, FileText, Image as ImageIcon, CreditCard, ExternalLink, Shield, MapPin, Phone } from 'lucide-react';
import { fileToBase64 } from '../services/sheetService';

interface TeamEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team;
  currentPlayers: Player[];
  onSave: (updatedTeam: Team, updatedPlayers: Player[]) => Promise<void>;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3MB

const TeamEditModal: React.FC<TeamEditModalProps> = ({ isOpen, onClose, team, currentPlayers, onSave }) => {
  const [formData, setFormData] = useState<Team>(team);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'players' | 'docs'>('info');
  const [isSaving, setIsSaving] = useState(false);
  
  // File States
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [newSlip, setNewSlip] = useState<File | null>(null);
  const [newDoc, setNewDoc] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');

  useEffect(() => {
    if (isOpen) {
        setFormData(team);
        // Deep copy players to avoid reference issues
        setPlayers(JSON.parse(JSON.stringify(currentPlayers)));
        setLogoPreview(team.logoUrl || null);
        setSlipPreview(team.slipUrl || null);
        setNewLogo(null);
        setNewSlip(null);
        setNewDoc(null);
        
        try {
            const parsed = JSON.parse(team.color);
            if (Array.isArray(parsed)) {
                setPrimaryColor(parsed[0]);
                setSecondaryColor(parsed[1]);
            } else {
                setPrimaryColor(team.color || '#2563EB');
            }
        } catch(e) {
            setPrimaryColor(team.color || '#2563EB');
        }
    }
  }, [isOpen, team, currentPlayers]);

  const validateFile = (file: File, type: 'image' | 'doc') => {
    const limit = type === 'image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > limit) {
        alert(`ไฟล์ใหญ่เกินไป ขนาดไฟล์ต้องไม่เกิน ${limit / 1024 / 1024}MB`);
        return false;
    }
    return true;
  };

  const handleFileChange = (type: 'logo' | 'slip' | 'doc', file: File) => {
      if (!file) return;
      if (type === 'doc') {
          if (!validateFile(file, 'doc')) return;
          setNewDoc(file);
      } else {
          if (!validateFile(file, 'image')) return;
          const previewUrl = URL.createObjectURL(file);
          if (type === 'logo') {
              setNewLogo(file);
              setLogoPreview(previewUrl);
          } else if (type === 'slip') {
              setNewSlip(file);
              setSlipPreview(previewUrl);
          }
      }
  };

  const handleColorChange = (type: 'primary' | 'secondary', color: string) => {
      if (type === 'primary') setPrimaryColor(color);
      else setSecondaryColor(color);
      // Will combine on save
  };

  const handlePlayerChange = (index: number, field: keyof Player, value: string) => {
      const updated = [...players];
      updated[index] = { ...updated[index], [field]: value };
      setPlayers(updated);
  };

  const handleDateInput = (index: number, value: string) => {
      let cleaned = value.replace(/[^0-9]/g, '');
      if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
      let formatted = cleaned;
      if (cleaned.length > 2) formatted = cleaned.substring(0, 2) + '/' + cleaned.substring(2);
      if (cleaned.length > 4) formatted = formatted.substring(0, 5) + '/' + cleaned.substring(4);
      handlePlayerChange(index, 'birthDate', formatted);
  };

  const handlePlayerPhotoChange = async (index: number, file: File) => {
      if (!file || !validateFile(file, 'image')) return;
      try {
          const base64 = await fileToBase64(file);
          const updated = [...players];
          updated[index] = { ...updated[index], photoUrl: base64 };
          setPlayers(updated);
      } catch (e) {
          console.error(e);
      }
  };

  const addPlayer = () => {
      const newPlayer: Player = {
          id: `TEMP_${Date.now()}`,
          teamId: team.id,
          name: '',
          number: '',
          position: 'Player',
          photoUrl: '',
          birthDate: ''
      };
      setPlayers([...players, newPlayer]);
  };

  const removePlayer = (index: number) => {
      if (confirm("ต้องการลบรายชื่อนี้?")) {
          setPlayers(players.filter((_, i) => i !== index));
      }
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
          let logoUrl = formData.logoUrl;
          let slipUrl = formData.slipUrl;
          let docUrl = formData.docUrl;

          if (newLogo) logoUrl = await fileToBase64(newLogo);
          if (newSlip) slipUrl = await fileToBase64(newSlip);
          if (newDoc) docUrl = await fileToBase64(newDoc);

          const combinedColors = JSON.stringify([primaryColor, secondaryColor]);

          const finalTeamData = {
              ...formData,
              color: combinedColors,
              logoUrl,
              slipUrl,
              docUrl
          };

          await onSave(finalTeamData, players);
          onClose();
      } catch (e) {
          console.error("Save error", e);
          alert("เกิดข้อผิดพลาดในการบันทึก");
      } finally {
          setIsSaving(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2"><User className="w-5 h-5"/> แก้ไขข้อมูลทีม</h3>
            <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition"><X className="w-5 h-5"/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
            <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-sm font-bold transition ${activeTab === 'info' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>ข้อมูลทั่วไป</button>
            <button onClick={() => setActiveTab('players')} className={`flex-1 py-3 text-sm font-bold transition ${activeTab === 'players' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>รายชื่อนักกีฬา</button>
            <button onClick={() => setActiveTab('docs')} className={`flex-1 py-3 text-sm font-bold transition ${activeTab === 'docs' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>เอกสารหลักฐาน</button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-white">
            
            {activeTab === 'info' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อทีม/โรงเรียน</label>
                            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อย่อ (3-4 ตัวอักษร)</label>
                            <input type="text" value={formData.shortName} onChange={e => setFormData({...formData, shortName: e.target.value})} className="w-full p-3 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">สถานะ (Admin Only)</label>
                            <div className={`w-full p-3 border rounded-lg text-sm bg-slate-50 font-bold ${formData.status === 'Approved' ? 'text-green-600' : formData.status === 'Rejected' ? 'text-red-600' : 'text-yellow-600'}`}>
                                {formData.status}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">อำเภอ</label>
                            <input type="text" value={formData.district || ''} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full p-3 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">จังหวัด</label>
                            <input type="text" value={formData.province || ''} onChange={e => setFormData({...formData, province: e.target.value})} className="w-full p-3 border rounded-lg text-sm" />
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold text-sm text-slate-700 mb-3">อัตลักษณ์ทีม</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">สีหลัก</label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={primaryColor} onChange={e => handleColorChange('primary', e.target.value)} className="h-10 w-full p-0 border-0 rounded cursor-pointer" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">สีรอง</label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={secondaryColor} onChange={e => handleColorChange('secondary', e.target.value)} className="h-10 w-full p-0 border-0 rounded cursor-pointer" />
                                </div>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">ตราสโมสร</label>
                            <div className="flex items-center gap-4">
                                {logoPreview ? <img src={logoPreview} className="w-20 h-20 object-contain border rounded-lg p-1"/> : <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">No Logo</div>}
                                <label className="cursor-pointer bg-slate-50 border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition">
                                    อัปโหลดใหม่
                                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('logo', e.target.files[0])} />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold text-sm text-slate-700 mb-3">ข้อมูลติดต่อ</h4>
                        <div className="space-y-3">
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">ผู้อำนวยการ</label><input type="text" value={formData.directorName || ''} onChange={e => setFormData({...formData, directorName: e.target.value})} className="w-full p-3 border rounded-lg text-sm" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">ผู้จัดการทีม</label><input type="text" value={formData.managerName || ''} onChange={e => setFormData({...formData, managerName: e.target.value})} className="w-full p-3 border rounded-lg text-sm" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">เบอร์โทร (ผจก)</label><input type="text" value={formData.managerPhone || ''} onChange={e => setFormData({...formData, managerPhone: e.target.value})} className="w-full p-3 border rounded-lg text-sm" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">ผู้ฝึกสอน</label><input type="text" value={formData.coachName || ''} onChange={e => setFormData({...formData, coachName: e.target.value})} className="w-full p-3 border rounded-lg text-sm" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">เบอร์โทร (โค้ช)</label><input type="text" value={formData.coachPhone || ''} onChange={e => setFormData({...formData, coachPhone: e.target.value})} className="w-full p-3 border rounded-lg text-sm" /></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'players' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-sm text-slate-700">รายชื่อนักกีฬา ({players.length})</h4>
                        <button onClick={addPlayer} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-700 transition"><Plus className="w-3 h-3"/> เพิ่มนักกีฬา</button>
                    </div>
                    <div className="space-y-3">
                        {players.map((p, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-3 border rounded-xl bg-slate-50">
                                <div className="w-16 h-20 bg-white rounded-lg border flex items-center justify-center shrink-0 overflow-hidden relative group">
                                    {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-300"/>}
                                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition">
                                        <Camera className="w-5 h-5 text-white"/>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePlayerPhotoChange(idx, e.target.files[0])} />
                                    </label>
                                </div>
                                <div className="flex-1 grid grid-cols-12 gap-2">
                                    <div className="col-span-3"><input type="text" placeholder="เบอร์" value={p.number} onChange={e => handlePlayerChange(idx, 'number', e.target.value)} className="w-full p-2 border rounded-lg text-xs text-center font-bold" /></div>
                                    <div className="col-span-9"><input type="text" placeholder="ชื่อ-นามสกุล" value={p.name} onChange={e => handlePlayerChange(idx, 'name', e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
                                    <div className="col-span-6"><input type="text" placeholder="วันเกิด (วว/ดด/ปปปป)" value={p.birthDate || ''} onChange={e => handleDateInput(idx, e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
                                    <div className="col-span-6"><input type="text" placeholder="ตำแหน่ง" value={p.position || 'Player'} onChange={e => handlePlayerChange(idx, 'position', e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
                                </div>
                                <button onClick={() => removePlayer(idx)} className="text-red-400 hover:text-red-600 p-2"><Trash2 className="w-4 h-4"/></button>
                            </div>
                        ))}
                        {players.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">ไม่มีรายชื่อนักกีฬา</div>}
                    </div>
                </div>
            )}

            {activeTab === 'docs' && (
                <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-sm font-bold text-slate-700 mb-2">เอกสารใบสมัคร (PDF/Word)</label>
                        <div className="flex items-center gap-3">
                            <label className="cursor-pointer bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition flex items-center gap-2 shadow-sm">
                                <FileText className="w-4 h-4 text-indigo-600"/>
                                {newDoc ? newDoc.name : (formData.docUrl ? 'เปลี่ยนไฟล์' : 'อัปโหลดไฟล์')}
                                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('doc', e.target.files[0])} />
                            </label>
                            {formData.docUrl && (
                                <a href={formData.docUrl} target="_blank" className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 hover:bg-indigo-100 text-xs flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" /> ดูไฟล์เดิม
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-sm font-bold text-slate-700 mb-2">หลักฐานการโอนเงิน (สลิป)</label>
                        <div className="flex flex-col gap-4">
                            <label className="cursor-pointer block w-full border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-white transition">
                                <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2"/>
                                <span className="text-xs text-slate-500 font-bold block">{newSlip ? newSlip.name : 'แตะเพื่อเปลี่ยนรูปสลิป'}</span>
                                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('slip', e.target.files[0])} />
                            </label>
                            {slipPreview && (
                                <div className="relative mx-auto">
                                    <img src={slipPreview} className="max-h-64 rounded-lg shadow-sm border" />
                                    <div className="text-center text-xs text-slate-400 mt-1">ตัวอย่างรูปสลิป</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex gap-3 shrink-0">
            <button onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition">ยกเลิก</button>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Save className="w-5 h-5"/> บันทึกข้อมูล</>}
            </button>
        </div>

      </div>
    </div>
  );
};

export default TeamEditModal;