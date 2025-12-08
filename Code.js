
// ==========================================
// COPY THIS CODE TO YOUR GOOGLE APPS SCRIPT (Code.gs)
// ==========================================

// --- CONFIGURATION ---
const FOLDER_NAME = "PenaltyPro_Uploads"; 

// --- MAIN WEB APP HANDLERS ---

function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'getUsers') {
      return getUsers();
    } else if (action === 'getData') {
      return getData();
    } else if (action === 'getContests') {
      return getContests();
    } else if (action === 'getComments') {
      return getComments(e.parameter.entryId);
    } else if (action === 'getSponsors') {
      return getSponsors();
    } else if (action === 'getMusicTracks') {
      return getMusicTracks();
    } else if (action === 'getTickerMessages') {
      return getTickerMessages();
    }
    
    return successResponse({ status: 'running', message: 'Penalty Pro API is active' });

  } catch (error) {
    return errorResponse(error.toString());
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'register') return registerTeam(data);
    else if (action === 'updateStatus') return updateTeamStatus(data.teamId, data.status, data.group, data.reason);
    else if (action === 'updateTeamData') return updateTeamData(data.team, data.players);
    else if (action === 'saveMatch') return saveMatch(data);
    else if (action === 'saveKicks') return saveKicks(data.data);
    else if (action === 'saveMatchEvents') return saveMatchEvents(data.events);
    else if (action === 'saveSettings') return saveSettings(data.settings);
    else if (action === 'manageNews') return manageNews(data);
    else if (action === 'scheduleMatch') return scheduleMatch(data);
    else if (action === 'deleteMatch') return deleteMatch(data.matchId);
    else if (action === 'auth') return handleAuth(data);
    else if (action === 'createTournament') return createTournament(data.name, data.type);
    else if (action === 'updateTournament') return updateTournament(data.tournament);
    else if (action === 'submitDonation') return submitDonation(data);
    else if (action === 'verifyDonation') return verifyDonation(data.donationId, data.status);
    else if (action === 'updateDonationDetails') return updateDonationDetails(data);
    else if (action === 'updateUserRole') return updateUserRole(data.userId, data.role);
    else if (action === 'deleteTeam') return deleteTeam(data.teamId);
    // User CRUD
    else if (action === 'createUser') return createUser(data);
    else if (action === 'updateUserDetails') return updateUserDetails(data);
    else if (action === 'deleteUser') return deleteUser(data.userId);
    // Contest Logic
    else if (action === 'submitContestEntry') return submitContestEntry(data);
    else if (action === 'toggleEntryLike') return toggleEntryLike(data.entryId, data.userId);
    else if (action === 'manageContest') return manageContest(data);
    else if (action === 'deleteContestEntry') return deleteContestEntry(data.entryId, data.userId);
    else if (action === 'submitContestComment') return submitContestComment(data);
    else if (action === 'incrementShareCount') return incrementShareCount(data.entryId);
    // Prediction Logic
    else if (action === 'submitPrediction') return submitPrediction(data);
    // Sponsor Logic
    else if (action === 'manageSponsor') return manageSponsor(data);
    // Music Logic
    else if (action === 'manageMusicTrack') return manageMusicTrack(data);
    // Ticker Logic
    else if (action === 'manageTickerMessage') return manageTickerMessage(data);
    
    return errorResponse("Unknown action: " + action);
    
  } catch (error) {
    return errorResponse(error.toString());
  }
}

// --- CORE FUNCTIONS ---

function getUsers() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  if (!sheet) return successResponse({ users: [] });
  
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[0]) {
      users.push({
        userId: String(r[0]),
        username: r[1],
        displayName: r[3],
        role: r[4] || 'user',
        phoneNumber: r[5],
        pictureUrl: r[6],
        lineUserId: r[7] || '',
        lastLogin: r[8] ? new Date(r[8]).toISOString() : ''
      });
    }
  }
  return successResponse({ users: users });
}

