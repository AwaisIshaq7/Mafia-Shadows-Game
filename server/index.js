import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const HOST_PASSWORD = process.env.HOST_PASSWORD || '';
const HOST_NAME = process.env.HOST_NAME || 'Host';

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000
});

const rooms = {};
const roomTimers = {};
const MAX_PLAYERS = 10;

const AVATAR_POOL = [
  '🦊', '🐺', '🦁', '🐯', '🦅', '🦉', '🐸', '🦇', '🐲', '🦎',
  '🐙', '🦈', '🦚', '🦜', '🐿️', '🦋', '🦂', '🐍', '🦩', '🐬',
  '🦝', '🐻', '🦌', '🐧', '🦊', '🐼', '🦄', '🦥', '🐨', '🦔'
];

function getRandomAvatar(existingAvatars = []) {
  const available = AVATAR_POOL.filter(a => !existingAvatars.includes(a));
  if (available.length === 0) return AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)];
  return available[Math.floor(Math.random() * available.length)];
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    attempts++;
  } while (rooms[code] && attempts < 100);
  return code;
}

function getMafiaCount(playerCount) {
  if (playerCount >= 5) return 2;
  return 1;
}

function broadcastRoomUpdate(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const isMafiaAlive = room.players.some(p => p.role === 'MAFIA' && p.alive);
  const isDetectiveAlive = room.players.some(p => p.role === 'DETECTIVE' && p.alive);
  const isDoctorAlive = room.players.some(p => p.role === 'DOCTOR' && p.alive);

  const tally = {};
  room.players.forEach(p => {
    const canVote = p.alive || (p.eliminatedInRound === room.roundNumber);
    if (canVote && p.votedFor) tally[p.votedFor] = (tally[p.votedFor] || 0) + 1;
  });

  const getSanitizedPlayers = (recipientId) => {
    const recipient = room.players.find(p => p.id === recipientId);
    const isRecipientMafia = recipient?.role === 'MAFIA';
    return room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar || null, alive: p.alive, votedFor: p.votedFor,
      hasCheckedRole: p.hasCheckedRole,
      eliminatedInRound: p.eliminatedInRound || null,
      role: (p.id === recipientId || (isRecipientMafia && p.role === 'MAFIA' && room.phase !== 'LOBBY')) ? p.role : null,
      isProtected: p.isProtected || false
    }));
  };

  room.players.forEach(p => {
    const playerPayload = {
      code: room.code, phase: room.phase, roundNumber: room.roundNumber || 1, nightTurn: room.nightTurn || null, timer: room.timer || 0,
      dayLog: room.dayLog || [], announcementText: room.announcementText || '',
      pendingDeathId: room.pendingDeathId || null, lynchedPlayerId: room.lynchedPlayerId || null,
      winner: room.winner || null,
      players: getSanitizedPlayers(p.id),
      voteTally: tally,
      nightActions: {
        mafiaHasActed: !isMafiaAlive || room.nightActions?.mafiaTarget !== null,
        mafiaTarget: room.nightActions?.mafiaTarget || null,
        mafiaVotes: room.nightActions?.mafiaVotes || {},
        detectiveHasActed: !isDetectiveAlive || room.nightActions?.detectiveCheck !== null,
        doctorHasActed: !isDoctorAlive || room.nightActions?.doctorTarget !== null,
        mafiaAlive: isMafiaAlive, detectiveAlive: isDetectiveAlive, doctorAlive: isDoctorAlive
      }
    };
    io.to(p.id).emit('room_update', playerPayload);
  });

  if (room.hostSocketId) {
    const hostPayload = {
      ...room, voteTally: tally,
      roundNumber: room.roundNumber || 1,
      nightActions: { ...room.nightActions, mafiaAlive: isMafiaAlive, detectiveAlive: isDetectiveAlive, doctorAlive: isDoctorAlive }
    };
    io.to(room.hostSocketId).emit('room_update', hostPayload);
  }
}

