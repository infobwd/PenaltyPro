
import React from 'react';
import { Kick, KickResult, Team } from '../types';
import { CheckCircle2, XCircle, Circle, ShieldAlert } from 'lucide-react';

interface ScoreVisualizerProps {
  kicks: Kick[];
  teamId: 'A' | 'B';
  team: Team;
}

const ScoreVisualizer: React.FC<ScoreVisualizerProps> = ({ kicks, teamId, team }) => {
  // Filter kicks for this team
  const teamKicks = kicks.filter(k => k.teamId === teamId);
  
  // We want to display at least 5 placeholders, or more if sudden death
  const totalSlots = Math.max(5, teamKicks.length + (teamKicks.length >= 5 ? 1 : 0));
  const slots = Array.from({ length: totalSlots });

  return (
    <div className="flex flex-col items-center space-y-2 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-100 w-full overflow-hidden">
      <div 
        className="flex items-center gap-2 text-white px-4 py-1.5 rounded-full mb-2 shadow-sm max-w-full"
        style={{ backgroundColor: team.color }}
      >
        {team.logoUrl && <img src={team.logoUrl} alt="" className="w-6 h-6 bg-white rounded-full p-0.5 object-cover" />}
        <h3 className="font-bold text-lg line-clamp-1 truncate">{team.name}</h3>
      </div>
      
      {/* Scrollable Container */}
      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex space-x-2 p-2 min-w-max justify-start md:justify-center">
            {slots.map((_, index) => {
            const kick = teamKicks[index];
            
            if (!kick) {
                return (
                <div key={index} className="flex flex-col items-center space-y-1 min-w-[32px] shrink-0">
                    <Circle className="w-7 h-7 md:w-8 md:h-8 text-gray-200 fill-gray-50" />
                    <span className="text-[10px] md:text-xs text-gray-400 font-mono">{index + 1}</span>
                </div>
                );
            }

            let icon;
            let color;

            switch (kick.result) {
                case KickResult.GOAL:
                icon = <CheckCircle2 className="w-7 h-7 md:w-8 md:h-8 text-green-500 fill-green-50" />;
                color = 'text-green-600';
                break;
                case KickResult.SAVED:
                icon = <ShieldAlert className="w-7 h-7 md:w-8 md:h-8 text-orange-500 fill-orange-50" />;
                color = 'text-orange-600';
                break;
                case KickResult.MISSED:
                icon = <XCircle className="w-7 h-7 md:w-8 md:h-8 text-red-500 fill-red-50" />;
                color = 'text-red-600';
                break;
                default:
                icon = <Circle className="w-7 h-7 md:w-8 md:h-8 text-gray-300" />;
                color = 'text-gray-300';
            }

            return (
                <div key={kick.id} className="flex flex-col items-center space-y-1 animate-in zoom-in duration-300 min-w-[32px] shrink-0">
                {icon}
                <span className={`text-[10px] md:text-xs font-mono font-bold ${color}`}>{index + 1}</span>
                </div>
            );
            })}
        </div>
      </div>
    </div>
  );
};

export default ScoreVisualizer;