function getData() {
  const ss = getSpreadsheet();
  if(!ss.getSheetByName("Tournaments")) { const s = ss.insertSheet("Tournaments"); s.appendRow(["ID", "Name", "Type", "Status", "ConfigJSON"]); s.appendRow(["default", "Default Tournament", "Penalty", "Active", "{}"]); }
  if(!ss.getSheetByName("Teams")) { const s = ss.insertSheet("Teams"); s.appendRow(["ID", "Name", "ShortName", "Color", "LogoUrl", "Status", "Group", "District", "Province", "Director", "Manager", "ManagerPhone", "Coach", "CoachPhone", "DocUrl", "SlipUrl", "RejectReason", "RegistrationTime", "TournamentID", "CreatorID", "LineUserID"]); }
  if(!ss.getSheetByName("Players")) { const s = ss.insertSheet("Players"); s.appendRow(["ID", "TeamID", "Name", "Number", "Position", "PhotoUrl", "BirthDate", "TournamentID"]); }
  if(!ss.getSheetByName("Matches")) { const s = ss.insertSheet("Matches"); s.appendRow(["MatchID","TeamA","TeamB","ScoreA","ScoreB","Winner","Date","Summary","Round","Status","Venue","ScheduledTime","LiveURL","LiveCover","TournamentID"]); }
  if(!ss.getSheetByName("Kicks")) { const s = ss.insertSheet("Kicks"); s.appendRow(["MatchID", "Round", "Team", "Player", "Result", "Timestamp", "TournamentID"]); }
  if(!ss.getSheetByName("Donations")) { const s = ss.insertSheet("Donations"); s.appendRow(["ID", "Timestamp", "DonorName", "Amount", "Phone", "IsEDonation", "TaxID", "Address", "SlipURL", "TournamentID", "LineUserID", "Status", "IsAnonymous", "TaxFileURL"]); }
  if(!ss.getSheetByName("News")) { const s = ss.insertSheet("News"); s.appendRow(["ID", "Title", "Content", "ImageURL", "Timestamp", "DocURL", "TournamentID"]); }
  if(!ss.getSheetByName("Schools")) { const s = ss.insertSheet("Schools"); s.appendRow(["ID", "Name", "District", "Province"]); }
  if(!ss.getSheetByName("Predictions")) { const s = ss.insertSheet("Predictions"); s.appendRow(["ID", "MatchID", "UserID", "UserDisplayName", "UserPic", "Prediction", "Timestamp", "TournamentID"]); }
  
  let configSheet = ss.getSheetByName("Config"); let config = {};
  if (configSheet) { 
    const data = configSheet.getDataRange().getValues(); 
    if (data.length > 1) { 
      const r = data[1]; 
      config = { 
        competitionName: r[0], competitionLogo: toLh3Link(r[1]), bankName: r[2], bankAccount: r[3], accountName: r[4], locationName: r[5], locationLink: r[6], announcement: r[7], adminPin: String(r[8] || '1234'), locationLat: r[9] || 0, locationLng: r[10] || 0, registrationFee: r[11] || 0, fundraisingGoal: r[12] || 0, objectiveTitle: r[13] || '', objectiveDescription: r[14] || '', objectiveImageUrl: toLh3Link(r[15] || ''), liffId: r[16] || '', pwaStartUrl: r[17] || '', pwaScope: r[18] || '',
        coffeeSupportPhone: r[19] || '0836645989',
        educationSupportQrUrl: toLh3Link(r[20] || ''),
        educationSupportAccountName: r[21] || '',
        educationSupportBankName: r[22] || '',
        educationSupportAccountNumber: r[23] || ''
      }; 
    } 
  }

  const read = (name) => { const s = ss.getSheetByName(name); return s ? s.getDataRange().getValues() : []; };
  
  const tourneyData = read("Tournaments"); const tournaments = []; for(let i=1; i<tourneyData.length; i++) if(tourneyData[i][0]) tournaments.push({ id: String(tourneyData[i][0]), name: tourneyData[i][1], type: tourneyData[i][2], status: tourneyData[i][3], config: tourneyData[i][4] });
  const teamsData = read("Teams"); const teams = []; for(let i=1; i<teamsData.length; i++) if(teamsData[i][0]) teams.push({ id: String(teamsData[i][0]), name: teamsData[i][1], shortName: teamsData[i][2], color: teamsData[i][3], logoUrl: toLh3Link(teamsData[i][4]), status: teamsData[i][5] || 'Pending', group: teamsData[i][6] || '', district: teamsData[i][7], province: teamsData[i][8], directorName: teamsData[i][9], managerName: teamsData[i][10], managerPhone: String(teamsData[i][11]).replace(/^'/, ''), coachName: teamsData[i][12], coachPhone: String(teamsData[i][13]).replace(/^'/, ''), docUrl: teamsData[i][14], slipUrl: toLh3Link(teamsData[i][15]), rejectReason: teamsData[i][16], registrationTime: teamsData[i][17], tournamentId: teamsData[i][18] || 'default', creatorId: String(teamsData[i][19] || '') });
  const playersData = read("Players"); const players = []; for(let i=1; i<playersData.length; i++) if(playersData[i][0]) players.push({ id: String(playersData[i][0]), teamId: String(playersData[i][1]), name: playersData[i][2], number: String(playersData[i][3]).replace(/^'/, ''), position: playersData[i][4], photoUrl: toLh3Link(playersData[i][5]), birthDate: playersData[i][6] ? formatDate(playersData[i][6]) : '', tournamentId: playersData[i][7] || 'default' });
  const matchesData = read("Matches"); const kicksData = read("Kicks"); const allKicks = []; for(let i=1; i<kicksData.length; i++) if(kicksData[i][0]) allKicks.push({ matchId: String(kicksData[i][0]), round: kicksData[i][1], teamId: kicksData[i][2], player: kicksData[i][3], result: kicksData[i][4], timestamp: kicksData[i][5], tournamentId: kicksData[i][6] || 'default' });
  const matches = []; for(let i=1; i<matchesData.length; i++) if(matchesData[i][0]) { const mid = String(matchesData[i][0]); matches.push({ id: mid, teamA: matchesData[i][1], teamB: matchesData[i][2], scoreA: matchesData[i][3], scoreB: matchesData[i][4], winner: matchesData[i][5], date: matchesData[i][6], summary: matchesData[i][7], roundLabel: matchesData[i][8] || '', status: matchesData[i][9] || 'Finished', venue: matchesData[i][10] || '', scheduledTime: matchesData[i][11] || '', livestreamUrl: matchesData[i][12] || '', livestreamCover: toLh3Link(matchesData[i][13]), tournamentId: matchesData[i][14] || 'default', kicks: allKicks.filter(k => k.matchId === mid) }); }
  const donationData = read("Donations"); const donations = []; for(let i=1; i<donationData.length; i++) if(donationData[i][0]) donations.push({ id: String(donationData[i][0]), timestamp: donationData[i][1], donorName: donationData[i][2], amount: Number(donationData[i][3]), phone: String(donationData[i][4]).replace(/^'/, ''), isEdonation: donationData[i][5], taxId: String(donationData[i][6]), address: String(donationData[i][7]), slipUrl: toLh3Link(donationData[i][8]), tournamentId: donationData[i][9], lineUserId: donationData[i][10], status: donationData[i][11] || 'Pending', isAnonymous: donationData[i][12] || false, taxFileUrl: toLh3Link(donationData[i][13]) });
  const newsData = read("News"); const news = []; for(let i=1; i<newsData.length; i++) if(newsData[i][0]) news.push({ id: String(newsData[i][0]), title: newsData[i][1], content: newsData[i][2], imageUrl: toLh3Link(newsData[i][3]), timestamp: Number(newsData[i][4]), documentUrl: newsData[i][5] || '', tournamentId: newsData[i][6] ? String(newsData[i][6]) : 'global' });
  const schoolData = read("Schools"); const schools = []; for(let i=1; i<schoolData.length; i++) if(schoolData[i][0]) schools.push({ id: String(schoolData[i][0]), name: schoolData[i][1], district: schoolData[i][2], province: schoolData[i][3] });
  const predictionData = read("Predictions"); const predictions = []; for(let i=1; i<predictionData.length; i++) if(predictionData[i][0]) predictions.push({ id: String(predictionData[i][0]), matchId: String(predictionData[i][1]), userId: String(predictionData[i][2]), userDisplayName: predictionData[i][3], userPictureUrl: predictionData[i][4], prediction: predictionData[i][5], timestamp: predictionData[i][6], tournamentId: predictionData[i][7] });

  return successResponse({ teams, players, matches, config, schools, news, tournaments, donations, predictions });
}

// ... CONTEST FUNCTIONS ...

function getContests() {
  const ss = getSpreadsheet();
  let cSheet = ss.getSheetByName("Contests");
  let eSheet = ss.getSheetByName("ContestEntries");
  let cmtSheet = ss.getSheetByName("ContestComments"); 
  
  if (!cSheet) { cSheet = ss.insertSheet("Contests"); cSheet.appendRow(["ID", "Title", "Description", "Status", "CreatedDate", "ClosingDate"]); }
  if (!eSheet) { eSheet = ss.insertSheet("ContestEntries"); eSheet.appendRow(["ID", "ContestID", "UserID", "UserDisplayName", "UserPic", "PhotoURL", "Caption", "LikeCount", "LikedByUsers", "Timestamp", "ShareCount"]); }

  // 1. Calculate Comment Counts
  const commentCounts = {};
  if (cmtSheet) {
     const cmtData = cmtSheet.getDataRange().getValues();
     for(let i=1; i<cmtData.length; i++) {
        const entryId = String(cmtData[i][1]); // EntryID is in Col B (Index 1)
        commentCounts[entryId] = (commentCounts[entryId] || 0) + 1;
     }
  }

  const contests = [];
  const cData = cSheet.getDataRange().getValues();
  for (let i = 1; i < cData.length; i++) {
    if (cData[i][0]) contests.push({ id: String(cData[i][0]), title: cData[i][1], description: cData[i][2], status: cData[i][3], createdDate: cData[i][4], closingDate: cData[i][5] });
  }

  const entries = [];
  const eData = eSheet.getDataRange().getValues();
  for (let i = 1; i < eData.length; i++) {
    if (eData[i][0]) {
      const entryId = String(eData[i][0]);
      const likedBy = String(eData[i][8] || '').split(',').filter(x => x);
      const shareCount = Number(eData[i][10] || 0); // Index 10 is ShareCount
      entries.push({
        id: entryId,
        contestId: String(eData[i][1]),
        userId: String(eData[i][2]),
        userDisplayName: eData[i][3],
        userPictureUrl: eData[i][4],
        photoUrl: toLh3Link(eData[i][5]),
        caption: eData[i][6],
        likeCount: Number(eData[i][7] || 0),
        likedBy: likedBy,
        timestamp: eData[i][9],
        commentCount: commentCounts[entryId] || 0,
        shareCount: shareCount
      });
    }
  }

  return successResponse({ contests, entries });
}

function incrementShareCount(entryId) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("ContestEntries");
  if (!sheet) return errorResponse("Sheet not found");
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(entryId)) {
      const currentShares = Number(data[i][10] || 0); 
      sheet.getRange(i + 1, 11).setValue(currentShares + 1);
      return successResponse({ status: 'success' });
    }
  }
  return errorResponse("Entry not found");
}

function submitContestEntry(data) {
  const ss = getSpreadsheet();
  let cSheet = ss.getSheetByName("Contests");
  let sheet = ss.getSheetByName("ContestEntries");
  if (!cSheet) return errorResponse("Contests sheet missing");
  if (!sheet) { sheet = ss.insertSheet("ContestEntries"); sheet.appendRow(["ID", "ContestID", "UserID", "UserDisplayName", "UserPic", "PhotoURL", "Caption", "LikeCount", "LikedByUsers", "Timestamp", "ShareCount"]); }
  
  const cData = cSheet.getDataRange().getValues();
  let contestOpen = false;
  let closingDate = null;
  for(let i=1; i<cData.length; i++){
      if(String(cData[i][0]) === String(data.contestId)){
          if(cData[i][3] === 'Open') contestOpen = true;
          if(cData[i][5]) closingDate = new Date(cData[i][5]);
          break;
      }
  }
  
  if(!contestOpen) return errorResponse("กิจกรรมนี้ปิดรับสมัครแล้ว (Status Closed)");
  if(closingDate && new Date() > closingDate) return errorResponse("หมดเวลาส่งภาพประกวดแล้ว");

  const rows = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(data.contestId) && String(rows[i][2]) === String(data.userId)) {
      count++;
    }
  }
  if (count >= 5) return errorResponse("คุณส่งภาพครบ 5 ภาพแล้วสำหรับกิจกรรมนี้");

  let photoUrl = data.photoUrl || ""; 
  if (data.photoFile && data.photoFile.startsWith("data:")) {
    photoUrl = saveFileToDrive(data.photoFile, `contest_${data.userId}_${Date.now()}`);
  }

  const id = "ENT_" + Date.now();
  sheet.appendRow([id, data.contestId, data.userId, data.userDisplayName, data.userPic, photoUrl, data.caption, 0, "", new Date().toISOString(), 0]);
  
  return successResponse({ status: 'success' });
}

function toggleEntryLike(entryId, userId) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("ContestEntries");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(entryId)) {
      let likedBy = String(data[i][8] || '').split(',').filter(x => x);
      let count = Number(data[i][7] || 0);
      
      if (likedBy.includes(userId)) {
        likedBy = likedBy.filter(id => id !== userId);
        count = Math.max(0, count - 1);
      } else {
        likedBy.push(userId);
        count++;
      }
      
      sheet.getRange(i + 1, 8).setValue(count);
      sheet.getRange(i + 1, 9).setValue(likedBy.join(','));
      return successResponse({ status: 'success', newCount: count, likedBy: likedBy });
    }
  }
  return errorResponse("Entry not found");
}

