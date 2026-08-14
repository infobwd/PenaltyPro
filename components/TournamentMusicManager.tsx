import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Music, Plus, Sparkles, Trash2, Youtube, Globe, Trophy } from 'lucide-react';
import { MusicTrack } from '../types';
import { fetchMusicTracks, manageMusicTrack } from '../services/sheetService';
import { confirmAction } from '../services/uiService';

/**
 * เพลงประกอบจอ Live Wall — ย้ายมาตั้งที่หน้าผู้ดูแลของแต่ละรายการ
 *
 * เดิมตั้งได้ที่ปุ่มเฟืองบนจอ Live Wall เท่านั้น ซึ่งเป็นจอที่ตั้งไว้หน้างาน
 * และมักต่อกับโปรเจกเตอร์ไปแล้ว การเข้าไปแก้จึงต้องไปยืนหน้าจอนั้นจริง ๆ
 * ตอนนี้เตรียมเพลย์ลิสต์ล่วงหน้าจากที่ไหนก็ได้
 *
 * ⚠️ ใช้ตาราง music_tracks และ API ตัวเดิมทั้งหมด — เพลงที่เคยเพิ่มไว้ผ่านจอ
 * ยังอยู่ครบและแก้ต่อจากที่นี่ได้ทันที ไม่ต้องย้ายข้อมูล
 *
 * ขอบเขตเก็บใน track_type เป็น "Youtube::tournamentId" ตามรูปแบบเดิมของระบบ
 * ไม่มี :: = เพลงส่วนกลาง ใช้ได้ทุกรายการ
 */

type Notice = (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

type Props = {
  tournamentId: string;
  tournamentName?: string;
  notify: Notice;
};

const TRACK_KINDS = ['Youtube', 'Suno', 'Spotify', 'Other'] as const;
type TrackKind = typeof TRACK_KINDS[number];

/** เดาชนิดจากลิงก์ — ผู้ใช้ไม่ควรต้องมานั่งเลือกเองถ้าดูออกจาก URL อยู่แล้ว */
const guessKind = (url: string): TrackKind => {
  const u = url.toLowerCase();
  if (u.includes('youtube') || u.includes('youtu.be')) return 'Youtube';
  if (u.includes('suno.com')) return 'Suno';
  if (u.includes('spotify')) return 'Spotify';
  return 'Other';
};

const baseKind = (type?: string): string => String(type || '').split('::')[0] || 'Other';
const scopeOf = (type?: string): string | null => {
  const parts = String(type || '').split('::');
  return parts.length > 1 && parts[1] !== '' ? parts[1] : null;
};

const TournamentMusicManager: React.FC<Props> = ({ tournamentId, tournamentName, notify }) => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<'tournament' | 'global'>('tournament');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTracks(await fetchMusicTracks());
    } catch (error: any) {
      notify('โหลดรายการเพลงไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  /** เพลงของรายการนี้ + เพลงส่วนกลาง คือชุดที่จอจะเล่นจริง */
  const visible = useMemo(() => tracks.filter(t => {
    const s = scopeOf(t.type);
    return s === null || s === tournamentId;
  }), [tracks, tournamentId]);

  const add = async () => {
    if (name.trim() === '' || url.trim() === '' || busy) return;
    setBusy(true);
    try {
      const kind = guessKind(url);
      await manageMusicTrack({
        subAction: 'add', name: name.trim(), url: url.trim(),
        type: scope === 'global' ? kind : `${kind}::${tournamentId}`,
      });
      setName(''); setUrl('');
      await load();
      notify('เพิ่มเพลงแล้ว', 'จอ Live Wall จะเล่นเพลงนี้ในรอบถัดไป', 'success');
    } catch (error: any) {
      notify('เพิ่มเพลงไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (track: MusicTrack) => {
    if (!await confirmAction(`“${track.name}” จะถูกนำออกจากเพลย์ลิสต์ของจอ`, {
      title: 'ลบเพลงนี้?', confirmText: 'ลบเพลง', dangerous: true,
    })) return;
    setBusy(true);
    try {
      await manageMusicTrack({ subAction: 'delete', id: track.id });
      await load();
      notify('ลบเพลงแล้ว', '', 'info');
    } catch (error: any) {
      notify('ลบไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full min-h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="ชื่อเพลง" className={inputClass} />
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="ลิงก์ YouTube / Suno / ไฟล์ MP3" className={inputClass} />

        <div className="flex gap-2">
          {([['tournament', 'เฉพาะรายการนี้', Trophy], ['global', 'ทุกรายการ', Globe]] as const)
            .map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setScope(value)}
                className={`flex-1 min-h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5
                  ${scope === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-500'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
        </div>

        <button onClick={add} disabled={busy || name.trim() === '' || url.trim() === ''}
          className="w-full min-h-11 rounded-xl bg-indigo-600 text-white font-bold text-sm
                     flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> เพิ่มเพลง</>}
        </button>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">
          เพลย์ลิสต์ที่จอจะเล่น ({visible.length})
          {tournamentName && <span className="font-normal"> · {tournamentName}</span>}
        </p>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
            ยังไม่มีเพลง — จอจะเล่นแบบไม่มีเสียงประกอบ
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(track => {
              const kind = baseKind(track.type);
              const isGlobal = scopeOf(track.type) === null;
              return (
                <div key={track.id}
                  className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    {kind === 'Youtube' ? <Youtube className="w-4 h-4 text-red-600" />
                      : kind === 'Suno' ? <Sparkles className="w-4 h-4 text-purple-600" />
                      : <Music className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-700 truncate">{track.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{track.url}</p>
                  </div>
                  {isGlobal && (
                    <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100
                                     border border-slate-200 rounded-full px-2 py-0.5">
                      ทุกรายการ
                    </span>
                  )}
                  <button onClick={() => void remove(track)} disabled={busy}
                    aria-label={`ลบเพลง ${track.name}`}
                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">
          เพลงที่เคยเพิ่มไว้จากปุ่มเฟืองบนจอ Live Wall ยังอยู่ครบและแก้จากที่นี่ได้เลย
        </p>
      </div>
    </div>
  );
};

export default TournamentMusicManager;
