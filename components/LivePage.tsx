import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Radio, Film, Play, Clock, Calendar, ExternalLink, Search, Tv,
} from 'lucide-react';
import { Match, Team, AppSettings } from '../types';
import { youTubeEmbed, youTubeThumb, youTubeWatch, youTubeId } from '../services/youtube';

/**
 * หน้าถ่ายทอดสดและคลังคลิปไฮไลต์
 *
 * รวมสองอย่างที่ผู้ชมตามหาไว้ที่เดียว: "ตอนนี้ถ่ายทอดคู่ไหน" กับ
 * "คู่ที่พลาดไปดูย้อนหลังได้ที่ไหน" เดิมกระจายอยู่ในหน้าตารางแข่งทีละนัด
 * ต้องกดเข้าไปดูทีละคู่ถึงจะรู้ว่ามีคลิปหรือเปล่า
 */

type Props = {
  matches: Match[];
  teams: Team[];
  config: AppSettings;
  onBack: () => void;
  onOpenWall?: () => void;
};

const teamName = (t: any): string =>
  typeof t === 'string' ? t : (t?.name ?? 'ไม่ระบุ');

const teamLogo = (t: any, teams: Team[]): string => {
  if (typeof t === 'object' && t?.logoUrl) return t.logoUrl;
  const found = teams.find(x => x.name === teamName(t));
  return found?.logoUrl ?? '';
};

/**
 * วันของนัด
 *
 * `date` คือ played_at ซึ่งมีค่าเฉพาะนัดที่บันทึกผลแล้ว นัดที่ตั้งตารางไว้เฉย ๆ
 * จะว่าง จึงต้องถอยไปใช้ scheduledTime ไม่งั้นคลิปเกือบทุกใบขึ้นว่า "ไม่ระบุวัน"
 */
const matchDate = (m: Match): string => m.date || m.scheduledTime || '';

const fmtDate = (v?: string): string => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
};