function manageContest(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Contests");
  if (!sheet) { sheet = ss.insertSheet("Contests"); sheet.appendRow(["ID", "Title", "Description", "Status", "CreatedDate", "ClosingDate"]); }
  
  if (data.subAction === 'create') {
    const id = "CON_" + Date.now();
    sheet.appendRow([id, data.title, data.description, "Open", new Date().toISOString(), data.closingDate || '']);
  } else if (data.subAction === 'edit') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.contestId)) {
        if(data.title !== undefined) sheet.getRange(i + 1, 2).setValue(data.title);
        if(data.description !== undefined) sheet.getRange(i + 1, 3).setValue(data.description);
        if(data.closingDate !== undefined) sheet.getRange(i + 1, 6).setValue(data.closingDate);
        break;
      }
    }
  } else if (data.subAction === 'updateStatus') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.contestId)) {
        sheet.getRange(i + 1, 4).setValue(data.status); 
        break;
      }
    }
  }
  return successResponse({ status: 'success' });
}

function deleteContestEntry(entryId, userId) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("ContestEntries");
  if (!sheet) return errorResponse("Sheet not found");
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(entryId)) {
      if (String(data[i][2]) === String(userId)) {
         sheet.deleteRow(i + 1);
         return successResponse({ status: 'success' });
      } else {
         return errorResponse("Permission denied");
      }
    }
  }
  return errorResponse("Entry not found");
}

