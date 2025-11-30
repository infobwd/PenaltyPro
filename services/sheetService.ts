


import { Team, Player, MatchState, RegistrationData, AppSettings, School, NewsItem, Kick, UserProfile, Tournament, MatchEvent, Donation } from '../types';

const API_URL = "https://script.google.com/macros/s/AKfycbztQtSLYW3wE5j-g2g7OMDxKL6WFuyUymbGikt990wn4gCpwQN_MztGCcBQJgteZQmvyg/exec";

export const getStoredScriptUrl = (): string | null => {
  return API_URL;
};

export const setStoredScriptUrl = (url: string) => {
  console.warn("URL is hardcoded in this version. Setting ignored.");
};

export const fetchDatabase = async (): Promise<{ teams: Team[], players: Player[], matches: any[], config: AppSettings, schools: School[], news: NewsItem[], tournaments: Tournament[], donations: Donation[] } | null> => {
  try {
    const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Network response was not ok`);
    const text = await response.text();
    // Validate JSON
    try {
        var data = JSON.parse(text);
    } catch(e) {
        throw new Error("Invalid JSON response from server: " + text.substring(0, 100));
    }
    
    if (data && data.status === 'error') throw new Error(data.message);
    
    const configData = (data && data.config) ? data.config : {};

    return {
        teams: (data && data.teams) || [],
        players: (data && data.players) || [],
        matches: (data && data.matches) || [],
        config: { ...configData, adminPin: configData.adminPin || '1234' },
        schools: (data && data.schools) || [],
        news: (data && data.news) || [],
        tournaments: (data && data.tournaments) || [],
        donations: (data && data.donations) || []
    };
  } catch (error) {
    console.error("Failed to fetch:", error);
    throw error;
  }
};

// --- USER MANAGEMENT ---
export const fetchUsers = async (): Promise<UserProfile[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getUsers&t=${Date.now()}`, { method: 'GET', redirect: 'follow' });
        if (!response.ok) return [];
        const data = await response.json();
        return data.users || [];
    } catch (e) {
        console.error("Fetch Users Failed", e);
        return [];
    }
}

export const updateUserRole = async (userId: string, role: string): Promise<boolean> => {
    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateUserRole', userId, role })
        });
        return true;
    } catch (e) { return false; }
}

// --- DONATIONS ---
export const verifyDonation = async (donationId: string, status: 'Verified' | 'Rejected'): Promise<boolean> => {
    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'verifyDonation', donationId, status })
        });
        return true;
    } catch (e) { return false; }
}

// --- TOURNAMENT ---
export const createTournament = async (name: string, type: string): Promise<string | null> => {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createTournament', name, type })
        });
        
        if (response.ok) {
            const result = await response.json();
            return result.tournamentId;
        }
        return null;
    } catch (error) { return null; }
};

export const updateTournament = async (tournament: Tournament): Promise<boolean> => {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateTournament', tournament })
        });
        if (response.ok) {
            const result = await response.json();
            return result.status === 'success';
        }
        return false;
    } catch (error) { return false; }
};

// --- AUTH & AI ---
export const authenticateUser = async (data: any): Promise<UserProfile | null> => {
    const payload = { action: 'auth', ...data };
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
            return {
                userId: result.userId,
                username: result.username,
                displayName: result.displayName,
                pictureUrl: result.pictureUrl,
                type: data.authType === 'line' ? 'line' : 'credentials',
                phoneNumber: result.phoneNumber,
                role: result.role,
                lineUserId: result.lineUserId
            };
        }
        throw new Error("Network response was not ok");
    } catch (error: any) { throw error; }
};

export const generateGeminiContent = async (prompt: string, initialModel: string = 'gemini-1.5-flash'): Promise<string> => {
    return "AI Response Placeholder"; 
};

// --- DATA MANAGEMENT ---
export const registerTeam = async (data: RegistrationData, tournamentId: string = 'default', creatorId: string = ''): Promise<string | null> => {
  const payload = {
    action: 'register',
    schoolName: data.schoolName, 
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
    registrationTime: data.registrationTime, 
    tournamentId,
    creatorId,
    lineUserId: data.lineUserId, // Pass Line User ID
    players: data.players.map(p => ({
        name: p.name,
        number: p.sequence, 
        position: 'Player',
        birthDate: p.birthDate,
        photoFile: p.photoFile
    }))
  };
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
        const result = await response.json();
        if (result.status === 'error') {
            throw new Error(result.message);
        }
        return result.teamId || null;
    }
    return null;
  } catch (error: any) { 
      console.error(error);
      throw error; 
  }
};

export const updateMyTeam = async (team: Partial<Team>, players: Partial<Player>[], userId: string) => {
    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateTeamData', team, players, requestUserId: userId }) 
        });
        return true;
    } catch (error) { return false; }
};

export const updateTeamData = async (team: Partial<Team>, players: Partial<Player>[]) => {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateTeamData', team, players })
    });
    return true;
  } catch (error) { return false; }
};

export const updateTeamStatus = async (teamId: string, status: string, group?: string, reason?: string) => {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateStatus', teamId, status, group, reason })
    });
    return true;
  } catch (error) { return false; }
};

export const saveMatchToSheet = async (matchState: any, summary: string, skipKicks: boolean = false, tournamentId: string = 'default') => {
  // Ensure we inject matchId into kicks if they are missing it
  const kicksPayload = (matchState.kicks || []).map((k: any) => ({
      ...k,
      matchId: k.matchId || matchState.matchId || matchState.id,
      tournamentId: k.tournamentId || tournamentId
  }));

  const payload = {
    action: 'saveMatch',
    matchId: matchState.matchId || matchState.id,
    teamA: typeof matchState.teamA === 'string' ? matchState.teamA : matchState.teamA.name,
    teamB: typeof matchState.teamB === 'string' ? matchState.teamB : matchState.teamB.name,
    scoreA: matchState.scoreA,
    scoreB: matchState.scoreB,
    winner: matchState.winner,
    status: matchState.isFinished ? 'Finished' : 'Live',
    summary: summary,
    kicks: skipKicks ? [] : kicksPayload,
    roundLabel: matchState.roundLabel,
    tournamentId: tournamentId,
    livestreamUrl: matchState.livestreamUrl,
    livestreamCover: matchState.livestreamCover
  };

  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error("Error saving match:", error);
    return false;
  }
};

export const saveMatchEventsToSheet = async (events: MatchEvent[]) => {
    if (!events || events.length === 0) return true;
    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'saveMatchEvents', events: events })
        });
        return true;
    } catch (error) { return false; }
}

export const manageNews = async (actionType: 'add' | 'delete' | 'edit', newsItem: Partial<NewsItem>) => {
    try {
      await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'manageNews', subAction: actionType, newsItem })
      });
      return true;
    } catch (error) { return false; }
};

export const saveSettings = async (settings: AppSettings) => {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveSettings', settings })
    });
    return true;
  } catch (error) { return false; }
};

export const scheduleMatch = async (matchId: string, teamA: string, teamB: string, roundLabel: string, venue?: string, scheduledTime?: string, livestreamUrl?: string, livestreamCover?: string, tournamentId: string = 'default') => {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'scheduleMatch', matchId, teamA, teamB, roundLabel, venue, scheduledTime, livestreamUrl, livestreamCover, tournamentId })
    });
    return true;
  } catch (error) { return false; }
};

export const deleteMatch = async (matchId: string) => {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteMatch', matchId })
    });
    return true;
  } catch (error) { return false; }
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};