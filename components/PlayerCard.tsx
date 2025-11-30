import React, { useRef, useState, useEffect } from 'react';
import { Player, Team } from '../types';
import { X, Download, RefreshCw, Share2, Shield, Loader2, MessageCircle } from 'lucide-react';
import { sharePlayerCardFlex } from '../services/liffService';

interface PlayerCardProps {
  player: Player;
  team: Team;
  onClose: () => void;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ player, team, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState({
    pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, ovr: 0
  });

  // Parse Team Colors
  const getColors = () => {
    try {
        const parsed = JSON.parse(team.color);
        if (Array.isArray(parsed)) return { primary: parsed[0], secondary: parsed[1] };
    } catch(e) {}
    return { primary: team.color, secondary: '#FFFFFF' };
  };
  const colors = getColors();

  // Randomize Stats on mount
  useEffect(() => {
    generateRandomStats();
  }, []);

  const generateRandomStats = () => {
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const pac = rand(70, 95);
    const sho = rand(60, 90);
    const pas = rand(65, 88);
    const dri = rand(70, 92);
    const def = rand(40, 80);
    const phy = rand(50, 85);
    const ovr = Math.floor((pac + sho + pas + dri + def + phy) / 6) + rand(2, 5); // Boost OVR slightly
    setStats({ pac, sho, pas, dri, def, phy, ovr });
  };

  const drawCard = async (): Promise<boolean> => {
    if (!canvasRef.current) return false;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return false;

    const width = 600;
    const height = 900;
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    // 1. Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1e293b'); // Slate-900
    gradient.addColorStop(0.5, colors.primary);
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Pattern Overlay (Subtle Lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    for(let i=0; i<width; i+=40) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i-200, height);
        ctx.stroke();
    }

    // 3. Card Frame (Gold/Premium Look)
    ctx.strokeStyle = '#fbbf24'; // Amber-400
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(32, 32, width - 64, height - 64);