function getComments(entryId) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("ContestComments");
  if (!sheet) {
    sheet = ss.insertSheet("ContestComments");
    sheet.appendRow(["ID", "EntryID", "UserID", "UserDisplayName", "UserPic", "Message", "Timestamp"]);
    return successResponse({ comments: [] });
  }
  
  const data = sheet.getDataRange().getValues();
  const comments = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(entryId)) {
      comments.push({
        id: String(data[i][0]),
        entryId: String(data[i][1]),
        userId: String(data[i][2]),
        userDisplayName: data[i][3],
        userPictureUrl: data[i][4],
        message: data[i][5],
        timestamp: data[i][6]
      });
    }
  }
  return successResponse({ comments });
}

function submitContestComment(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("ContestComments");
  if (!sheet) {
    sheet = ss.insertSheet("ContestComments");
    sheet.appendRow(["ID", "EntryID", "UserID", "UserDisplayName", "UserPic", "Message", "Timestamp"]);
  }
  
  const id = "CMT_" + Date.now();
  sheet.appendRow([
    id,
    data.entryId,
    data.userId,
    data.userDisplayName,
    data.userPic,
    data.message,
    new Date().toISOString()
  ]);
  
  return successResponse({ status: 'success', id });
}

// ... SPONSOR FUNCTIONS ...

function getSponsors() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Sponsors");
  if (!sheet) {
    sheet = ss.insertSheet("Sponsors");
    sheet.appendRow(["ID", "Name", "LogoURL", "Type"]);
    return successResponse({ sponsors: [] });
  }
  
  const data = sheet.getDataRange().getValues();
  const sponsors = [];
  for (let i = 1; i < data.length; i++) {
    if(data[i][0]) {
      sponsors.push({
        id: String(data[i][0]),
        name: data[i][1],
        logoUrl: toLh3Link(data[i][2]),
        type: data[i][3] || 'Main'
      });
    }
  }
  return successResponse({ sponsors });
}

function manageSponsor(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Sponsors");
  if (!sheet) {
    sheet = ss.insertSheet("Sponsors");
    sheet.appendRow(["ID", "Name", "LogoURL", "Type"]);
  }
  
  if (data.subAction === 'add') {
    let logoUrl = "";
    if (data.logoFile && data.logoFile.startsWith('data:')) {
      logoUrl = saveFileToDrive(data.logoFile, `sponsor_${Date.now()}`);
    }
    const id = "SPN_" + Date.now();
    sheet.appendRow([id, data.name, logoUrl, data.type || 'Main']);
  } else if (data.subAction === 'edit') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        if (data.name) sheet.getRange(i + 1, 2).setValue(data.name);
        if (data.logoFile && data.logoFile.startsWith('data:')) {
           const url = saveFileToDrive(data.logoFile, `sponsor_${Date.now()}`);
           sheet.getRange(i + 1, 3).setValue(url);
        }
        if (data.type) sheet.getRange(i + 1, 4).setValue(data.type);
        break;
      }
    }
  } else if (data.subAction === 'delete') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
  return successResponse({ status: 'success' });
}

// ... MUSIC TRACK FUNCTIONS ...

function getMusicTracks() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("MusicTracks");
  if (!sheet) {
    sheet = ss.insertSheet("MusicTracks");
    sheet.appendRow(["ID", "Name", "URL", "Type"]);
    return successResponse({ tracks: [] });
  }
  
  const data = sheet.getDataRange().getValues();
  const tracks = [];
  for (let i = 1; i < data.length; i++) {
    if(data[i][0]) {
      tracks.push({
        id: String(data[i][0]),
        name: data[i][1],
        url: data[i][2],
        type: data[i][3] || 'Other'
      });
    }
  }
  return successResponse({ tracks });
}

function manageMusicTrack(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("MusicTracks");
  if (!sheet) {
    sheet = ss.insertSheet("MusicTracks");
    sheet.appendRow(["ID", "Name", "URL", "Type"]);
  }
  
  if (data.subAction === 'add') {
    const id = "MSC_" + Date.now();
    sheet.appendRow([id, data.name, data.url, data.type]);
  } else if (data.subAction === 'edit') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        if (data.name) sheet.getRange(i + 1, 2).setValue(data.name);
        if (data.url) sheet.getRange(i + 1, 3).setValue(data.url);
        if (data.type) sheet.getRange(i + 1, 4).setValue(data.type);
        break;
      }
    }
  } else if (data.subAction === 'delete') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
  return successResponse({ status: 'success' });
}

// ... TICKER MESSAGE FUNCTIONS ...

function getTickerMessages() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("TickerMessages");
  if (!sheet) {
    sheet = ss.insertSheet("TickerMessages");
    sheet.appendRow(["ID", "Message", "IsActive", "Type"]);
    return successResponse({ messages: [] });
  }
  
  const data = sheet.getDataRange().getValues();
  const messages = [];
  for (let i = 1; i < data.length; i++) {
    if(data[i][0]) {
      messages.push({
        id: String(data[i][0]),
        message: data[i][1],
        isActive: data[i][2] === true,
        type: data[i][3] || 'global'
      });
    }
  }
  return successResponse({ messages });
}

function manageTickerMessage(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("TickerMessages");
  if (!sheet) {
    sheet = ss.insertSheet("TickerMessages");
    sheet.appendRow(["ID", "Message", "IsActive", "Type"]);
  }
  
  if (data.subAction === 'add') {
    const id = "TCK_" + Date.now();
    sheet.appendRow([id, data.message, data.isActive, data.type || 'global']);
  } else if (data.subAction === 'edit') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        if (data.message !== undefined) sheet.getRange(i + 1, 2).setValue(data.message);
        break;
      }
    }
  } else if (data.subAction === 'toggle') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 3).setValue(data.isActive);
        break;
      }
    }
  } else if (data.subAction === 'delete') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
  return successResponse({ status: 'success' });
}

