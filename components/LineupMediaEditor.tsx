import React, { useEffect, useState } from 'react';
import { Clapperboard, PlayCircle, Save, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Player, Team } from '../types';
import { setLineupMedia } from '../services/sheetService';
import { notifyUser } from '../services/uiService';
import { youTubeId, youTubeThumb } from '../services/youtube';

/**
 * แท็บ "ออกอากาศ" — คลิปแนะนำทีม/รายคน และคำโปรยประจำทีม
 *
 * ใช้ร่วมกันสองที่: โมดัลจัดการทีมของผู้ดูแล (AdminDashboard) และโมดัลแก้ไขทีม
 * ของโรงเรียนเจ้าของทีม (TeamEditModal) — ทั้งสองที่มีฟอร์มแก้ทีมของตัวเองแยกกัน
 * ถ้าเขียนซ้ำสองชุดจะแก้ที่เดียวแล้วอีกที่ค้างของเก่าทันที
 *
 * บันทึกด้วย setLineupMedia ซึ่งเขียนเฉพาะช่องสื่อ — ไม่แตะรายชื่อนักกีฬา
 * และไม่ถอนสถานะอนุมัติของทีม ต่างจากปุ่ม "บันทึกข้อมูล" ของโมดัลที่ครอบอยู่
 * จึงมีปุ่มบันทึกของตัวเองแยกต่างหาก
 */

type Props = {
  team: Team;
  players: Player[];
};

const LineupMediaEditor: React.FC<Props> = ({ team, players }) => {
  const [teamVideo, setTeamVideo] = useState('');
  const [hypeText, setHypeText] = useState('');
  const [playerVideos, setPlayerVideos] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTeamVideo(team.introVideoUrl || '');
    setHypeText(team.hypeText || '');
    setPlayerVideos(Object.fromEntries(players.map(p => [p.id, p.introVideoUrl || ''])));
  }, [team.id, team.introVideoUrl, team.hypeText, players]);

  const save = async () => {
    setIsSaving(true);
    try {
      await setLineupMedia({
        teamId: team.id,
        introVideoUrl: teamVideo.trim(),
        hypeText: hypeText.trim(),
        // ส่งเฉพาะคนที่ค่าเปลี่ยนจริง — ทีมละ 15 คนแต่แก้จริงทีละหนึ่งสองคน
        players: players
          .filter(p => (playerVideos[p.id] ?? '') !== (p.introVideoUrl || ''))
          .map(p => ({ id: p.id, introVideoUrl: (playerVideos[p.id] ?? '').trim() })),
      });
      notifyUser('บันทึกแล้ว', 'คลิปและคำโปรยจะขึ้นที่หน้าผังตัวนักกีฬา', 'success');
    } catch (e: any) {
      notifyUser('บันทึกไม่สำเร็จ', e?.message || '', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
          <Clapperboard className="w-4 h-4" /> คลิปสำหรับผังตัวนักกีฬา
        </p>
        <p className="text-xs text-indigo-700 mt-1.5 leading-relaxed">
          ใช้กับหน้า “ผังตัวนักกีฬา” ที่ขึ้นจอในสนาม — คลิปทีมจะเล่นเป็นพื้นหลัง
          ตอนเปิดตัว ส่วนคลิปรายคนกดดูได้จากการ์ดที่มีสัญลักษณ์ ▶
          วางลิงก์ YouTube แบบไหนก็ได้ (youtu.be, watch?v=, Shorts)
        </p>
        <p className="text-xs text-indigo-700 mt-2 font-bold">
          บันทึกแยกจากปุ่มด้านล่าง ไม่กระทบรายชื่อและสถานะอนุมัติของทีม
        </p>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">คลิปแนะนำทีม</label>
          <input type="text" value={teamVideo} onChange={e => setTeamVideo(e.target.value)}
            placeholder="https://youtu.be/..."
            className="w-full p-3 border rounded-lg text-sm" />
          {teamVideo.trim() !== '' && (
            youTubeId(teamVideo) !== '' ? (
              <div className="flex items-center gap-3 mt-2">
                <img src={youTubeThumb(teamVideo)} alt=""
                  className="w-28 rounded-lg border border-slate-200" />
                <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> อ่านลิงก์ได้แล้ว
                </span>
              </div>
            ) : (
              <p className="text-xs text-red-600 font-bold mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> ไม่ใช่ลิงก์ YouTube ที่อ่านได้ — คลิปจะไม่ขึ้นบนจอ
              </p>
            )
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">
            คำโปรยประจำทีม <span className="font-normal">(ไม่เกิน 200 ตัวอักษร)</span>
          </label>
          <input type="text" value={hypeText} maxLength={200}
            onChange={e => setHypeText(e.target.value)}
            placeholder="เช่น แชมป์เก่า 2 สมัย"
            className="w-full p-3 border rounded-lg text-sm" />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">คลิปแนะนำรายคน</p>
        <div className="space-y-2">
          {players.map(p => {
            const url = playerVideos[p.id] ?? '';
            const ok = url.trim() === '' || youTubeId(url) !== '';
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center tabular-nums">
                  {p.number || '–'}
                </span>
                <span className="w-32 shrink-0 text-sm font-bold text-slate-700 truncate" title={p.name}>
                  {p.name}
                </span>
                <input type="text" value={url}
                  onChange={e => setPlayerVideos(v => ({ ...v, [p.id]: e.target.value }))}
                  placeholder="ลิงก์ YouTube (เว้นว่างได้)"
                  className={`flex-1 min-w-0 p-2.5 border rounded-lg text-sm ${ok ? '' : 'border-red-400 bg-red-50'}`} />
                {youTubeId(url) !== '' && (
                  <PlayCircle className="w-5 h-5 text-green-600 shrink-0" />
                )}
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              ทีมนี้ยังไม่มีรายชื่อนักกีฬา — เพิ่มรายชื่อก่อนจึงจะใส่คลิปรายคนได้
            </div>
          )}
        </div>
      </div>

      <button onClick={save} disabled={isSaving}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70">
        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> บันทึกคลิปและคำโปรย</>}
      </button>
    </div>
  );
};

export default LineupMediaEditor;