function startTimer(roomCode, duration, onComplete) {
  if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
  const room = rooms[roomCode];
  if (!room) return;
  room.timer = duration;
  const startedAt = Date.now();

  roomTimers[roomCode] = setInterval(() => {
    const r = rooms[roomCode];
    if (!r) { clearInterval(roomTimers[roomCode]); return; }
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, duration - elapsed);
    r.timer = remaining;
    io.to(roomCode).emit('timer_update', { timer: remaining });
    if (remaining <= 0) {
      clearInterval(roomTimers[roomCode]);
      if (onComplete) onComplete();
    }
  }, 500);
}

function resolveVoting(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const votes = {};
  room.players.forEach(p => {
    const canVote = p.alive || (p.eliminatedInRound === room.roundNumber);
    if (canVote && p.votedFor) votes[p.votedFor] = (votes[p.votedFor] || 0) + 1;
  });

  let maxVotes = 0;
  let candidates = [];
  for (const targetId in votes) {
    if (targetId !== 'skip') {
      if (votes[targetId] > maxVotes) { maxVotes = votes[targetId]; candidates = [targetId]; }
      else if (votes[targetId] === maxVotes) candidates.push(targetId);
    }
  }

  const skipCount = votes['skip'] || 0;
  let lynchedId = null;
  let announcement = '';

  if (candidates.length === 1 && maxVotes > skipCount) {
    lynchedId = candidates[0];
    const candidate = room.players.find(p => p.id === lynchedId);
    if (candidate && candidate.alive) {
      announcement = `⚖️ The town voted to lynch: ${candidate.name}`;
    } else {
      lynchedId = null;
      announcement = `⚖️ The target is no longer available. No one is scheduled for lynching.`;
    }
  } else {
    announcement = `⚖️ The vote was split or skipped. No one is scheduled for lynching today.`;
  }

  room.phase = 'VOTE_RESOLVED';
  room.lynchedPlayerId = lynchedId;
  room.announcementText = announcement;
  room.pendingDeathId = null;
  broadcastRoomUpdate(roomCode);
}

function checkWinConditions(roomCode) {
  const room = rooms[roomCode];
  if (!room) return false;

  const mafiaAlive = room.players.filter(p => p.role === 'MAFIA' && p.alive).length;
  const villagersAlive = room.players.filter(p => p.role !== 'MAFIA' && p.alive).length;

  if (mafiaAlive === 0) {
    room.phase = 'ENDED';
    room.winner = 'VILLAGERS';
    const allRoles = {};
    room.players.forEach(p => { allRoles[p.id] = p.role; });
    io.to(roomCode).emit('game_over', { winner: 'VILLAGERS', allRoles });
    broadcastRoomUpdate(roomCode);
    if (roomTimers[roomCode]) { clearInterval(roomTimers[roomCode]); delete roomTimers[roomCode]; }
    return true;
  }

  if (mafiaAlive > villagersAlive) {
    room.phase = 'ENDED';
    room.winner = 'MAFIA';
    const allRoles = {};
    room.players.forEach(p => { allRoles[p.id] = p.role; });
    io.to(roomCode).emit('game_over', { winner: 'MAFIA', allRoles });
    broadcastRoomUpdate(roomCode);
    if (roomTimers[roomCode]) { clearInterval(roomTimers[roomCode]); delete roomTimers[roomCode]; }
    return true;
  }

  return false;
}

const NIGHT_TURN_ORDER = ['MAFIA_TURN', 'DOCTOR_TURN', 'DETECTIVE_TURN'];

function getRoleForTurn(turn) {
  if (turn === 'MAFIA_TURN') return 'MAFIA';
  if (turn === 'DOCTOR_TURN') return 'DOCTOR';
  if (turn === 'DETECTIVE_TURN') return 'DETECTIVE';
  return null;
}