const LivePage: React.FC<Props> = ({ matches, teams, config, onBack, onOpenWall }) => {
  const [playing, setPlaying] = useState<Match | null>(null);
  const [search, setSearch] = useState('');

  /** กำลังถ่ายทอดสด = มีลิงก์สด และยังไม่มีผู้ชนะ */
  const live = useMemo(
    () => matches.filter(m => youTubeId(m.livestreamUrl) !== '' && !m.winner),
    [matches]);

  /**
   * คลิปย้อนหลัง — ใช้ highlightUrl ก่อน ถ้าไม่มีค่อยใช้ลิงก์สดของคู่ที่จบแล้ว
   *
   * ยังรองรับของเดิมที่เจ้าภาพเคยใส่ลิงก์สดไว้ก่อนจะมีช่องไฮไลต์แยก
   * ไม่งั้นคลิปที่เคยดูได้จะหายไปทั้งหมดในวันที่อัปเวอร์ชันนี้
   */
  const clips = useMemo(() => {
    const rows = matches
      .map(m => ({
        match: m,
        url: youTubeId(m.highlightUrl) !== '' ? m.highlightUrl!
           : (m.winner && youTubeId(m.livestreamUrl) !== '' ? m.livestreamUrl! : ''),
      }))
      .filter(r => r.url !== '')
      .sort((a, b) =>
        new Date(matchDate(b.match) || 0).getTime() - new Date(matchDate(a.match) || 0).getTime());

    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter(r =>
      (teamName(r.match.teamA) + teamName(r.match.teamB)
        + (r.match.highlightTitle ?? '') + (r.match.roundLabel ?? ''))
        .toLowerCase().includes(q));
  }, [matches, search]);

  // เปิดคลิปแล้วเลื่อนขึ้นไปหาเครื่องเล่น ไม่งั้นบนมือถือจะไม่รู้ว่ามีอะไรเปลี่ยน
  useEffect(() => {
    if (playing) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [playing]);

  const nowPlaying = playing
    ? { m: playing, url: playing.highlightUrl || playing.livestreamUrl, badge: 'ไฮไลต์' }
    : live[0]
      ? { m: live[0], url: live[0].livestreamUrl, badge: 'ถ่ายทอดสด' }
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-white/10 shrink-0"
            aria-label="กลับ">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-tight flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500 shrink-0" /> ถ่ายทอดสดและคลิปย้อนหลัง
            </p>
            <p className="text-[11px] text-slate-400 truncate">{config.competitionName}</p>
          </div>
          {onOpenWall && (
            <button onClick={onOpenWall}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold
                         flex items-center gap-1.5 shrink-0">
              <Tv className="w-4 h-4" /> <span className="hidden sm:inline">จอใหญ่</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-6">
        {/* เครื่องเล่นหลัก */}
        {nowPlaying ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5
                ${nowPlaying.badge === 'ถ่ายทอดสด'
                  ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
                {nowPlaying.badge === 'ถ่ายทอดสด' && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                )}
                {nowPlaying.badge}
              </span>
              {nowPlaying.m.roundLabel && (
                <span className="text-xs text-slate-400">{nowPlaying.m.roundLabel}</span>
              )}
            </div>

            {/* 16:9 เสมอ ไม่ว่าจอกว้างแค่ไหน — ปล่อยให้ iframe กำหนดเองแล้วจะเตี้ยผิดสัดส่วน */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-white/10"
              style={{ aspectRatio: '16 / 9' }}>
              <iframe
                key={nowPlaying.url}
                src={youTubeEmbed(nowPlaying.url, { autoplay: !!playing })}
                title={nowPlaying.m.highlightTitle
                  || `${teamName(nowPlaying.m.teamA)} พบ ${teamName(nowPlaying.m.teamB)}`}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-black text-lg sm:text-2xl leading-tight break-words">
                  {nowPlaying.m.highlightTitle
                    || `${teamName(nowPlaying.m.teamA)} พบ ${teamName(nowPlaying.m.teamB)}`}
                </h2>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  {fmtDate(matchDate(nowPlaying.m)) && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {fmtDate(matchDate(nowPlaying.m))}
                    </span>
                  )}
                  {nowPlaying.m.venue && <span>{nowPlaying.m.venue}</span>}
                </p>
              </div>
              <a href={youTubeWatch(nowPlaying.url)} target="_blank" rel="noreferrer"
                className="shrink-0 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold
                           flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> YouTube
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center">
            <Radio className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="font-black">ยังไม่มีการถ่ายทอดสดตอนนี้</p>
            <p className="text-sm text-slate-400 mt-1">
              เมื่อผู้จัดใส่ลิงก์ถ่ายทอดสดของคู่ไหน คู่นั้นจะขึ้นที่นี่ทันที
            </p>
          </div>
        )}

        {/* คู่อื่นที่ถ่ายทอดพร้อมกัน */}
        {live.length > 1 && (
          <div>
            <h3 className="font-black text-sm text-slate-300 mb-2 flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500" /> กำลังถ่ายทอดคู่อื่น ({live.length - 1})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {live.filter(m => m.id !== nowPlaying?.m.id).map(m => (
                <button key={m.id} onClick={() => setPlaying(m)}
                  className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]
                             hover:border-rose-500/60 transition text-left">
                  <div className="relative bg-black" style={{ aspectRatio: '16 / 9' }}>
                    {youTubeThumb(m.livestreamUrl)
                      ? <img src={youTubeThumb(m.livestreamUrl)} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-6 h-6 text-slate-700" />
                        </div>}
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-rose-600 text-[9px] font-black">
                      สด
                    </span>
                  </div>
                  <p className="p-2 text-xs font-bold leading-snug line-clamp-2">
                    {teamName(m.teamA)} พบ {teamName(m.teamB)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* คลังคลิปไฮไลต์ */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-black flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-400" /> คลิปย้อนหลัง
              <span className="text-sm font-bold text-slate-500">({clips.length})</span>
            </h3>
          </div>

          {clips.length > 6 && (
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อทีมหรือรอบการแข่งขัน"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/[0.06] border border-white/10
                           text-base outline-none focus:border-indigo-500" />
            </div>
          )}

          {clips.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <Film className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {search ? 'ไม่พบคลิปที่ค้นหา' : 'ยังไม่มีคลิปย้อนหลัง'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {clips.map(({ match: m, url }) => {
                const isOn = playing?.id === m.id;
                return (
                  <button key={m.id} onClick={() => setPlaying(m)}
                    className={`rounded-2xl overflow-hidden border bg-white/[0.04] text-left transition
                                ${isOn ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                                       : 'border-white/10 hover:border-white/30'}`}>
                    <div className="relative bg-black" style={{ aspectRatio: '16 / 9' }}>
                      {youTubeThumb(url)
                        ? <img src={youTubeThumb(url)} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-slate-700" />
                          </div>}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-5 h-5 text-slate-900 ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                      {m.roundLabel && (
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold">
                          {m.roundLabel}
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="font-bold text-sm leading-snug line-clamp-2">
                        {m.highlightTitle || `${teamName(m.teamA)} พบ ${teamName(m.teamB)}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {[m.teamA, m.teamB].map((t, i) => {
                          const logo = teamLogo(t, teams);
                          return logo
                            ? <img key={i} src={logo} alt="" className="w-5 h-5 rounded object-contain bg-white/10" />
                            : null;
                        })}
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-auto">
                          <Clock className="w-3 h-3" /> {fmtDate(matchDate(m)) || 'ไม่ระบุวัน'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivePage;