    // 4. Player Photo
    if (player.photoUrl) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = player.photoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
            // Draw image centered and cropped slightly
            const imgRatio = img.width / img.height;
            // Target drawing area
            const drawWidth = 400;
            // const drawHeight = 400 / imgRatio;
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(100, 180, 400, 400); // Clip area
            ctx.clip();
            // Simple center crop logic
            ctx.drawImage(img, 100, 180, 400, 400 / imgRatio);
            ctx.restore();
        } catch (e) {
            console.error("Failed to load player image for canvas", e);
            // Fallback placeholder
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(300, 350, 120, 0, Math.PI*2);
            ctx.fill();
        }
    } else {
        // Fallback Icon
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(300, 350, 120, 0, Math.PI*2);
        ctx.fill();
    }

    // 5. Text Content
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';

    // OVR & POS (Top Left)
    ctx.textAlign = 'left';
    ctx.font = 'bold 90px Kanit, sans-serif';
    ctx.fillText(stats.ovr.toString(), 60, 130);
    ctx.font = 'bold 40px Kanit, sans-serif';
    ctx.fillText(player.position.substring(0,3).toUpperCase(), 65, 170);

    // Team Logo (Top Right)
    if (team.logoUrl) {
        try {
            const logo = new Image();
            logo.crossOrigin = 'anonymous';
            logo.src = team.logoUrl;
            await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; });
            ctx.drawImage(logo, 450, 50, 100, 100);
        } catch(e) {}
    }

    // Name
    ctx.textAlign = 'center';
    ctx.font = 'bold 60px Kanit, sans-serif';
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
    ctx.fillText(player.name, width / 2, 620);
    ctx.shadowBlur = 0;

    // Team Name
    ctx.font = '30px Kanit, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(team.name, width / 2, 660);

    // Divider
    ctx.beginPath();
    ctx.moveTo(100, 690);
    ctx.lineTo(500, 690);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Stats Grid
    ctx.font = 'bold 36px Kanit, sans-serif';
    const labels = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
    const values = [stats.pac, stats.sho, stats.pas, stats.dri, stats.def, stats.phy];
    
    // Left Column
    ctx.textAlign = 'left';
    for(let i=0; i<3; i++) {
        const y = 750 + (i * 50);
        ctx.fillStyle = '#fbbf24'; 
        ctx.fillText(values[i].toString(), 140, y);
        ctx.fillStyle = '#ffffff'; 
        ctx.fillText(labels[i], 210, y);
    }
    // Right Column
    for(let i=3; i<6; i++) {
        const y = 750 + ((i-3) * 50);
        ctx.fillStyle = '#fbbf24'; 
        ctx.fillText(values[i].toString(), 340, y);
        ctx.fillStyle = '#ffffff'; 
        ctx.fillText(labels[i], 410, y);
    }

    // Footer
    ctx.font = '20px Kanit, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('Penalty Pro Recorder Official Card', width/2, 860);

    return true;
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    await drawCard();
    
    if (canvasRef.current) {
        const link = document.createElement('a');
        link.download = `PlayerCard_${player.name.replace(/\s+/g, '_')}.jpg`;
        link.href = canvasRef.current.toDataURL('image/jpeg', 0.9);
        link.click();
    }
    setIsGenerating(false);
  };

  const handleShare = async () => {
    setIsGenerating(true);
    await drawCard();

    if (canvasRef.current) {
        canvasRef.current.toBlob(async (blob) => {
            if (!blob) {
                setIsGenerating(false);
                return;
            }
            const file = new File([blob], `card_${player.id}.jpg`, { type: 'image/jpeg' });
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `${player.name} - Player Card`,
                        text: `Check out ${player.name} from ${team.name}!`,
                        files: [file]
                    });
                } catch (err) {
                    console.log('Share cancelled or failed', err);
                }
            } else {
                alert("อุปกรณ์นี้ไม่รองรับการแชร์โดยตรง กรุณาใช้ปุ่มบันทึกรูปภาพแทน");
            }
            setIsGenerating(false);
        }, 'image/jpeg', 0.9);
    } else {
        setIsGenerating(false);
    }
  };

  const handleShareLineFlex = () => {
      sharePlayerCardFlex(player, team, stats);
  };

  return (
    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in duration-200">
        <div className="relative w-full max-w-sm">
            <button onClick={onClose} className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"><X className="w-8 h-8"/></button>
            
            {/* Card Preview (HTML Representation) */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[2rem] p-6 border-4 border-yellow-500 shadow-[0_0_40px_rgba(251,191,36,0.3)] relative overflow-hidden text-white aspect-[2/3] flex flex-col select-none">
                {/* Team Color Glow */}
                <div className="absolute top-0 left-0 w-full h-full opacity-30 bg-gradient-to-b from-transparent to-black pointer-events-none" style={{background: `linear-gradient(135deg, ${colors.primary} 0%, transparent 60%)`}}></div>
                
                {/* Top Section */}
                <div className="flex justify-between items-start relative z-10">
                    <div className="flex flex-col items-center">
                        <span className="text-5xl font-black text-yellow-400 drop-shadow-md">{stats.ovr}</span>
                        <span className="text-lg font-bold uppercase tracking-wider">{player.position.substring(0,3)}</span>
                        {/* Divider */}
                        <div className="w-8 h-0.5 bg-white/20 my-2"></div>
                        {team.logoUrl && <img src={team.logoUrl} className="w-10 h-10 object-contain" />}
                    </div>
                    {/* Placeholder for Dynamic Image - In real Canvas this is drawn */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-gradient-to-t from-black/50 to-transparent z-0"></div>
                </div>

                {/* Player Image Area */}
                <div className="flex-1 flex items-center justify-center relative z-10 -mt-4">
                    {player.photoUrl ? (
                        <img src={player.photoUrl} className="h-56 object-cover drop-shadow-2xl" />
                    ) : (
                        <Shield className="w-40 h-40 text-white/20" />
                    )}
                </div>

                {/* Info Section */}
                <div className="relative z-10 text-center mt-2">
                    <h2 className="text-3xl font-black uppercase truncate leading-none drop-shadow-lg mb-1">{player.name}</h2>
                    <p className="text-sm text-slate-300 font-bold uppercase tracking-widest mb-4">{team.name}</p>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-lg font-bold px-4">
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.pac}</span> <span className="text-slate-400 text-sm mt-1">PAC</span></div>
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.dri}</span> <span className="text-slate-400 text-sm mt-1">DRI</span></div>
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.sho}</span> <span className="text-slate-400 text-sm mt-1">SHO</span></div>
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.def}</span> <span className="text-slate-400 text-sm mt-1">DEF</span></div>
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.pas}</span> <span className="text-slate-400 text-sm mt-1">PAS</span></div>
                        <div className="flex justify-between"><span className="text-yellow-400">{stats.phy}</span> <span className="text-slate-400 text-sm mt-1">PHY</span></div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-6 grid grid-cols-5 gap-3">
                <button onClick={generateRandomStats} className="col-span-1 p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur transition flex items-center justify-center"><RefreshCw className="w-6 h-6"/></button>
                <button onClick={handleDownload} disabled={isGenerating} className="col-span-2 py-3 bg-white hover:bg-slate-200 text-slate-900 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95">
                     <Download className="w-5 h-5"/> บันทึกรูป
                </button>
                <button onClick={handleShareLineFlex} disabled={isGenerating} className="col-span-2 py-3 bg-[#00B900] hover:bg-[#009900] text-white rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95">
                    <MessageCircle className="w-5 h-5"/> แชร์ LINE
                </button>
            </div>
            
            {/* Hidden Canvas for Export */}
            <canvas ref={canvasRef} className="hidden"></canvas>
        </div>
    </div>
  );
};

export default PlayerCard;