function resolveNightToDraft(roomCode) {
  const r = rooms[roomCode];
  if (!r) return;
  r.players.forEach(p => p.isProtected = false);
  const mafiaTargetId = r.nightActions?.mafiaTarget;
  const doctorTargetId = r.nightActions?.doctorTarget;
  const mafiaTarget = r.players.find(p => p.id === mafiaTargetId);
  const doctorTarget = r.players.find(p => p.id === doctorTargetId);
  const isTargetProtected = Boolean(
    mafiaTarget &&
    doctorTarget &&
    doctorTarget.alive &&
    doctorTarget.id === mafiaTarget.id
  );
  let draftText = '';
  if (mafiaTarget && mafiaTarget.alive) {
    if (isTargetProtected) {
      draftText = `🌙 The Mafia attempted to eliminate ${mafiaTarget.name}, but the Doctor saved them!`;
      r.pendingDeathId = null;
    } else {
      draftText = `🌙 ${mafiaTarget.name} was eliminated during the night.`;
      r.pendingDeathId = mafiaTarget.id;
    }
  } else {
    draftText = `🌙 No one was eliminated during the night.`;
    r.pendingDeathId = null;
  }
  r.nightTurn = null;
  r.phase = 'NIGHT_RESOLVED';
  r.announcementText = draftText;
  broadcastRoomUpdate(roomCode);
}

function advanceNightTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'NIGHT') return;
  const currentIndex = NIGHT_TURN_ORDER.indexOf(room.nightTurn);

  if (currentIndex < NIGHT_TURN_ORDER.length - 1) {
    const nextTurn = NIGHT_TURN_ORDER[currentIndex + 1];
    const roleForTurn = getRoleForTurn(nextTurn);
    const isRoleAlive = !roleForTurn || room.players.some(p => p.role === roleForTurn && p.alive);

    if (!isRoleAlive) {
      room.nightTurn = nextTurn;
      advanceNightTurn(roomCode);
      return;
    }

    room.nightTurn = nextTurn;
    const durations = { MAFIA_TURN: 30, DOCTOR_TURN: 25, DETECTIVE_TURN: 25 };
    room.timer = durations[nextTurn] || 25;
    startTimer(roomCode, room.timer, () => advanceNightTurn(roomCode));
    broadcastRoomUpdate(roomCode);
  } else {
    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
    resolveNightToDraft(roomCode);
  }
}

setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];
    if (room.phase === 'ENDED') {
      const hasPlayers = room.players.some(p => {
        const sock = io.sockets.sockets.get(p.id);
        return sock && sock.connected;
      });
      if (!hasPlayers) {
        if (roomTimers[code]) { clearInterval(roomTimers[code]); delete roomTimers[code]; }
        delete rooms[code];
      }
    }
  }
}, 60000);

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  socket.on('create_room', (data = {}, callback) => {
    if (typeof data === 'function') { callback = data; data = {}; }
    const hostPassword = data.hostPassword || '';
    if (HOST_PASSWORD && hostPassword !== HOST_PASSWORD) {
      if (callback) callback({ status: 'error', message: 'Invalid host password' });
      return;
    }
    const code = generateRoomCode();
    rooms[code] = {
      code, phase: 'LOBBY', roundNumber: 1, hostSocketId: socket.id, players: [],
      nightActions: { mafiaTarget: null, mafiaVotes: {}, detectiveCheck: null, doctorTarget: null },
      nightTurn: null,
      dayLog: [], timer: 0, announcementText: '', pendingDeathId: null, lynchedPlayerId: null, winner: null
    };
    socket.join(code);
    if (callback) callback({ status: 'ok', room: rooms[code], hostName: HOST_NAME });
    broadcastRoomUpdate(code);
  });

  socket.on('join_room', ({ roomCode, name }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    if (room.phase !== 'LOBBY' && room.phase !== 'ENDED') { if (callback) callback({ status: 'error', message: 'Game has already started' }); return; }
    if (room.players.length >= MAX_PLAYERS) { if (callback) callback({ status: 'error', message: `Room is full (max ${MAX_PLAYERS} players)` }); return; }
    if (room.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) { if (callback) callback({ status: 'error', message: 'Name is already taken' }); return; }

    const playerId = (Math.random() + 1).toString(36).substring(2, 8);
    const existingAvatars = room.players.map(p => p.avatar).filter(Boolean);
    const avatar = getRandomAvatar(existingAvatars);
    const newPlayer = { id: socket.id, playerId, name: name.trim(), avatar, role: null, alive: true, votedFor: null, hasCheckedRole: false, isProtected: false, eliminatedInRound: null };
    room.players.push(newPlayer);
    socket.join(code);
    if (callback) callback({ status: 'ok', player: newPlayer, playerId });
    broadcastRoomUpdate(code);
  });

  socket.on('reconnect_player', ({ roomCode, playerId }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    const player = room.players.find(p => p.playerId === playerId);
    if (!player) { if (callback) callback({ status: 'error', message: 'Player not found' }); return; }
    player.id = socket.id;
    socket.join(code);
    if (callback) callback({ status: 'ok', player, role: player.role });
    broadcastRoomUpdate(code);
  });

  socket.on('leave_room', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) { if (callback) callback({ status: 'error', message: 'Not in room' }); return; }
    const player = room.players[playerIndex];
    const playerName = player.name;
    if (room.phase === 'LOBBY') {
      room.players.splice(playerIndex, 1);
    } else if (room.phase === 'ENDED') {
      room.players.splice(playerIndex, 1);
      io.to(code).emit('message_received', {
        senderId: 'system', senderName: 'System',
        text: `🚪 ${playerName} left the room.`,
        type: 'system', channel: 'TOWN',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } else {
      if (player.alive) {
        player.alive = false;
        player.eliminatedInRound = room.roundNumber;
      }
      io.to(code).emit('message_received', {
        senderId: 'system', senderName: 'System',
        text: `🚪 ${playerName} has left the game.`,
        type: 'system', channel: 'TOWN',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      checkWinConditions(code);
    }
    socket.leave(code);
    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('start_game', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    if (socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Only the host can start' }); return; }
    if (room.phase !== 'LOBBY') { if (callback) callback({ status: 'error', message: 'Game already started' }); return; }
    if (room.players.length < 3) { if (callback) callback({ status: 'error', message: 'Need at least 3 players' }); return; }

    const shuffled = [...room.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const mafiaCount = getMafiaCount(shuffled.length);
    let mafiaAssigned = 0, detectiveAssigned = 0, doctorAssigned = 0;

    shuffled.forEach((player) => {
      const rp = room.players.find(p => p.id === player.id);
      if (mafiaAssigned < mafiaCount) { rp.role = 'MAFIA'; mafiaAssigned++; }
      else if (detectiveAssigned < 1) { rp.role = 'DETECTIVE'; detectiveAssigned++; }
      else if (doctorAssigned < 1) { rp.role = 'DOCTOR'; doctorAssigned++; }
      else { rp.role = 'VILLAGER'; }
      rp.alive = true; rp.votedFor = null; rp.hasCheckedRole = false; rp.isProtected = false; rp.eliminatedInRound = null;
    });

    room.phase = 'ROLE_REVEAL';
    room.roundNumber = 1;
    room.dayLog = ['🔐 Check your secret identity on your device.'];
    room.players.forEach((player) => io.to(player.id).emit('role_assigned', { role: player.role }));
    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('confirm_role_checked', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) { if (callback) callback({ status: 'error', message: 'Player not found' }); return; }
    player.hasCheckedRole = true;
    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
    const allChecked = room.players.every(p => p.hasCheckedRole);
    if (allChecked && room.phase === 'ROLE_REVEAL') {
      clearTimeout(room._autoNightTimer);
      room._autoNightTimer = setTimeout(() => {
        const r = rooms[code];
        if (!r || r.phase !== 'ROLE_REVEAL') return;
        if (r.hostSocketId) {
          io.to(r.hostSocketId).emit('auto_advance_ready', { message: 'All players checked in. Ready to start night.' });
        }
      }, 800);
    }
  });

  socket.on('host_start_night', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }

    room.phase = 'NIGHT';
    room.dayLog = ['🌙 Night falls. Close your eyes.'];
    room.nightActions = { mafiaTarget: null, mafiaVotes: {}, detectiveCheck: null, doctorTarget: null };
    room.players.forEach(p => { p.isProtected = false; p.votedFor = null; });

    const isMafiaAlive = room.players.some(p => p.role === 'MAFIA' && p.alive);
    if (isMafiaAlive) {
      room.nightTurn = 'MAFIA_TURN';
      room.timer = 30;
      startTimer(code, 30, () => advanceNightTurn(code));
    } else {
      room.nightTurn = 'DOCTOR_TURN';
      const isDoctorAlive = room.players.some(p => p.role === 'DOCTOR' && p.alive);
      if (isDoctorAlive) {
        room.timer = 25;
        startTimer(code, 25, () => advanceNightTurn(code));
      } else {
        advanceNightTurn(code);
        if (callback) callback({ status: 'ok' });
        broadcastRoomUpdate(code);
        return;
      }
    }

    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('night_action', ({ roomCode, type, targetId }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || room.phase !== 'NIGHT') { if (callback) callback({ status: 'error', message: 'Not in Night phase' }); return; }
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) { if (callback) callback({ status: 'error', message: 'You are not active' }); return; }

    const isMafiaTurn = room.nightTurn === 'MAFIA_TURN';
    const isDoctorTurn = room.nightTurn === 'DOCTOR_TURN';
    const isDetectiveTurn = room.nightTurn === 'DETECTIVE_TURN';

    if (type === 'MAFIA' && player.role === 'MAFIA' && isMafiaTurn) {
      if (!room.nightActions.mafiaVotes) room.nightActions.mafiaVotes = {};
      room.nightActions.mafiaVotes[socket.id] = targetId;

      const aliveMafias = room.players.filter(p => p.role === 'MAFIA' && p.alive);
      const mafiaVoteValues = aliveMafias.map(m => room.nightActions.mafiaVotes[m.id]);
      const allVoted = mafiaVoteValues.every(v => v !== undefined && v !== null);
      const allAgree = allVoted && mafiaVoteValues.every(v => v === mafiaVoteValues[0]);

      if (allAgree) {
        room.nightActions.mafiaTarget = mafiaVoteValues[0];
        if (roomTimers[code]) clearInterval(roomTimers[code]);
        if (callback) callback({ status: 'ok', consensusReached: true, targetId: mafiaVoteValues[0] });
        setTimeout(() => advanceNightTurn(code), 500);
      } else {
        room.nightActions.mafiaTarget = null;
        if (callback) callback({ status: 'ok', consensusReached: false, waitingForTeammate: true });
      }
    } else if (type === 'DETECTIVE' && player.role === 'DETECTIVE' && isDetectiveTurn) {
      room.nightActions.detectiveCheck = targetId;
      const targetPlayer = room.players.find(p => p.id === targetId);
      const isMafia = targetPlayer?.role === 'MAFIA';

      let hintData = null;
      if (isMafia) {
        // Pick a random innocent non-Mafia player as decoy
        const decoys = room.players.filter(p => p.id !== targetId && p.role !== 'MAFIA');
        const innocentDecoy = decoys.length > 0 ? decoys[Math.floor(Math.random() * decoys.length)] : null;
        const candidateNames = innocentDecoy ? [targetPlayer.name, innocentDecoy.name] : [targetPlayer.name, 'Unknown suspect'];
        if (Math.random() > 0.5) candidateNames.reverse();
        
        hintData = {
          isMafia: true,
          targetName: targetPlayer.name,
          candidateA: candidateNames[0],
          candidateB: candidateNames[1],
          suppositionText: `🔍 Hint: Either ${candidateNames[0]} or ${candidateNames[1]} is a Mafia member (50/50 supposition).`
        };
      } else {
        hintData = {
          isMafia: false,
          targetName: targetPlayer.name,
          suppositionText: `🔍 ${targetPlayer.name} is CLEAN (Not a Mafia member).`
        };
      }

      if (roomTimers[code]) clearInterval(roomTimers[code]);
      if (callback) callback({ status: 'ok', ...hintData });
      setTimeout(() => advanceNightTurn(code), 500);
    } else if (type === 'DOCTOR' && player.role === 'DOCTOR' && isDoctorTurn) {
      if (targetId === socket.id) { if (callback) callback({ status: 'error', message: 'You cannot protect yourself' }); return; }
      room.nightActions.doctorTarget = targetId;
      if (roomTimers[code]) clearInterval(roomTimers[code]);
      if (callback) callback({ status: 'ok' });
      setTimeout(() => advanceNightTurn(code), 500);
    } else {
      if (callback) callback({ status: 'error', message: 'It is not your turn to act' });
      return;
    }
    broadcastRoomUpdate(code);
  });

  socket.on('host_resolve_night', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    if (roomTimers[code]) { clearInterval(roomTimers[code]); }

    room.players.forEach(p => p.isProtected = false);
    const mafiaTargetId = room.nightActions?.mafiaTarget;
    const doctorTargetId = room.nightActions?.doctorTarget;
    const mafiaTarget = room.players.find(p => p.id === mafiaTargetId);
    const doctorTarget = room.players.find(p => p.id === doctorTargetId);
    const isTargetProtected = Boolean(
      mafiaTarget &&
      doctorTarget &&
      doctorTarget.alive &&
      doctorTarget.id === mafiaTarget.id
    );
    let draftText = '';
    if (mafiaTarget && mafiaTarget.alive) {
      if (isTargetProtected) { draftText = `🌙 The Mafia attempted to eliminate ${mafiaTarget.name}, but the Doctor saved them!`; room.pendingDeathId = null; }
      else { draftText = `🌙 ${mafiaTarget.name} was eliminated during the night.`; room.pendingDeathId = mafiaTarget.id; }
    } else { draftText = `🌙 No one was eliminated during the night.`; room.pendingDeathId = null; }
    room.phase = 'NIGHT_RESOLVED';
    room.announcementText = draftText;
    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('host_post_announcement', ({ roomCode, announcementText }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }

    if (room.pendingDeathId) {
      const victim = room.players.find(p => p.id === room.pendingDeathId);
      if (victim && victim.alive) {
        victim.alive = false;
        victim.eliminatedInRound = room.roundNumber;
      }
    }
    room.dayLog = [announcementText || room.announcementText || '☀️ Morning has arrived.'];
    room.pendingDeathId = null;
    if (checkWinConditions(code)) { if (callback) callback({ status: 'ok', gameEnded: true }); return; }
    room.phase = 'DAY';
    room.timer = 120;
    if (roomTimers[code]) { clearInterval(roomTimers[code]); delete roomTimers[code]; }
    startTimer(code, 120, () => {
      const r = rooms[code];
      if (!r || r.phase !== 'DAY') return;
      if (roomTimers[code]) clearInterval(roomTimers[code]);
      r.phase = 'VOTING';
      r.timer = 45;
      r.players.forEach(p => p.votedFor = null);
      startTimer(code, 45, () => {
        const r2 = rooms[code];
        if (r2 && r2.phase === 'VOTING') resolveVoting(code);
      });
      broadcastRoomUpdate(code);
    });
    if (callback) callback({ status: 'ok', gameEnded: false });
    broadcastRoomUpdate(code);
  });

  socket.on('start_voting', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    if (room.phase === 'DAY') {
      if (roomTimers[code]) clearInterval(roomTimers[code]);
      room.phase = 'VOTING';
      room.timer = 45;
      room.players.forEach(p => p.votedFor = null);
      startTimer(code, 45, () => {
        const r = rooms[code];
        if (r && r.phase === 'VOTING') resolveVoting(code);
      });
      if (callback) callback({ status: 'ok' });
      broadcastRoomUpdate(code);
    }
  });

  socket.on('cast_vote', ({ roomCode, targetId }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || room.phase !== 'VOTING') { if (callback) callback({ status: 'error', message: 'Not in Voting phase' }); return; }
    const voter = room.players.find(p => p.id === socket.id);
    const canVoteThisRound = voter && (voter.alive || voter.eliminatedInRound === room.roundNumber);
    if (!voter || !canVoteThisRound) { if (callback) callback({ status: 'error', message: 'You cannot vote in this round' }); return; }
    voter.votedFor = targetId;
    if (callback) callback({ status: 'ok' });

    const eligibleVoters = room.players.filter(p => p.alive || (p.eliminatedInRound === room.roundNumber));
    const votesCount = eligibleVoters.filter(p => p.votedFor !== null).length;
    if (votesCount === eligibleVoters.length && eligibleVoters.length > 0) {
      if (roomTimers[code]) clearInterval(roomTimers[code]);
      resolveVoting(code);
    } else {
      broadcastRoomUpdate(code);
    }
  });

  socket.on('host_resolve_voting', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    if (room.phase === 'VOTING') {
      if (roomTimers[code]) clearInterval(roomTimers[code]);
      resolveVoting(code);
      if (callback) callback({ status: 'ok' });
    }
  });

  socket.on('host_confirm_lynch', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    const lynchedId = room.lynchedPlayerId;
    const targetPlayer = room.players.find(p => p.id === lynchedId);
    if (targetPlayer && targetPlayer.alive) {
      targetPlayer.alive = false;
      targetPlayer.eliminatedInRound = room.roundNumber;
      room.dayLog = [`⚖️ ${targetPlayer.name} was lynched. They were a ${targetPlayer.role}!`];
    } else { room.dayLog = [`⚖️ No one was lynched today.`]; }
    room.lynchedPlayerId = null;
    if (checkWinConditions(code)) { if (callback) callback({ status: 'ok', gameEnded: true }); return; }
    if (callback) callback({ status: 'ok', gameEnded: false });
    broadcastRoomUpdate(code);
  });

  socket.on('host_start_next_night', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    room.phase = 'NIGHT';
    room.roundNumber = (room.roundNumber || 1) + 1;
    room.dayLog = [`🌙 Round ${room.roundNumber} - Night falls again. Close your eyes.`];
    room.nightActions = { mafiaTarget: null, mafiaVotes: {}, detectiveCheck: null, doctorTarget: null };
    room.players.forEach(p => { p.votedFor = null; p.isProtected = false; });

    const isMafiaAlive = room.players.some(p => p.role === 'MAFIA' && p.alive);
    if (isMafiaAlive) {
      room.nightTurn = 'MAFIA_TURN';
      room.timer = 30;
      startTimer(code, 30, () => advanceNightTurn(code));
    } else {
      room.nightTurn = 'DOCTOR_TURN';
      const isDoctorAlive = room.players.some(p => p.role === 'DOCTOR' && p.alive);
      if (isDoctorAlive) {
        room.timer = 25;
        startTimer(code, 25, () => advanceNightTurn(code));
      } else {
        advanceNightTurn(code);
        if (callback) callback({ status: 'ok' });
        broadcastRoomUpdate(code);
        return;
      }
    }

    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('restart_game', ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room || socket.id !== room.hostSocketId) { if (callback) callback({ status: 'error', message: 'Unauthorized' }); return; }
    if (room.phase !== 'ENDED') { if (callback) callback({ status: 'error', message: 'Game is not over' }); return; }

    if (roomTimers[code]) { clearInterval(roomTimers[code]); delete roomTimers[code]; }

    const shuffled = [...room.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const mafiaCount = getMafiaCount(shuffled.length);
    let mafiaAssigned = 0, detectiveAssigned = 0, doctorAssigned = 0;

    shuffled.forEach((player) => {
      const rp = room.players.find(p => p.id === player.id);
      if (mafiaAssigned < mafiaCount) { rp.role = 'MAFIA'; mafiaAssigned++; }
      else if (detectiveAssigned < 1) { rp.role = 'DETECTIVE'; detectiveAssigned++; }
      else if (doctorAssigned < 1) { rp.role = 'DOCTOR'; doctorAssigned++; }
      else { rp.role = 'VILLAGER'; }
      rp.alive = true; rp.votedFor = null; rp.hasCheckedRole = false; rp.isProtected = false; rp.eliminatedInRound = null;
    });

    room.phase = 'ROLE_REVEAL';
    room.roundNumber = 1;
    room.dayLog = ['🔄 New game! Check your secret identity.'];
    room.nightActions = { mafiaTarget: null, mafiaVotes: {}, detectiveCheck: null, doctorTarget: null };
    room.nightTurn = null;
    room.announcementText = '';
    room.pendingDeathId = null;
    room.lynchedPlayerId = null;
    room.winner = null;
    room.timer = 0;

    room.players.forEach((player) => io.to(player.id).emit('role_assigned', { role: player.role }));
    if (callback) callback({ status: 'ok' });
    broadcastRoomUpdate(code);
  });

  socket.on('send_message', ({ roomCode, text, type = 'text', audioData, audioDuration }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) { if (callback) callback({ status: 'error', message: 'Room not found' }); return; }
    const player = room.players.find(p => p.id === socket.id);
    const isHostSender = socket.id === room.hostSocketId;
    if (!player && !isHostSender) { if (callback) callback({ status: 'error', message: 'Not authorized' }); return; }

    const canActThisRound = isHostSender || (player && (player.alive || player.eliminatedInRound === room.roundNumber));
    if (!canActThisRound) {
      if (callback) callback({ status: 'error', message: 'You can only view chat in rounds after your elimination.' });
      return;
    }

    if (player && player.alive && room.phase === 'NIGHT' && player.role !== 'MAFIA') { if (callback) callback({ status: 'error', message: 'Chat disabled at night' }); return; }
    const cleanText = text?.trim();
    if (type === 'text' && !cleanText) { if (callback) callback({ status: 'error', message: 'Message cannot be empty' }); return; }

    let channel = 'TOWN';
    if (player && room.phase === 'NIGHT' && player.role === 'MAFIA') channel = 'MAFIA';
    if (player && !canActThisRound) channel = 'DEAD';

    const msgPayload = {
      senderId: socket.id, senderName: isHostSender ? '📢 Host' : player?.name || 'Unknown',
      senderAvatar: isHostSender ? '📢' : player?.avatar || null,
      text: type === 'voice_note' ? '🎤 Voice Note' : cleanText, type,
      audioData: type === 'voice_note' ? audioData : null, audioDuration: audioDuration || 0,
      channel, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (channel === 'TOWN') io.to(code).emit('message_received', msgPayload);
    else if (channel === 'MAFIA') {
      room.players.forEach(p => { if (p.role === 'MAFIA' && p.alive) io.to(p.id).emit('message_received', msgPayload); });
      io.to(room.hostSocketId).emit('message_received', msgPayload);
    } else if (channel === 'DEAD') {
      room.players.forEach(p => { if (!p.alive) io.to(p.id).emit('message_received', msgPayload); });
      io.to(room.hostSocketId).emit('message_received', msgPayload);
    }
    if (callback) callback({ status: 'ok' });
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (!room) continue;
      if (room.hostSocketId === socket.id) {
        const alivePlayers = room.players.filter(p => p.alive);
        if (alivePlayers.length > 0 && room.phase !== 'LOBBY') {
          room.hostSocketId = alivePlayers[0].id;
          const newHost = room.players.find(p => p.id === alivePlayers[0].id);
          io.to(alivePlayers[0].id).emit('host_migrated', { newHostId: alivePlayers[0].id });
          io.to(roomCode).emit('message_received', {
            senderId: 'system', senderName: 'System',
            text: `👑 Host disconnected. ${newHost?.name || 'A player'} is the new host.`,
            type: 'system', channel: 'TOWN',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          broadcastRoomUpdate(roomCode);
        } else {
          if (roomTimers[roomCode]) { clearInterval(roomTimers[roomCode]); delete roomTimers[roomCode]; }
          io.to(roomCode).emit('room_closed', { message: 'Host disconnected' });
          delete rooms[roomCode];
        }
      } else {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const player = room.players[playerIndex];
          const playerName = player.name;
          if (room.phase === 'LOBBY') {
            room.players.splice(playerIndex, 1);
            broadcastRoomUpdate(roomCode);
          } else if (room.phase === 'ENDED') {
            room.players.splice(playerIndex, 1);
            io.to(roomCode).emit('message_received', {
              senderId: 'system', senderName: 'System',
              text: `🚪 ${playerName} left the room.`,
              type: 'system', channel: 'TOWN',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            broadcastRoomUpdate(roomCode);
          } else {
            if (player.alive) {
              player.alive = false;
              player.eliminatedInRound = room.roundNumber;
            }
            io.to(roomCode).emit('message_received', {
              senderId: 'system', senderName: 'System',
              text: `🚪 ${playerName} has left the game.`,
              type: 'system', channel: 'TOWN',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            checkWinConditions(roomCode);
            broadcastRoomUpdate(roomCode);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Shadows Mafia Server running on port ${PORT}`);
});