// ... PREDICTION FUNCTIONS ...

function submitPrediction(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Predictions");
  if (!sheet) { 
    sheet = ss.insertSheet("Predictions"); 
    sheet.appendRow(["ID", "MatchID", "UserID", "UserDisplayName", "UserPic", "Prediction", "Timestamp", "TournamentID"]); 
  }
  
  const rows = sheet.getDataRange().getValues();
  // Check if user already predicted this match
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(data.matchId) && String(rows[i][2]) === String(data.userId)) {
      // Update existing prediction
      sheet.getRange(i + 1, 6).setValue(data.prediction);
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      return successResponse({ status: 'success', message: 'Updated prediction' });
    }
  }
  
  // Add new prediction
  const id = "PRD_" + Date.now();
  sheet.appendRow([
    id, 
    data.matchId, 
    data.userId, 
    data.userDisplayName, 
    data.userPic, 
    data.prediction, 
    new Date().toISOString(),
    data.tournamentId || 'default'
  ]);
  
  return successResponse({ status: 'success', message: 'Added prediction' });
}

// ... (Existing Functions) ...
function registerTeam(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Teams");
  if (!sheet) { sheet = ss.insertSheet("Teams"); sheet.appendRow(["ID", "Name", "ShortName", "Color", "LogoUrl", "Status", "Group", "District", "Province", "Director", "Manager", "ManagerPhone", "Coach", "CoachPhone", "DocUrl", "SlipUrl", "RejectReason", "RegistrationTime", "TournamentID", "CreatorID", "LineUserID"]); }
  const teamsData = sheet.getDataRange().getValues();
  for (let i = 1; i < teamsData.length; i++) { if (String(teamsData[i][1]).trim().toLowerCase() === String(data.schoolName).trim().toLowerCase() && String(teamsData[i][18]) === String(data.tournamentId)) { return errorResponse("ชื่อทีมนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น (Duplicate Name)"); } }
  let playersSheet = ss.getSheetByName("Players");
  if (!playersSheet) { playersSheet = ss.insertSheet("Players"); playersSheet.appendRow(["ID", "TeamID", "Name", "Number", "Position", "PhotoUrl", "BirthDate", "TournamentID"]); }
  const logoUrl = saveFileToDrive(data.logoFile, `logo_${data.schoolName}_${Date.now()}`);
  const docUrl = saveFileToDrive(data.documentFile, `doc_${data.schoolName}_${Date.now()}`);
  const slipUrl = saveFileToDrive(data.slipFile, `slip_${data.schoolName}_${Date.now()}`);
  const teamId = "T_" + Date.now();
  sheet.appendRow([ teamId, data.schoolName, data.shortName, data.color, logoUrl, 'Pending', '', data.district, data.province, data.directorName, data.managerName, "'" + data.managerPhone, data.coachName, "'" + data.coachPhone, docUrl, slipUrl, '', data.registrationTime, data.tournamentId, data.creatorId || '', data.lineUserId || '' ]);
  if (data.players && data.players.length > 0) { data.players.forEach(p => { let photoUrl = ''; if (p.photoFile && p.photoFile.startsWith('data:')) photoUrl = saveFileToDrive(p.photoFile, `p_${teamId}_${p.sequence}`); playersSheet.appendRow([ "P_" + Date.now() + "_" + Math.floor(Math.random()*1000), teamId, p.name, "'" + p.number, p.position || 'Player', photoUrl, p.birthDate, data.tournamentId ]); }); }
  return successResponse({ status: 'success', teamId: teamId });
}
function updateTeamStatus(teamId, status, group, reason) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Teams"); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(teamId)) { if(status !== undefined) sheet.getRange(i + 1, 6).setValue(status); if (group !== undefined) sheet.getRange(i + 1, 7).setValue(group); if (reason !== undefined) sheet.getRange(i + 1, 17).setValue(reason); return successResponse({ status: 'success' }); } } return errorResponse("Team not found"); }
function updateTeamData(team, players) { const ss = getSpreadsheet(); let teamSheet = ss.getSheetByName("Teams"); let playerSheet = ss.getSheetByName("Players"); if (!teamSheet || !playerSheet) return errorResponse("Sheets missing"); const tData = teamSheet.getDataRange().getValues(); for (let i = 1; i < tData.length; i++) { if (String(tData[i][0]) === String(team.id)) { if (team.name !== undefined) teamSheet.getRange(i+1, 2).setValue(team.name); if (team.color !== undefined) teamSheet.getRange(i+1, 4).setValue(team.color); if (team.district !== undefined) teamSheet.getRange(i+1, 8).setValue(team.district); if (team.province !== undefined) teamSheet.getRange(i+1, 9).setValue(team.province); if (team.directorName !== undefined) teamSheet.getRange(i+1, 10).setValue(team.directorName); if (team.managerName !== undefined) teamSheet.getRange(i+1, 11).setValue(team.managerName); if (team.managerPhone !== undefined) teamSheet.getRange(i+1, 12).setValue("'" + team.managerPhone); if (team.coachName !== undefined) teamSheet.getRange(i+1, 13).setValue(team.coachName); if (team.coachPhone !== undefined) teamSheet.getRange(i+1, 14).setValue("'" + team.coachPhone); if (team.group !== undefined) teamSheet.getRange(i+1, 7).setValue(team.group); if (team.logoUrl && team.logoUrl.startsWith('data:')) { const url = saveFileToDrive(team.logoUrl, `logo_${team.id}_${Date.now()}`); teamSheet.getRange(i+1, 5).setValue(url); } if (team.docUrl && team.docUrl.startsWith('data:')) { const url = saveFileToDrive(team.docUrl, `doc_${team.id}_${Date.now()}`); teamSheet.getRange(i+1, 15).setValue(url); } if (team.slipUrl && team.slipUrl.startsWith('data:')) { const url = saveFileToDrive(team.slipUrl, `slip_${team.id}_${Date.now()}`); teamSheet.getRange(i+1, 16).setValue(url); } break; } } if (players && players.length > 0) { const pData = playerSheet.getDataRange().getValues(); players.forEach(p => { let found = false; let photoLink = p.photoUrl; if (photoLink && photoLink.startsWith('data:')) { photoLink = saveFileToDrive(photoLink, `player_${p.id}_${Date.now()}`); } for (let j = 1; j < pData.length; j++) { if (String(pData[j][0]) === String(p.id)) { if(p.name !== undefined) playerSheet.getRange(j+1, 3).setValue(p.name); if(p.number !== undefined) playerSheet.getRange(j+1, 4).setValue("'" + p.number); if(p.position !== undefined) playerSheet.getRange(j+1, 5).setValue(p.position || 'Player'); if (photoLink !== undefined) playerSheet.getRange(j+1, 6).setValue(photoLink); if (p.birthDate !== undefined) playerSheet.getRange(j+1, 7).setValue(p.birthDate); if (p.photoUrl === '') playerSheet.getRange(j+1, 6).setValue(''); found = true; break; } } if (!found && p.id.startsWith('TEMP')) { const newId = "P_" + Date.now() + "_" + Math.floor(Math.random()*1000); playerSheet.appendRow([ newId, team.id, p.name, "'" + p.number, p.position || 'Player', photoLink || '', p.birthDate, team.tournamentId || 'default' ]); } }); const survivingIds = players.map(p => p.id).filter(id => !id.startsWith('TEMP')); for (let j = pData.length - 1; j >= 1; j--) { if (String(pData[j][1]) === String(team.id)) { const rowId = String(pData[j][0]); if (!survivingIds.includes(rowId)) { playerSheet.deleteRow(j + 1); } } } } return successResponse({ status: 'success' }); }
function deleteTeam(teamId) { const ss = getSpreadsheet(); let teamSheet = ss.getSheetByName("Teams"); let playerSheet = ss.getSheetByName("Players"); if (!teamSheet) return errorResponse("Team sheet missing"); const tData = teamSheet.getDataRange().getValues(); for (let i = 1; i < tData.length; i++) { if (String(tData[i][0]) === String(teamId)) { teamSheet.deleteRow(i + 1); break; } } if (playerSheet) { const pData = playerSheet.getDataRange().getValues(); for (let i = pData.length - 1; i >= 1; i--) { if (String(pData[i][1]) === String(teamId)) { playerSheet.deleteRow(i + 1); } } } return successResponse({ status: 'success' }); }
function saveMatch(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Matches"); if (!sheet) { sheet = ss.insertSheet("Matches"); sheet.appendRow(["MatchID","TeamA","TeamB","ScoreA","ScoreB","Winner","Date","Summary","Round","Status","Venue","ScheduledTime","LiveURL","LiveCover","TournamentID"]); } const rows = sheet.getDataRange().getValues(); let matchRowIndex = -1; for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(data.matchId)) { matchRowIndex = i + 1; break; } } if (matchRowIndex === -1) { sheet.appendRow([ data.matchId, typeof data.teamA === 'string' ? data.teamA : data.teamA.name, typeof data.teamB === 'string' ? data.teamB : data.teamB.name, data.scoreA, data.scoreB, data.winner, new Date().toISOString(), data.summary || '', data.roundLabel || '', data.status || 'Finished', data.venue || '', data.scheduledTime || '', data.livestreamUrl || '', data.livestreamCover || '', data.tournamentId || 'default' ]); } else { sheet.getRange(matchRowIndex, 4).setValue(data.scoreA); sheet.getRange(matchRowIndex, 5).setValue(data.scoreB); sheet.getRange(matchRowIndex, 6).setValue(data.winner); sheet.getRange(matchRowIndex, 8).setValue(data.summary || ''); if (data.status) sheet.getRange(matchRowIndex, 10).setValue(data.status); } if (data.kicks && data.kicks.length > 0) saveKicks(data.kicks); return successResponse({ status: 'success' }); }
function saveKicks(kicks) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Kicks"); if (!sheet) { sheet = ss.insertSheet("Kicks"); sheet.appendRow(["MatchID", "Round", "Team", "Player", "Result", "Timestamp", "TournamentID"]); } const matchId = kicks[0].matchId; if(!matchId) return successResponse({ status: 'success' }); kicks.forEach(k => { sheet.appendRow([ k.matchId, k.round, k.teamId, k.player, k.result, k.timestamp, k.tournamentId || 'default' ]); }); return successResponse({ status: 'success' }); }
function handleAuth(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Users"); if (!sheet) { sheet = ss.insertSheet("Users"); sheet.appendRow(["ID", "Username", "Password", "DisplayName", "Role", "Phone", "PictureUrl", "LineUserId", "LastLogin"]); } if (data.authType === 'line') { const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][7]) === String(data.lineUserId)) { sheet.getRange(i+1, 9).setValue(new Date()); return successResponse({ userId: String(rows[i][0]), username: rows[i][1], displayName: rows[i][3], role: rows[i][4], phoneNumber: rows[i][5], pictureUrl: rows[i][6] }); } } const newId = 'U_' + Date.now(); sheet.appendRow([newId, data.lineUserId, '', data.displayName, 'user', '', data.pictureUrl, data.lineUserId, new Date()]); return successResponse({ userId: newId, username: data.lineUserId, displayName: data.displayName, role: 'user', phoneNumber: '', pictureUrl: data.pictureUrl }); } else if (data.authType === 'login') { const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][1]).trim() === String(data.username).trim() && String(rows[i][2]).trim() === String(data.password).trim()) { sheet.getRange(i+1, 9).setValue(new Date()); return successResponse({ userId: String(rows[i][0]), username: rows[i][1], displayName: rows[i][3], role: rows[i][4], phoneNumber: rows[i][5], pictureUrl: rows[i][6] }); } } return errorResponse("Invalid username or password"); } else if (data.authType === 'register') { const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][1]).trim() === String(data.username).trim()) return errorResponse("Username already exists"); } const newId = 'U_' + Date.now(); sheet.appendRow([newId, data.username, data.password, data.displayName, 'user', data.phone, '', '', new Date()]); return successResponse({ userId: newId, username: data.username, displayName: data.displayName, role: 'user', phoneNumber: data.phone, pictureUrl: '' }); } }
function saveMatchEvents(events) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("MatchEvents"); if (!sheet) { sheet = ss.insertSheet("MatchEvents"); sheet.appendRow(["ID", "MatchID", "TournamentID", "Minute", "Type", "Player", "TeamID", "Timestamp"]); } if (events && events.length > 0) { events.forEach(e => { sheet.appendRow([e.id, e.matchId, e.tournamentId, e.minute, e.type, e.player, e.teamId, e.timestamp]); }); } return successResponse({ status: 'success' }); }
function saveSettings(settings) { 
  const ss = getSpreadsheet(); 
  let sheet = ss.getSheetByName("Config"); 
  if (!sheet) { 
    sheet = ss.insertSheet("Config"); 
    sheet.appendRow(["CompName","Logo","BankName","BankAccount","AccountName","Location","Link","Announcement","PIN","Lat","Lng","Fee","Goal","ObjTitle","ObjDesc","ObjImg","LiffID","StartUrl","Scope", "CoffeePhone", "EduQR", "EduName", "EduBank", "EduNum"]); 
  } 
  
  let logoUrl = settings.competitionLogo; 
  if (logoUrl && logoUrl.startsWith('data:')) logoUrl = saveFileToDrive(logoUrl, 'comp_logo_' + Date.now()); 
  
  let objImgUrl = settings.objectiveImageUrl; 
  if (objImgUrl && objImgUrl.startsWith('data:')) objImgUrl = saveFileToDrive(objImgUrl, 'obj_img_' + Date.now());
  
  let eduQrUrl = settings.educationSupportQrUrl;
  if (eduQrUrl && eduQrUrl.startsWith('data:')) eduQrUrl = saveFileToDrive(eduQrUrl, 'edu_qr_' + Date.now());

  const rowData = [ 
    settings.competitionName, logoUrl, settings.bankName, settings.bankAccount, settings.accountName, settings.locationName, settings.locationLink, settings.announcement, settings.adminPin, settings.locationLat, settings.locationLng, settings.registrationFee, settings.fundraisingGoal, settings.objectiveTitle, settings.objectiveDescription, objImgUrl, settings.liffId || '', settings.pwaStartUrl || '', settings.pwaScope || '',
    settings.coffeeSupportPhone || '0836645989',
    eduQrUrl || '',
    settings.educationSupportAccountName || '',
    settings.educationSupportBankName || '',
    settings.educationSupportAccountNumber || ''
  ]; 
  
  if (sheet.getLastRow() < 2) sheet.appendRow(rowData); 
  else sheet.getRange(2, 1, 1, rowData.length).setValues([rowData]); 
  
  return successResponse({ status: 'success' }); 
}
function scheduleMatch(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Matches"); if (!sheet) { sheet = ss.insertSheet("Matches"); sheet.appendRow(["MatchID","TeamA","TeamB","ScoreA","ScoreB","Winner","Date","Summary","Round","Status","Venue","ScheduledTime","LiveURL","LiveCover","TournamentID"]); } const rows = sheet.getDataRange().getValues(); let rowIndex = -1; let matchId = data.matchId; for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(matchId)) { rowIndex = i + 1; break; } } if (rowIndex === -1 && data.roundLabel) { const reqTId = data.tournamentId ? String(data.tournamentId) : 'default'; for (let i = 1; i < rows.length; i++) { const rowTId = rows[i][14] ? String(rows[i][14]) : 'default'; if (String(rows[i][8]) === String(data.roundLabel) && rowTId === reqTId) { rowIndex = i + 1; matchId = String(rows[i][0]); break; } } } let coverUrl = ""; if (data.livestreamCover && data.livestreamCover.startsWith("data:")) coverUrl = saveFileToDrive(data.livestreamCover, `cover_${matchId}`); else if (data.livestreamCover !== undefined) coverUrl = data.livestreamCover; if (rowIndex === -1) { if (!matchId || matchId.includes('TEMP')) matchId = "M_" + Date.now(); sheet.appendRow([ matchId, data.teamA !== undefined ? data.teamA : '', data.teamB !== undefined ? data.teamB : '', 0, 0, '', new Date().toISOString(), '', data.roundLabel || '', 'Scheduled', data.venue || '', data.scheduledTime || '', data.livestreamUrl || '', coverUrl, data.tournamentId || 'default' ]); } else { if(data.teamA !== undefined) sheet.getRange(rowIndex, 2).setValue(data.teamA); if(data.teamB !== undefined) sheet.getRange(rowIndex, 3).setValue(data.teamB); if(data.roundLabel !== undefined) sheet.getRange(rowIndex, 9).setValue(data.roundLabel); if(data.venue !== undefined) sheet.getRange(rowIndex, 11).setValue(data.venue); if(data.scheduledTime !== undefined) sheet.getRange(rowIndex, 12).setValue(data.scheduledTime); if(data.livestreamUrl !== undefined) sheet.getRange(rowIndex, 13).setValue(data.livestreamUrl); if (coverUrl !== "") sheet.getRange(rowIndex, 14).setValue(coverUrl); if (data.tournamentId !== undefined) sheet.getRange(rowIndex, 15).setValue(data.tournamentId); } return successResponse({ status: 'success', matchId: matchId }); }
function deleteMatch(matchId) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Matches"); const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(matchId)) { sheet.deleteRow(i + 1); return successResponse({ status: 'success' }); } } return errorResponse("Match not found"); }
function updateUserRole(userId, role) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Users"); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(userId)) { sheet.getRange(i + 1, 5).setValue(role); return successResponse({ status: 'success' }); } } return errorResponse("User not found"); }
function createUser(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Users"); if (!sheet) { sheet = ss.insertSheet("Users"); sheet.appendRow(["ID", "Username", "Password", "DisplayName", "Role", "Phone", "PictureUrl", "LineUserId", "LastLogin"]); } const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][1]).trim() === String(data.username).trim()) return errorResponse("Username already exists"); } const newId = 'U_' + Date.now(); sheet.appendRow([newId, data.username, data.password, data.displayName, data.role || 'user', data.phone || '', '', '', new Date()]); return successResponse({ status: 'success', userId: newId }); }
function updateUserDetails(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Users"); const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(data.userId)) { if(data.displayName !== undefined) sheet.getRange(i+1, 4).setValue(data.displayName); if(data.phone !== undefined) sheet.getRange(i+1, 6).setValue(data.phone); if(data.role !== undefined) sheet.getRange(i+1, 5).setValue(data.role); if(data.password && data.password.trim() !== "") sheet.getRange(i+1, 3).setValue(data.password); return successResponse({ status: 'success' }); } } return errorResponse("User not found"); }
function deleteUser(userId) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Users"); const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(userId)) { sheet.deleteRow(i + 1); return successResponse({ status: 'success' }); } } return errorResponse("User not found"); }
function verifyDonation(donationId, status) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Donations"); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(donationId)) { sheet.getRange(i + 1, 12).setValue(status); return successResponse({ status: 'success' }); } } return errorResponse("Donation not found"); }
function updateDonationDetails(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Donations"); const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(data.donationId)) { if (data.isAnonymous !== undefined) { sheet.getRange(i + 1, 13).setValue(data.isAnonymous); } if (data.taxFile) { if (data.taxFile.startsWith('data:')) { const url = saveFileToDrive(data.taxFile, `donation_tax_${data.donationId}_${Date.now()}`); sheet.getRange(i + 1, 14).setValue(url); } } return successResponse({ status: 'success' }); } } return errorResponse("Donation not found"); }
function submitDonation(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Donations"); if (!sheet) { sheet = ss.insertSheet("Donations"); sheet.appendRow(["ID", "Timestamp", "DonorName", "Amount", "Phone", "IsEDonation", "TaxID", "Address", "SlipURL", "TournamentID", "LineUserID", "Status", "IsAnonymous", "TaxFileURL"]); } let slipUrl = ""; if (data.slipFile && data.slipFile.startsWith('data:')) slipUrl = saveFileToDrive(data.slipFile, `donation_slip_${Date.now()}`); let taxFileUrl = ""; if (data.taxFile && data.taxFile.startsWith('data:')) taxFileUrl = saveFileToDrive(data.taxFile, `donation_tax_${Date.now()}`); const id = "DON_" + Date.now(); const safePhone = "'" + data.donorPhone; sheet.appendRow([ id, new Date(), data.donorName, data.amount, safePhone, data.isEdonation, data.taxId, data.address, slipUrl, data.tournamentId, data.lineUserId || '', 'Pending', data.isAnonymous || false, taxFileUrl ]); return successResponse({ status: 'success' }); }
function manageNews(data) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("News"); if (!sheet) { sheet = ss.insertSheet("News"); sheet.appendRow(["ID", "Title", "Content", "ImageURL", "Timestamp", "DocURL", "TournamentID"]); } const subAction = data.subAction; const item = data.newsItem; if (subAction === 'add') { let imgUrl = item.imageUrl && item.imageUrl.startsWith('data:') ? saveFileToDrive(item.imageUrl, `news_img_${Date.now()}`) : (item.imageUrl || ''); let docUrl = item.documentUrl && item.documentUrl.startsWith('data:') ? saveFileToDrive(item.documentUrl, `news_doc_${Date.now()}`) : (item.documentUrl || ''); sheet.appendRow([ item.id || Date.now().toString(), item.title, item.content, imgUrl, item.timestamp || Date.now(), docUrl, item.tournamentId || 'global' ]); } else if (subAction === 'edit') { const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(item.id)) { if(item.title !== undefined) sheet.getRange(i+1, 2).setValue(item.title); if(item.content !== undefined) sheet.getRange(i+1, 3).setValue(item.content); if(item.tournamentId !== undefined) sheet.getRange(i+1, 7).setValue(item.tournamentId); if (item.imageUrl && item.imageUrl.startsWith('data:')) { const url = saveFileToDrive(item.imageUrl, `news_img_${Date.now()}`); sheet.getRange(i+1, 4).setValue(url); } if (item.documentUrl && item.documentUrl.startsWith('data:')) { const url = saveFileToDrive(item.documentUrl, `news_doc_${Date.now()}`); sheet.getRange(i+1, 6).setValue(url); } break; } } } else if (subAction === 'delete') { const rows = sheet.getDataRange().getValues(); for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(item.id)) { sheet.deleteRow(i+1); return successResponse({ status: 'success' }); } } return errorResponse("News not found"); } return successResponse({ status: 'success' }); }
function createTournament(name, type) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Tournaments"); if (!sheet) { sheet = ss.insertSheet("Tournaments"); sheet.appendRow(["ID", "Name", "Type", "Status", "ConfigJSON"]); } const id = "TRN_" + Date.now(); sheet.appendRow([id, name, type, "Active", "{}"]); return successResponse({ tournamentId: id }); }
function updateTournament(tournament) { const ss = getSpreadsheet(); let sheet = ss.getSheetByName("Tournaments"); const data = sheet.getDataRange().getValues(); let config = {}; try { config = JSON.parse(tournament.config); if (config.objective && config.objective.images) { config.objective.images = config.objective.images.map(img => { if (img.url && img.url.startsWith('data:')) return { ...img, url: saveFileToDrive(img.url, `proj_img_${tournament.id}_${Date.now()}`) }; return img; }); } if (config.objective && config.objective.docUrl && config.objective.docUrl.startsWith('data:')) { config.objective.docUrl = saveFileToDrive(config.objective.docUrl, `proj_doc_${tournament.id}_${Date.now()}`); } tournament.config = JSON.stringify(config); } catch(e) {} for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(tournament.id)) { sheet.getRange(i+1, 2).setValue(tournament.name); sheet.getRange(i+1, 3).setValue(tournament.type); sheet.getRange(i+1, 4).setValue(tournament.status); sheet.getRange(i+1, 5).setValue(tournament.config); return successResponse({ status: 'success' }); } } return errorResponse("Tournament not found"); }

function getSpreadsheet() { return SpreadsheetApp.getActiveSpreadsheet(); }
function successResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse(message) { return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: message })).setMimeType(ContentService.MimeType.JSON); }
function toLh3Link(url) { if (!url || !url.includes("drive.google.com")) return url || ""; try { return "https://lh3.googleusercontent.com/d/" + url.match(/\/d\/(.+?)\//)[1]; } catch (e) { return url; } }
function formatDate(dateObj) { try { const d = new Date(dateObj); if (isNaN(d.getTime())) return String(dateObj); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; } catch (e) { return String(dateObj); } }
function saveFileToDrive(base64Data, filename) { try { if (!base64Data || base64Data === "") return ""; const split = base64Data.split(','); const type = split[0].split(';')[0].replace('data:', ''); const data = Utilities.base64Decode(split[1]); const blob = Utilities.newBlob(data, type, filename); const folders = DriveApp.getFoldersByName(FOLDER_NAME); let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME); folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); const file = folder.createFile(blob); file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW); return file.getUrl(); } catch (e) { return ""; } }
