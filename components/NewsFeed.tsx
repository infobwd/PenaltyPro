

import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types';
import { Calendar, Bell, X, FileText, Download, Share2, Globe } from 'lucide-react';
import { shareNews } from '../services/liffService';

interface NewsFeedProps {
  news: NewsItem[];
  isLoading?: boolean;
  initialNewsId?: string | null;
  currentTournamentId?: string | null;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ news, isLoading, initialNewsId, currentTournamentId }) => {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  useEffect(() => {
    if (initialNewsId && news.length > 0) {
        const item = news.find(n => n.id === initialNewsId);
        if (item) setSelectedNews(item);
    }
  }, [initialNewsId, news]);

  const handleShare = (e: React.MouseEvent, item: NewsItem) => {
      e.stopPropagation();
      shareNews(item);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-2 mb-4 px-2">
           <div className="w-5 h-5 bg-slate-200 rounded-full animate-pulse" />
           <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {[1, 2].map((i) => (
             <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-80 flex flex-col">
                <div className="h-48 bg-slate-200 animate-pulse" />
                <div className="p-5 flex-1 space-y-3">
                   <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse" />
                   <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse" />
                   <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                </div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  // Filter News: Show Global (no tournamentId or 'global') OR Current Tournament
  const filteredNews = news.filter(item => {
      if (!item.tournamentId || item.tournamentId === 'global') return true;
      if (currentTournamentId && item.tournamentId === currentTournamentId) return true;
      return false;
  });

  if (filteredNews.length === 0) return (
      <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          ยังไม่มีข่าวสารในขณะนี้
      </div>
  );

  const sortedNews = [...filteredNews].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="w-full max-w-4xl mx-auto mb-8 animate-in slide-in-from-bottom-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {sortedNews.map(item => (
               <div 
                  key={item.id} 
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition group cursor-pointer relative"
                  onClick={() => setSelectedNews(item)}
               >
                   {(!item.tournamentId || item.tournamentId === 'global') && (
                       <div className="absolute top-2 right-2 z-10 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                           <Globe className="w-3 h-3" /> Global
                       </div>
                   )}
                   {item.imageUrl && (
                       <div className="h-48 overflow-hidden bg-slate-100 relative">
                           <img 
                              src={item.imageUrl} 
                              alt={item.title} 
                              className="w-full h-full object-cover transition group-hover:scale-105 duration-500" 
                           />
                       </div>
                   )}
                   <div className="p-5">
                       <div className="flex justify-between items-start mb-2">
                           <div className="flex items-center gap-2 text-xs text-slate-400">
                               <Calendar className="w-3 h-3" />
                               {new Date(item.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                           </div>
                           <button onClick={(e) => handleShare(e, item)} className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50"><Share2 className="w-4 h-4" /></button>
                       </div>
                       <h4 className="font-bold text-slate-800 text-lg mb-2 line-clamp-2 group-hover:text-indigo-600 transition">{item.title}</h4>
                       <p className="text-slate-600 text-sm line-clamp-3 whitespace-pre-line">{item.content}</p>
                       {item.documentUrl && (
                           <div className="mt-3 flex items-center gap-1 text-xs text-indigo-600 font-medium">
                               <FileText className="w-3 h-3" /> มีเอกสารแนบ
                           </div>
                       )}
                   </div>
               </div>
           ))}
        </div>
      </div>

      {selectedNews && (
        <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 my-8">
                <div className="relative">
                    {selectedNews.imageUrl && (
                        <img src={selectedNews.imageUrl} className="w-full max-h-64 object-cover" />
                    )}
                    <button 
                        onClick={() => setSelectedNews(null)}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-md transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 md:p-8">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Calendar className="w-4 h-4" />
                            {new Date(selectedNews.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <button onClick={(e) => handleShare(e, selectedNews)} className="flex items-center gap-1 text-indigo-600 font-bold text-sm hover:bg-indigo-50 px-3 py-1 rounded-lg"><Share2 className="w-4 h-4" /> แชร์</button>
                    </div>
                    
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-6 leading-tight">
                        {selectedNews.title}
                    </h2>
                    
                    <div className="prose prose-slate max-w-none text-slate-600 whitespace-pre-line mb-8">
                        {selectedNews.content}
                    </div>

                    {selectedNews.documentUrl && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between gap-4 hover:bg-indigo-100 transition">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-100 p-2 rounded-lg">
                                    <FileText className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-indigo-900 text-sm">เอกสารแนบ</p>
                                    <p className="text-xs text-indigo-600">คลิกเพื่อดาวน์โหลดหรือเปิดดู</p>
                                </div>
                            </div>
                            <a 
                                href={selectedNews.documentUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                download
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-bold text-sm shadow-sm"
                            >
                                <Download className="w-4 h-4" /> ดาวน์โหลด
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default NewsFeed;
