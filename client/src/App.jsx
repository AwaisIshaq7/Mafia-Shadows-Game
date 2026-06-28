import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// ========================================================
// SOUND MANAGER (Web Audio API synthesized effects)
// ========================================================
const soundManager = {
  _ctx: null,
  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  },
  play(type = 'phase') {
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'phase') {
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'action') {
        osc.frequency.value = 440;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'vote') {
        osc.frequency.value = 880;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (e) { /* silent */ }
  }
};

// ========================================================
// SVG ICONS
// ========================================================
const IconSkull = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a5 5 0 0 0-5 5v3a3 3 0 0 0 1.3 2.5A5 5 0 0 0 7 17v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1a5 5 0 0 0-1.3-4.5A3 3 0 0 0 17 10V7a5 5 0 0 0-5-5z" />
    <circle cx="9" cy="10" r="1" fill="currentColor" />
    <circle cx="15" cy="10" r="1" fill="currentColor" />
    <path d="M10 16h4M10 19v-2M12 19v-2M14 19v-2" />
  </svg>
);

const IconMagnifier = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const IconShield = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconShieldPlus = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconEye = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconWinner = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
    <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
  </svg>
);

// ========================================================
// TIMER BAR COMPONENT
// ========================================================
const TimerBar = React.memo(({ current, total = 60 }) => {
  const pct = total > 0 ? Math.min(current, total) / total : 0;
  const urgent = current <= 10;
  const caution = current <= 20 && !urgent;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '140px' }}>
      <div className="timer-bar" style={{ flex: 1 }}>
        <div
          className={`timer-bar-fill ${urgent ? 'urgent' : caution ? 'caution' : ''}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className={`timer-text ${urgent ? 'urgent' : ''}`}>{current}s</span>
    </div>
  );
});

// ========================================================
// ROLE REVEAL CARD COMPONENT
// ========================================================
const RoleRevealCard = React.memo(({ role, revealed, onToggle, getRoleBgColor, getRoleBorderColor, getRoleTextColor, getRoleIcon, getRoleDescription }) => (
  <div className={`flip-wrap ${revealed ? 'flipped' : ''}`} onClick={onToggle}>
    <div className="flip-inner">
      <div className="flip-front">
        <IconEye size={32} />
        <h4 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px' }}>Secret Identity</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tap to reveal</p>
      </div>
      <div className="flip-back" style={{ background: getRoleBgColor(role), borderColor: getRoleBorderColor(role) }}>
        <div style={{ color: getRoleTextColor(role) }}>{getRoleIcon(role)}</div>
        <h3 style={{ fontSize: '24px', textTransform: 'uppercase', color: getRoleTextColor(role) }}>{role}</h3>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{getRoleDescription(role)}</p>
      </div>
    </div>
  </div>
));

// ========================================================
// VOICE NOTE PLAYER COMPONENT
// ========================================================
const VoiceNotePlayer = React.memo(({ msg, playingId, progress, onPlayToggle }) => {
  const isPlaying = playingId === (msg.timestamp + msg.senderId);
  return (
    <div className="voice-note-card" onClick={() => onPlayToggle(msg)}>
      <div className="voice-note-play-btn">{isPlaying ? '⏸' : '▶'}</div>
      <div className="voice-note-track">
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          {isPlaying ? 'Playing...' : 'Voice Note'}
        </span>
        <div className="voice-note-progress-bar">
          <div className="voice-note-progress-fill" style={{ width: isPlaying ? `${progress}%` : '0%' }} />
        </div>
      </div>
    </div>
  );
});

// ========================================================
// MAIN APP COMPONENT
// ========================================================
function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinedPlayer, setJoinedPlayer] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHostLogin, setShowHostLogin] = useState(false);
  const [hostPassword, setHostPassword] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  
  // Game State
  const [myRole, setMyRole] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [timer, setTimer] = useState(0);
  const [voteTally, setVoteTally] = useState({});
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [detectiveResult, setDetectiveResult] = useState(null);
  const [votedTarget, setVotedTarget] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [announcementInput, setAnnouncementInput] = useState('');

  // Chat States
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);

  // Voice Note States
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoiceNoteId, setPlayingVoiceNoteId] = useState(null);
  const [voiceNoteProgress, setVoiceNoteProgress] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const currentAudioRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const chatEndRef = useRef(null);
  const chatAreaRef = useRef(null);
  const [chatScrolledUp, setChatScrolledUp] = useState(false);

  // ========================================================
  // RESET STATE
  // ========================================================
  const resetState = useCallback(() => {
    setRoom(null);
    setIsHost(false);
    setJoinedPlayer(null);
    setErrorMessage('');
    setMyRole(null);
    setRoleRevealed(false);
    setTimer(0);
    setVoteTally({});
    setSelectedTarget(null);
    setDetectiveResult(null);
    setVotedTarget(null);
    setGameOverData(null);
    setMessages([]);
    setAnnouncementInput('');
    setPlayingVoiceNoteId(null);
    setVoiceNoteProgress(0);
  }, []);

  // ========================================================
  // VOICE NOTE RECORDING FUNCTIONS
  // ========================================================
  const stopRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const options = MediaRecorder.isTypeSupported('audio/webm') 
        ? { mimeType: 'audio/webm' }
        : {};

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Data = reader.result.split(',')[1];
          if (base64Data && room && socket) {
            socket.emit('send_message', {
              roomCode: room.code,
              type: 'voice_note',
              audioData: base64Data,
              audioDuration: recordingTime
            });
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 14) {
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Recording error:', err);
      alert('Microphone access is required for voice notes.');
    }
  }, [room, socket, recordingTime, stopRecording]);

  const handleTogglePlayVoiceNote = useCallback((msg) => {
    const uniqueId = msg.timestamp + msg.senderId;

    if (playingVoiceNoteId === uniqueId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      setPlayingVoiceNoteId(null);
      setVoiceNoteProgress(0);
    } else {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      const audio = new Audio("data:audio/webm;base64," + msg.audioData);
      currentAudioRef.current = audio;
      setPlayingVoiceNoteId(uniqueId);
      setVoiceNoteProgress(0);

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setVoiceNoteProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.onended = () => {
        setPlayingVoiceNoteId(null);
        setVoiceNoteProgress(0);
      };

      audio.play().catch(console.error);
    }
  }, [playingVoiceNoteId]);

  // ========================================================
  // SOCKET CONNECTION
  // ========================================================
 // ========================================================
// SOCKET CONNECTION
// ========================================================
useEffect(() => {
  let isMounted = true;
  
  const newSocket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  newSocket.on('connect', () => {
    console.log('Connected to server');
    if (isMounted) {
      setConnected(true);
      setIsLoading(false);
      reconnectAttemptsRef.current = 0;
      const storedPlayerId = sessionStorage.getItem('shadows_playerId');
      const storedRoomCode = sessionStorage.getItem('shadows_roomCode');
      if (storedPlayerId && storedRoomCode) {
        newSocket.emit('reconnect_player', { roomCode: storedRoomCode, playerId: storedPlayerId }, (res) => {
          if (res?.status === 'ok') {
            const me = res.player;
            setJoinedPlayer(me);
            setRoom(prev => prev);
            if (res.role) setMyRole(res.role);
          } else {
            sessionStorage.removeItem('shadows_playerId');
            sessionStorage.removeItem('shadows_roomCode');
          }
        });
      }
    }
  });

  newSocket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    if (isMounted) {
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current >= 3) {
        setErrorMessage('Failed to connect to server.');
        setIsLoading(false);
      }
    }
  });

  newSocket.on('disconnect', () => {
    console.log('Disconnected from server');
    if (isMounted) {
      setConnected(false);
    }
  });

  // Store socket in a ref instead of state
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setSocket(newSocket);

  return () => {
    isMounted = false;
    newSocket.close();
  };
}, []);

  // ========================================================
  // GAME EVENTS
  // ========================================================
  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdate = (updatedRoom) => {
      setRoom(prev => {
        if (prev && prev.phase !== updatedRoom.phase) {
          setSelectedTarget(null);
          setVotedTarget(null);
          soundManager.play(updatedRoom.phase === 'ENDED' ? 'win' : updatedRoom.phase === 'VOTING' ? 'vote' : 'phase');
          if (updatedRoom.phase === 'NIGHT') setDetectiveResult(null);
          if (updatedRoom.phase === 'VOTING') setVoteTally({});
          if (updatedRoom.phase === 'LOBBY') {
            setGameOverData(null);
            setMyRole(null);
            setMessages([]);
          }
          if (updatedRoom.phase === 'NIGHT_RESOLVED') {
            setAnnouncementInput(updatedRoom.announcementText || '');
          }
        }
        if (prev && prev.nightTurn !== updatedRoom.nightTurn) {
          setSelectedTarget(null);
        }
        return updatedRoom;
      });

      if (updatedRoom.timer !== undefined) setTimer(updatedRoom.timer);

      const me = updatedRoom.players?.find(p => p.id === socket.id);
      if (me) setJoinedPlayer(me);
    };

    const handleRoleAssigned = ({ role }) => {
      setMyRole(role);
      setRoleRevealed(false);
      setDetectiveResult(null);
      setVotedTarget(null);
    };

    const handleTimerUpdate = ({ timer }) => setTimer(timer);
    const handleVoteTally = ({ tally }) => setVoteTally(tally);
    const handleGameOver = (data) => setGameOverData(data);

    const handleRoomClosed = (data) => {
      alert(data.message || 'Room closed.');
      resetState();
    };

    const handleMessageReceived = (message) => {
      setMessages(prev => [...prev, message]);
    };

    const handleHostMigrated = ({ newHostId }) => {
      if (newHostId === socket.id) {
        setIsHost(true);
      }
    };

    socket.on('room_update', handleRoomUpdate);
    socket.on('role_assigned', handleRoleAssigned);
    socket.on('timer_update', handleTimerUpdate);
    socket.on('vote_tally', handleVoteTally);
    socket.on('game_over', handleGameOver);
    socket.on('room_closed', handleRoomClosed);
    socket.on('message_received', handleMessageReceived);
    socket.on('host_migrated', handleHostMigrated);

    return () => {
      socket.off('room_update');
      socket.off('role_assigned');
      socket.off('timer_update');
      socket.off('vote_tally');
      socket.off('game_over');
      socket.off('room_closed');
      socket.off('message_received');
      socket.off('host_migrated');
    };
  }, [socket, resetState]);

  // ========================================================
  // SPLASH SCREEN AUTO-DISMISS
  // ========================================================
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => setShowSplash(false), 3200);
    return () => clearTimeout(timer);
  }, [showSplash]);

  // ========================================================
  // CHAT AUTO-SCROLL
  // ========================================================
  useEffect(() => {
    if (chatEndRef.current && !chatScrolledUp) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, chatScrolledUp]);

  const handleChatScroll = useCallback(() => {
    const el = chatAreaRef.current;
    if (el) {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setChatScrolledUp(!isAtBottom);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setChatScrolledUp(false);
    }
  }, []);

  // ========================================================
  // ROLE HELPERS
  // ========================================================
  const roleHelpers = useMemo(() => ({
    getRoleBgColor: (role) => {
      if (role === 'MAFIA') return 'linear-gradient(135deg, #1a0a0a, #2d0a0a)';
      if (role === 'DETECTIVE') return 'linear-gradient(135deg, #0a1a2a, #0a2a3a)';
      if (role === 'DOCTOR') return 'linear-gradient(135deg, #0a1a1a, #0a2a2a)';
      return 'linear-gradient(135deg, #0a1a0a, #0a2a0a)';
    },
    getRoleBorderColor: (role) => {
      if (role === 'MAFIA') return 'rgba(239,68,68,0.4)';
      if (role === 'DETECTIVE') return 'rgba(6,182,212,0.4)';
      if (role === 'DOCTOR') return 'rgba(20,184,166,0.4)';
      return 'rgba(34,197,94,0.4)';
    },
    getRoleTextColor: (role) => {
      if (role === 'MAFIA') return '#ef4444';
      if (role === 'DETECTIVE') return '#06b6d4';
      if (role === 'DOCTOR') return '#14b8a6';
      return '#22c55e';
    },
    getRoleIcon: (role) => {
      if (role === 'MAFIA') return <IconSkull size={34} />;
      if (role === 'DETECTIVE') return <IconMagnifier size={34} />;
      if (role === 'DOCTOR') return <IconShieldPlus size={34} />;
      return <IconShield size={34} />;
    },
    getRoleDescription: (role) => {
      if (role === 'MAFIA') return 'Eliminate villagers during the night. Coordinate with your team.';
      if (role === 'DETECTIVE') return 'Investigate one player each night to find the Mafia.';
      if (role === 'DOCTOR') return 'Protect one player each night from the Mafia.';
      return 'Use your deduction skills to identify and vote out the Mafia.';
    }
  }), []);

  // ========================================================
  // FILTERED MESSAGES & CHANNEL
  // ========================================================
  const effectiveChannel = useMemo(() => {
    if (!room) return 'TOWN';
    if (joinedPlayer && !joinedPlayer.alive) return 'DEAD';
    if (room.phase === 'NIGHT' && myRole === 'MAFIA') return 'MAFIA';
    return 'TOWN';
  }, [room, joinedPlayer, myRole]);

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (effectiveChannel === 'MAFIA') return msg.channel === 'MAFIA';
      if (effectiveChannel === 'DEAD') return msg.channel === 'DEAD';
      return msg.channel === 'TOWN';
    });
  }, [messages, effectiveChannel]);

  // ========================================================
  // ROOM ACTIONS
  // ========================================================
  const handleCreateRoom = useCallback((password = '') => {
    if (!socket) return;
    setErrorMessage('');
    setIsLoading(true);
    socket.emit('create_room', { hostPassword: password }, (response) => {
      setIsLoading(false);
      if (response?.status === 'ok') {
        setRoom(response.room);
        setIsHost(true);
        setPlayerName(response.hostName || '');
        setShowHostLogin(false);
        setHostPassword('');
        sessionStorage.setItem('shadows_roomCode', response.room.code);
        sessionStorage.removeItem('shadows_playerId');
      } else {
        setErrorMessage(response?.message || 'Failed to create room.');
      }
    });
  }, [socket]);

  const handleJoinRoom = useCallback((e) => {
    e.preventDefault();
    if (!socket) return;
    if (!playerName.trim()) {
      setErrorMessage('Please enter a name.');
      return;
    }
    if (!roomCodeInput.trim() || roomCodeInput.length !== 4) {
      setErrorMessage('Enter a valid 4-letter room code.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);
    socket.emit('join_room', {
      roomCode: roomCodeInput.trim().toUpperCase(),
      name: playerName.trim()
    }, (response) => {
      setIsLoading(false);
      if (response?.status === 'ok') {
        setJoinedPlayer(response.player);
        setIsHost(false);
        if (response.playerId) sessionStorage.setItem('shadows_playerId', response.playerId);
        sessionStorage.setItem('shadows_roomCode', roomCodeInput.trim().toUpperCase());
      } else {
        setErrorMessage(response?.message || 'Failed to join room.');
      }
    });
  }, [socket, playerName, roomCodeInput]);

  const handleLeaveRoom = useCallback(() => {
    if (socket && room) {
      socket.emit('leave_room', { roomCode: room.code });
    }
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
    sessionStorage.removeItem('shadows_playerId');
    sessionStorage.removeItem('shadows_roomCode');
    resetState();
  }, [socket, room, resetState]);

  // ========================================================
  // HOST ACTIONS
  // ========================================================
  const handleStartGame = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('start_game', { roomCode: room.code }, (res) => {
      if (res?.status !== 'ok') {
        setErrorMessage(res?.message || 'Failed to start game.');
      }
    });
  }, [socket, room]);

  const handleHostStartNight = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_start_night', { roomCode: room.code });
  }, [socket, room]);

  const handleHostResolveNight = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_resolve_night', { roomCode: room.code });
  }, [socket, room]);

  const handleHostPostAnnouncement = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_post_announcement', {
      roomCode: room.code,
      announcementText: announcementInput
    });
  }, [socket, room, announcementInput]);

  const handleHostResolveVoting = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_resolve_voting', { roomCode: room.code });
  }, [socket, room]);

  const handleHostConfirmLynch = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_confirm_lynch', { roomCode: room.code });
  }, [socket, room]);

  const handleHostStartNextNight = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('host_start_next_night', { roomCode: room.code });
  }, [socket, room]);

  const handleSkipTimer = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('start_voting', { roomCode: room.code });
  }, [socket, room]);

  const handleRestartGame = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('restart_game', { roomCode: room.code }, (res) => {
      if (res?.status !== 'ok') setErrorMessage(res?.message || 'Failed to restart.');
    });
  }, [socket, room]);

  // ========================================================
  // PLAYER ACTIONS
  // ========================================================
  const handleConfirmRoleChecked = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('confirm_role_checked', { roomCode: room.code });
  }, [socket, room]);

  const handleNightAction = useCallback(() => {
    if (!socket || !room || !selectedTarget) return;
    socket.emit('night_action', {
      roomCode: room.code,
      type: myRole,
      targetId: selectedTarget
    }, (response) => {
      if (response?.status === 'ok') {
        if (myRole === 'DETECTIVE') {
          const targetName = room.players.find(p => p.id === selectedTarget)?.name || 'Unknown';
          setDetectiveResult({ name: targetName, isMafia: response.isMafia });
        }
      } else {
        alert(response?.message || 'Action failed.');
      }
    });
  }, [socket, room, selectedTarget, myRole]);

  const handleCastVote = useCallback((targetId) => {
    if (!socket || !room) return;
    socket.emit('cast_vote', {
      roomCode: room.code,
      targetId: targetId
    }, (response) => {
      if (response?.status === 'ok') {
        setVotedTarget(targetId);
      } else {
        alert(response?.message || 'Vote failed.');
      }
    });
  }, [socket, room]);

  const handleSendMessage = useCallback((e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket || !room) return;
    socket.emit('send_message', {
      roomCode: room.code,
      text: chatInput.trim()
    }, (res) => {
      if (res?.status === 'ok') {
        setChatInput('');
      } else {
        alert(res?.message || 'Failed to send message.');
      }
    });
  }, [chatInput, socket, room]);

  // ========================================================
  // RENDER SPLASH SCREEN
  // ========================================================
  const renderSplashScreen = () => (
    <div className="splash-overlay" onClick={() => setShowSplash(false)}>
      <div className="splash-content">
        <div className="splash-icon">🎭</div>
        <h1 className="splash-title">Shadows<span>.</span></h1>
        <p className="splash-tagline">A Game of Secrets &amp; Betrayal</p>
        <div className="splash-loader">
          <div className="splash-loader-dot" />
          <div className="splash-loader-dot" />
          <div className="splash-loader-dot" />
        </div>
        <p className="splash-hint">Tap anywhere to begin</p>
      </div>
    </div>
  );

  // ========================================================
  // RENDER LOBBY
  // ========================================================
  const renderLobby = () => (
    <div className="center-view anim-fade-up">
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎭</div>
        <h1 className="site-logo" style={{ fontSize: '32px', marginBottom: '4px' }}>
          Shadows<span>.</span>
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-soft)', letterSpacing: '2px', textTransform: 'uppercase' }}>
          A Game of Secrets &amp; Betrayal
        </p>
      </div>
      <div className="card">
        <h2 style={{ fontSize: '16px', textAlign: 'center', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-soft)' }}>
          Join the Shadows
        </h2>
        
        <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label className="field-label">Your Alias</label>
            <input
              type="text"
              maxLength={15}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your alias"
              className="field-input"
              required
              disabled={isLoading}
            />
          </div>

          <div className="field">
            <label className="field-label">Room Code</label>
            <input
              type="text"
              maxLength={4}
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="field-input code-input"
              required
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={!connected || isLoading}>
            {isLoading ? 'Entering...' : 'Enter Room'}
          </button>
        </form>

        <div className="divider" style={{ margin: '18px 0' }}>or</div>

        <button 
          onClick={() => setShowHostLogin(true)} 
          className="btn btn-gold btn-full" 
          disabled={!connected || isLoading}
        >
          {isLoading ? 'Creating...' : 'Host a Game'}
        </button>

        {showHostLogin && (
          <div className="modal-backdrop" onClick={() => { setShowHostLogin(false); setHostPassword(''); }}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => { setShowHostLogin(false); setHostPassword(''); }}>
                ✕
              </button>
              <div className="modal-icon">🎭</div>
              <h2 className="modal-title">Host Authentication</h2>
              <p className="modal-subtitle">Enter the host password to create a game room</p>
              <div className="field" style={{ marginTop: '20px' }}>
                <label className="field-label">Host Password</label>
                <input
                  type="password"
                  value={hostPassword}
                  onChange={(e) => setHostPassword(e.target.value)}
                  placeholder="Enter host password"
                  className="field-input"
                  autoFocus
                  disabled={isLoading}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRoom(hostPassword); }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => handleCreateRoom(hostPassword)} className="btn btn-gold btn-full" disabled={!hostPassword || isLoading} style={{ flex: 1 }}>
                  {isLoading ? 'Authenticating...' : 'Authenticate'}
                </button>
                <button onClick={() => { setShowHostLogin(false); setHostPassword(''); }} className="btn btn-ghost" disabled={isLoading}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ========================================================
  // RENDER HOST VIEW
  // ========================================================
  const renderHostView = () => {
    const { getRoleBgColor, getRoleBorderColor, getRoleTextColor, getRoleIcon } = roleHelpers;

    const getPhaseConfig = () => {
      const configs = {
        LOBBY:         { icon: '🎭', title: 'Game Lobby', subtitle: 'Waiting for players', bannerClass: 'phase-banner-night' },
        ROLE_REVEAL:   { icon: '🎭', title: 'Role Reveal', subtitle: 'Players are checking their identities', bannerClass: 'phase-banner-night' },
        NIGHT:         { icon: '🌙', title: 'Night Phase', subtitle: `It's the ${room.nightTurn?.replace('_', ' ')?.toLowerCase() || 'night'}`, bannerClass: 'phase-banner-night' },
        NIGHT_RESOLVED:{ icon: '📰', title: 'Morning Report', subtitle: 'The night has ended', bannerClass: 'phase-banner-vote' },
        DAY:           { icon: '☀️', title: 'Day Discussion', subtitle: 'Debate and deduce', bannerClass: 'phase-banner-day' },
        VOTING:        { icon: '⚖️', title: 'Voting', subtitle: 'Cast your judgment', bannerClass: 'phase-banner-vote' },
        VOTE_RESOLVED: { icon: '⚖️', title: 'Verdict', subtitle: 'The town has spoken', bannerClass: 'phase-banner-vote' },
        ENDED:         { icon: '🏁', title: 'Game Over', subtitle: 'The shadows have spoken', bannerClass: 'phase-banner-night' }
      };
      return configs[room.phase] || configs.LOBBY;
    };

    const phase = getPhaseConfig();

    const getTimerTotal = () => {
      if (room.phase === 'NIGHT') return room.nightTurn === 'MAFIA_TURN' ? 30 : room.nightTurn === 'DOCTOR_TURN' ? 25 : 25;
      if (room.phase === 'DAY') return 120;
      if (room.phase === 'VOTING') return 45;
      return null;
    };

    const timerTotal = getTimerTotal();

    return (
      <div className="host-view anim-phase" key={room.phase + (room.nightTurn || '')}>
        {/* Phase Banner */}
        <div className={`phase-banner ${phase.bannerClass}`}>
          <span className="phase-banner-icon">{phase.icon}</span>
          <div className="phase-banner-title">{phase.title}</div>
          <div className="phase-banner-subtitle">{phase.subtitle}</div>
          {timerTotal !== null && (
            <div style={{ marginTop: '12px', maxWidth: '300px', marginLeft: 'auto', marginRight: 'auto' }}>
              <TimerBar current={timer} total={timerTotal} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '12px' }}>
            <span className="badge badge-crimson">Host</span>
            <span className="badge badge-gold">{room.code}</span>
            <button onClick={handleLeaveRoom} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '9px' }}>Leave</button>
          </div>
        </div>

        {/* LOBBY */}
        {room.phase === 'LOBBY' && (
            <div className="host-grid">
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  Instructions
                </p>
                <div className="instructions-container">
                  <div className="instruction-step">
                    <div className="step-number">1</div>
                    <div className="step-text">Share the room code with players</div>
                  </div>
                  <div className="instruction-step">
                    <div className="step-number">2</div>
                    <div className="step-text">Players join with their names</div>
                  </div>
                  <div className="instruction-step">
                    <div className="step-number">3</div>
                    <div className="step-text">Start when you have 3+ players</div>
                  </div>
                </div>
                <div className="code-container">
                  {room.code.split('').map((char, i) => (
                    <div key={i} className="code-tile anim-scale-in" style={{ animationDelay: `${i * 0.1}s` }}>
                      {char}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <h3 style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Players</h3>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge badge-emerald">{room.players.filter(p => p.alive !== false).length} alive</span>
                    <span className="badge badge-ghost">{room.players.length} total</span>
                  </div>
                </div>
                <div className="roster-grid">
                  {(() => {
                    const slots = Math.max(6, room.players.length);
                    const items = [];
                    for (let i = 0; i < slots; i++) {
                      if (i < room.players.length) {
                        const p = room.players[i];
                        const isAlive = p.alive !== false;
                        items.push(
                          <div key={p.id} className={`slot-card filled`} style={!isAlive ? { opacity: 0.5 } : {}}>
                            <div className="slot-avatar" style={!isAlive ? { background: 'rgba(225,29,72,0.3)' } : {}}>
                              {isAlive ? p.name[0].toUpperCase() : '💀'}
                            </div>
                            <span className="slot-name">{p.name}</span>
                          </div>
                        );
                      } else {
                        items.push(
                          <div key={`empty-${i}`} className="slot-card empty">
                            <div className="slot-avatar">?</div>
                            <span className="slot-name">Waiting...</span>
                          </div>
                        );
                      }
                    }
                    return items;
                  })()}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={handleStartGame}
                  className={`btn ${room.players.length >= 3 ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={room.players.length < 3}
                >
                  {room.players.length >= 3 ? 'Start Game' : `Need ${3 - room.players.length} more players`}
                </button>
              </div>
            </div>
          )}

          {/* ROLE_REVEAL */}
          {room.phase === 'ROLE_REVEAL' && (
            <div className="host-grid">
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--accent-cyan)' }}>Role Verification</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Players are checking their roles. Wait for all confirmations.
                </p>
                <div className="host-action-list">
                  {room.players.map(p => (
                    <div key={p.id} className={`host-action-item ${p.hasCheckedRole ? 'done' : 'active'}`}>
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`role-tag ${p.role?.toLowerCase() || 'villager'}`}>
                          {p.role || '?'}
                        </span>
                        {p.hasCheckedRole ? (
                          <span className="badge checked-badge">Checked</span>
                        ) : (
                          <span className="badge pending-badge">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={handleHostStartNight} className="btn btn-primary" style={{ marginTop: '16px' }}>
                  Start Night
                </button>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Roles</h3>
                {room.players.map(p => (
                  <div key={p.id} className="player-chip" style={{ marginBottom: '8px' }}>
                    <div className="player-avatar">{p.name[0].toUpperCase()}</div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className={`role-tag ${p.role?.toLowerCase() || 'villager'}`} style={{ marginLeft: 'auto' }}>
                      {p.role || '?'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NIGHT */}
          {room.phase === 'NIGHT' && (
            <div className="host-grid">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '18px', color: 'var(--accent-red)' }}>
                    {room.nightTurn === 'MAFIA_TURN' && '🔪 Mafia Turn'}
                    {room.nightTurn === 'DOCTOR_TURN' && '🛡️ Doctor Turn'}
                    {room.nightTurn === 'DETECTIVE_TURN' && '🔎 Detective Turn'}
                  </h3>
                  <span className={`badge ${room.nightTurn === 'MAFIA_TURN' ? 'badge-crimson' : room.nightTurn === 'DOCTOR_TURN' ? 'badge-teal' : 'badge-cyan'}`}>
                    ACTIVE
                  </span>
                </div>
                {/* Turn order indicator */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                  {[
                    { label: '🔪 Mafia', key: 'MAFIA_TURN', color: 'var(--accent-text)' },
                    { label: '🛡️ Doctor', key: 'DOCTOR_TURN', color: '#5eead4' },
                    { label: '🔎 Detective', key: 'DETECTIVE_TURN', color: '#67e8f9' }
                  ].map((step, i) => (
                    <React.Fragment key={step.key}>
                      {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>⟶</span>}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '6px',
                        background: room.nightTurn === step.key ? 'rgba(225,29,72,0.08)' : 'transparent',
                        border: `1px solid ${room.nightTurn === step.key ? 'rgba(225,29,72,0.2)' : 'transparent'}`,
                        opacity: (() => {
                          const order = ['MAFIA_TURN', 'DOCTOR_TURN', 'DETECTIVE_TURN'];
                          const currentIdx = order.indexOf(room.nightTurn);
                          const stepIdx = order.indexOf(step.key);
                          return stepIdx < currentIdx ? 0.4 : stepIdx === currentIdx ? 1 : 0.6;
                        })()
                      }}>
                        <span style={{ fontSize: '10px' }}>{step.label}</span>
                        {room.nightTurn === step.key && <span style={{ fontSize: '9px', color: 'var(--accent-text)' }}>◀</span>}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  {room.nightTurn === 'MAFIA_TURN' && 'The Mafia is choosing their victim...'}
                  {room.nightTurn === 'DOCTOR_TURN' && 'The Doctor is deciding who to save...'}
                  {room.nightTurn === 'DETECTIVE_TURN' && 'The Detective is investigating a suspect...'}
                </p>
                <div className="host-action-list">
                  {room.players.map(p => {
                    let actionText = '💤 Sleeping';
                    let isDone = false;
                    let isCurrentActor = false;

                    if (!p.alive) {
                      actionText = '💀 Dead';
                    } else if (p.role === 'MAFIA') {
                      const target = room.players.find(pl => pl.id === room.nightActions?.mafiaTarget);
                      actionText = target ? `🎯 Targeted: ${target.name}` : (room.nightTurn === 'MAFIA_TURN' ? '⏳ Choosing...' : '⏳ Waiting');
                      isDone = !!target;
                      isCurrentActor = room.nightTurn === 'MAFIA_TURN';
                    } else if (p.role === 'DETECTIVE') {
                      const target = room.players.find(pl => pl.id === room.nightActions?.detectiveCheck);
                      actionText = target ? `🔎 Investigated: ${target.name}` : (room.nightTurn === 'DETECTIVE_TURN' ? '⏳ Investigating...' : '⏳ Waiting');
                      isDone = !!target;
                      isCurrentActor = room.nightTurn === 'DETECTIVE_TURN';
                    } else if (p.role === 'DOCTOR') {
                      const target = room.players.find(pl => pl.id === room.nightActions?.doctorTarget);
                      actionText = target ? `🛡️ Saved: ${target.name}` : (room.nightTurn === 'DOCTOR_TURN' ? '⏳ Choosing...' : '⏳ Waiting');
                      isDone = !!target;
                      isCurrentActor = room.nightTurn === 'DOCTOR_TURN';
                    }

                    return (
                      <div key={p.id} className={`host-action-item ${!p.alive ? 'dead' : isDone ? 'done' : isCurrentActor ? 'active' : ''}`}>
                        <span style={{ fontWeight: 700 }}>{p.name}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className={`role-tag ${p.role?.toLowerCase() || 'villager'}`}>
                            {p.role || '?'}
                          </span>
                          <span className={`badge ${!p.alive ? 'badge-crimson' : isDone ? 'badge-emerald' : isCurrentActor ? 'badge-amber' : 'badge-ghost'}`}>
                            {actionText}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={handleHostResolveNight} className="btn btn-primary" style={{ marginTop: '16px' }}>
                  Skip to Morning
                </button>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Night Log</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="player-chip" style={{ borderColor: room.nightActions?.mafiaTarget ? 'var(--accent-red)' : 'var(--border-color)' }}>
                    <IconSkull size={20} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Mafia</span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {room.nightActions?.mafiaTarget
                        ? room.players.find(p => p.id === room.nightActions.mafiaTarget)?.name || 'Unknown'
                        : '⏳ Pending'}
                    </span>
                  </div>
                  <div className="player-chip" style={{ borderColor: room.nightActions?.doctorTarget ? 'var(--accent-teal)' : 'var(--border-color)' }}>
                    <IconShieldPlus size={20} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Doctor</span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {room.nightActions?.doctorTarget
                        ? room.players.find(p => p.id === room.nightActions.doctorTarget)?.name || 'Unknown'
                        : '⏳ Pending'}
                    </span>
                  </div>
                  <div className="player-chip" style={{ borderColor: room.nightActions?.detectiveCheck ? 'var(--accent-cyan)' : 'var(--border-color)' }}>
                    <IconMagnifier size={20} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Detective</span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {room.nightActions?.detectiveCheck
                        ? room.players.find(p => p.id === room.nightActions.detectiveCheck)?.name || 'Unknown'
                        : '⏳ Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Host's personal night action */}
          {room.phase === 'NIGHT' && myRole && myRole !== 'VILLAGER' && joinedPlayer?.alive && (() => {
            const isMyTurn =
              (room.nightTurn === 'MAFIA_TURN' && myRole === 'MAFIA') ||
              (room.nightTurn === 'DOCTOR_TURN' && myRole === 'DOCTOR') ||
              (room.nightTurn === 'DETECTIVE_TURN' && myRole === 'DETECTIVE');

            const hasActedThisNight =
              (myRole === 'MAFIA' && room.nightActions?.mafiaTarget !== null) ||
              (myRole === 'DETECTIVE' && room.nightActions?.detectiveCheck !== null) ||
              (myRole === 'DOCTOR' && room.nightActions?.doctorTarget !== null);

            if (hasActedThisNight) {
              return myRole === 'DETECTIVE' && detectiveResult ? (
                <div className="card" style={{ marginTop: '24px', background: detectiveResult.isMafia ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.08)', borderColor: detectiveResult.isMafia ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '4px' }}>{detectiveResult.isMafia ? '👿' : '✅'}</div>
                    <h4>{detectiveResult.name} is {detectiveResult.isMafia ? 'MAFIA' : 'CLEAN'}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Investigation complete — use this info during discussion.</p>
                  </div>
                </div>
              ) : null;
            }

            if (!isMyTurn) return null;

            return (
              <div className="card" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span className={`badge ${myRole === 'MAFIA' ? 'badge-crimson' : myRole === 'DETECTIVE' ? 'badge-cyan' : 'badge-teal'}`} style={{ animation: 'glowPulse 2s ease-in-out infinite', fontSize: '14px', padding: '6px 16px' }}>
                    YOUR ACTION
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {myRole === 'MAFIA' && 'Choose a target to eliminate'}
                    {myRole === 'DETECTIVE' && 'Select a suspect to investigate'}
                    {myRole === 'DOCTOR' && 'Choose a player to protect'}
                  </span>
                </div>
                {myRole === 'MAFIA' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                      {room.players.filter(p => p.id !== joinedPlayer?.id && p.alive).map(p => (
                        <button key={p.id} onClick={() => setSelectedTarget(p.id)} className={`target-btn ${selectedTarget === p.id ? 'active-danger' : ''}`}>
                          <div className="target-btn-icon">🎯</div>
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-danger btn-full">Eliminate Target</button>
                  </div>
                )}
                {myRole === 'DETECTIVE' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                      {room.players.filter(p => p.id !== joinedPlayer?.id && p.alive).map(p => (
                        <button key={p.id} onClick={() => setSelectedTarget(p.id)} className={`target-btn ${selectedTarget === p.id ? 'active-cyan' : ''}`}>
                          <div className="target-btn-icon">🔎</div>
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-cyan btn-full">Investigate</button>
                  </div>
                )}
                {myRole === 'DOCTOR' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                      {room.players.filter(p => p.alive).map(p => (
                        <button key={p.id} onClick={() => setSelectedTarget(p.id)} className={`target-btn ${selectedTarget === p.id ? 'active-teal' : ''}`}>
                          <div className="target-btn-icon">🛡️</div>
                          <span>{p.name} {p.id === joinedPlayer?.id && '(You)'}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-teal btn-full">Protect</button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* NIGHT_RESOLVED */}
          {room.phase === 'NIGHT_RESOLVED' && (
            <div className="host-grid">
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--accent-purple)' }}>Morning Report</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Review and broadcast the morning announcement.
                </p>
                <div className="announcement-editor-card">
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Announcement</label>
                  <textarea 
                    value={announcementInput}
                    onChange={(e) => setAnnouncementInput(e.target.value)}
                    className="announcement-textarea"
                    placeholder="Type the morning news report..."
                  />
                </div>
                <button onClick={handleHostPostAnnouncement} className="btn btn-primary" style={{ marginTop: '16px' }}>
                  Broadcast & Start Day
                </button>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Night Recap</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="player-chip">
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Mafia Target</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto', color: 'var(--accent-red)' }}>
                      {room.nightActions?.mafiaTarget 
                        ? room.players.find(p => p.id === room.nightActions.mafiaTarget)?.name 
                        : 'None'}
                    </span>
                  </div>
                  <div className="player-chip">
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Detective Scan</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto', color: 'var(--accent-cyan)' }}>
                      {room.nightActions?.detectiveCheck 
                        ? room.players.find(p => p.id === room.nightActions.detectiveCheck)?.name 
                        : 'None'}
                    </span>
                  </div>
                  <div className="player-chip">
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Doctor Saved</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto', color: 'var(--accent-teal)' }}>
                      {room.nightActions?.doctorTarget 
                        ? room.players.find(p => p.id === room.nightActions.doctorTarget)?.name 
                        : 'None'}
                    </span>
                  </div>
                  <div className="player-chip">
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Casualty</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto', color: 'var(--accent-amber)' }}>
                      {room.pendingDeathId 
                        ? room.players.find(p => p.id === room.pendingDeathId)?.name 
                        : 'No one'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DAY */}
          {room.phase === 'DAY' && (
            <div className="host-grid">
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--accent-cyan)' }}>Daily Dispatch</h3>
                <div className="event-log" style={{ marginBottom: '16px' }}>
                  {room.dayLog?.length > 0 ? (
                    room.dayLog.map((log, i) => (
                      <p key={i} className="event-log-entry">{log}</p>
                    ))
                  ) : (
                    <p className="text-muted">No incidents reported.</p>
                  )}
                </div>
                <button onClick={handleSkipTimer} className="btn btn-primary">
                  Start Voting
                </button>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Alive ({room.players.filter(p => p.alive).length})
                </h3>
                {room.players.map(p => (
                  <div key={p.id} className="player-chip" style={{ opacity: p.alive ? 1 : 0.4, marginBottom: '8px' }}>
                    <div className="player-avatar">{p.alive ? p.name[0].toUpperCase() : '💀'}</div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className="badge" style={{ marginLeft: 'auto' }}>
                      {p.alive ? '✅ Alive' : '💀 Dead'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VOTING */}
          {room.phase === 'VOTING' && (
            <div className="host-grid">
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚖️ Vote Tally</h3>
                {(() => {
                  const tally = room.voteTally || voteTally;
                  const alive = room.players.filter(p => p.alive);
                  const max = Math.max(1, ...Object.values(tally));
                  return alive.map(p => {
                    const votes = tally[p.id] || 0;
                    const pct = (votes / max) * 100;
                    return (
                      <div key={p.id} style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          <span style={{ color: votes > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                            {votes} {votes === 1 ? 'vote' : 'votes'}
                          </span>
                        </div>
                        <div className="vote-bar-track">
                          <div className="vote-bar-fill" style={{ width: `${votes > 0 ? pct : 0}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span>Abstain</span>
                  <span>{voteTally['skip'] || 0}</span>
                </div>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.1)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ballots</h3>
                {room.players.filter(p => p.alive).map(p => (
                  <div key={p.id} className="player-chip" style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className="badge" style={{ marginLeft: 'auto' }}>
                      {p.votedFor !== null ? '✅ Voted' : '⏳ Pending'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', gap: '12px' }}>
                <button onClick={handleHostResolveVoting} className="btn btn-danger">
                  Force Resolve
                </button>
              </div>
            </div>
          )}

          {/* VOTE_RESOLVED */}
          {room.phase === 'VOTE_RESOLVED' && (
            <div className="host-grid">
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--accent-amber)' }}>Verdict</h3>
                <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.15)', marginBottom: '16px' }}>
                  {room.lynchedPlayerId ? (
                    (() => {
                      const target = room.players.find(p => p.id === room.lynchedPlayerId);
                      return (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Target for Lynch</p>
                          <h2 style={{ fontSize: '32px', color: 'var(--accent-red)', margin: '8px 0' }}>{target?.name}</h2>
                          <button onClick={handleHostConfirmLynch} className="btn btn-danger">
                            Confirm Lynch
                          </button>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <p style={{ fontSize: '18px', color: 'var(--accent-green)' }}>No one was lynched</p>
                      <button onClick={handleHostStartNextNight} className="btn btn-primary" style={{ marginTop: '12px' }}>
                        Next Night
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Final Tally</h3>
                {(() => {
                  const tally = room.voteTally || voteTally;
                  return room.players.filter(p => p.alive).map(p => {
                    const votes = tally[p.id] || 0;
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}>
                        <span>{p.name}</span>
                        <span style={{ color: votes > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{votes}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* ENDED */}
          {room.phase === 'ENDED' && gameOverData && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ color: gameOverData.winner === 'MAFIA' ? 'var(--accent-red)' : 'var(--accent-green)', marginBottom: '8px' }}>
                <IconWinner size={56} />
              </div>
              <h1 style={{ fontSize: '48px', color: gameOverData.winner === 'MAFIA' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {gameOverData.winner === 'MAFIA' ? 'Mafia Wins!' : 'Villagers Win!'}
              </h1>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Game Over - Final Roles Revealed</p>
              <div className="host-grid-3">
                {room.players.map(p => {
                  const role = gameOverData.allRoles[p.id] || 'VILLAGER';
                  return (
                    <div key={p.id} className="result-card" style={{ background: getRoleBgColor(role), borderColor: getRoleBorderColor(role) }}>
                      <div style={{ color: getRoleTextColor(role) }}>{getRoleIcon(role)}</div>
                      <h4 style={{ fontWeight: 800, marginTop: '4px' }}>{p.name}</h4>
                      <span className="badge" style={{ color: getRoleTextColor(role), borderColor: getRoleBorderColor(role) }}>
                        {role}
                      </span>
                      <div style={{ marginTop: '8px' }}>
                        <span className={`badge ${p.alive ? 'badge-emerald' : 'badge-crimson'}`}>
                          {p.alive ? 'Survived' : 'Eliminated'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                <button onClick={handleRestartGame} className="btn btn-cyan">
                  Play Again
                </button>
                <button onClick={handleLeaveRoom} className="btn btn-ghost">
                  Return to Menu
                </button>
              </div>
            </div>
          )}
        </div>
    );
  };

  // ========================================================
  // RENDER PLAYER VIEW
  // ========================================================
  const renderPlayerView = () => {
    const { getRoleBgColor, getRoleBorderColor, getRoleTextColor, getRoleIcon, getRoleDescription } = roleHelpers;

    const getPhaseConfig = () => {
      const roleNightClass = room.phase === 'NIGHT' && joinedPlayer?.alive && myRole
        ? `phase-banner-role-${myRole.toLowerCase()}`
        : '';
      const configs = {
        LOBBY:         { icon: '⏳', title: 'Waiting Room', subtitle: 'The host will start soon', bannerClass: 'phase-banner-night' },
        ROLE_REVEAL:   { icon: '🎭', title: 'Role Reveal', subtitle: 'Tap your card to see your identity', bannerClass: 'phase-banner-night' },
        NIGHT:         { icon: '🌙', title: 'Night Phase', subtitle: 'The shadows are moving...', bannerClass: `phase-banner-night ${roleNightClass}` },
        NIGHT_RESOLVED:{ icon: '📰', title: 'Morning Report', subtitle: 'The host is preparing the report', bannerClass: 'phase-banner-vote' },
        DAY:           { icon: '☀️', title: 'Day Discussion', subtitle: 'Discuss and find the mafia', bannerClass: 'phase-banner-day' },
        VOTING:        { icon: '⚖️', title: 'Voting', subtitle: 'Choose who to banish', bannerClass: 'phase-banner-vote' },
        VOTE_RESOLVED: { icon: '⚖️', title: 'Verdict', subtitle: 'The town has reached a decision', bannerClass: 'phase-banner-vote' },
        ENDED:         { icon: '🏁', title: 'Game Over', subtitle: 'The shadows have spoken', bannerClass: 'phase-banner-night' }
      };
      return configs[room.phase] || configs.LOBBY;
    };

    const phase = getPhaseConfig();

    const getTimerTotal = () => {
      if (room.phase === 'NIGHT') return 30;
      if (room.phase === 'DAY') return 120;
      if (room.phase === 'VOTING') return 45;
      return null;
    };

    const timerTotal = getTimerTotal();

    return (
      <div className="player-view anim-phase" key={room.phase + (room.nightTurn || '')}>
        {/* Phase Banner */}
        <div className={`phase-banner ${phase.bannerClass}`}>
          <span className="phase-banner-icon">{phase.icon}</span>
          <div className="phase-banner-title">{phase.title}</div>
          <div className="phase-banner-subtitle">{phase.subtitle}</div>
          {timerTotal !== null && (
            <div style={{ marginTop: '10px', maxWidth: '280px', marginLeft: 'auto', marginRight: 'auto' }}>
              <TimerBar current={timer} total={timerTotal} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
            <span className={`badge ${joinedPlayer?.alive ? 'badge-emerald' : 'badge-crimson'}`}>
              {joinedPlayer?.alive ? 'Alive' : 'Dead'}
            </span>
            <span className="badge badge-gold">{room.code}</span>
            <span className="badge badge-ghost">{joinedPlayer?.name}</span>
            <button onClick={handleLeaveRoom} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '9px' }}>Exit</button>
          </div>
        </div>

        {/* Dead Overlay */}
        {!joinedPlayer?.alive && room.phase !== 'ENDED' && (
          <div className="card card-sm" style={{ background: 'rgba(225,29,72,0.06)', borderColor: 'rgba(225,29,72,0.15)', marginBottom: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>💀</div>
            <h4 style={{ color: 'var(--accent-text)' }}>You have been eliminated</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-soft)' }}>You can observe but cannot participate.</p>
          </div>
        )}

          {/* LOBBY */}
          {room.phase === 'LOBBY' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏳</div>
              <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Waiting for host</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Room: <strong style={{ color: 'white' }}>{room.code}</strong>
              </p>
              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Players ({room.players.length})</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  {room.players.map(p => (
                    <span key={p.id} className={`badge ${p.id === joinedPlayer?.id ? 'badge-violet' : 'badge-ghost'}`}>
                      {p.name} {p.id === joinedPlayer?.id && '⭐'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ROLE_REVEAL */}
          {room.phase === 'ROLE_REVEAL' && joinedPlayer?.alive && myRole && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <RoleRevealCard
                role={myRole}
                revealed={roleRevealed}
                onToggle={() => setRoleRevealed(!roleRevealed)}
                getRoleBgColor={getRoleBgColor}
                getRoleBorderColor={getRoleBorderColor}
                getRoleTextColor={getRoleTextColor}
                getRoleIcon={getRoleIcon}
                getRoleDescription={getRoleDescription}
              />
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                {(() => {
                  const me = room.players.find(p => p.id === joinedPlayer?.id);
                  if (me?.hasCheckedRole) {
                    return (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '4px' }}>✅</div>
                        <h4 style={{ color: 'var(--accent-green)' }}>Role Confirmed</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Waiting for other players...</p>
                      </div>
                    );
                  }
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Tap the card to reveal your role, then confirm below.
                      </p>
                      <button
                        onClick={handleConfirmRoleChecked}
                        disabled={!roleRevealed}
                        className={`btn ${roleRevealed ? 'btn-primary' : 'btn-ghost'} btn-full`}
                      >
                        {roleRevealed ? '✅ I Have Memorized My Role' : '👆 Reveal Your Card First'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* NIGHT */}
          {room.phase === 'NIGHT' && joinedPlayer?.alive && myRole && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <RoleRevealCard
                role={myRole}
                revealed={roleRevealed}
                onToggle={() => setRoleRevealed(!roleRevealed)}
                getRoleBgColor={getRoleBgColor}
                getRoleBorderColor={getRoleBorderColor}
                getRoleTextColor={getRoleTextColor}
                getRoleIcon={getRoleIcon}
                getRoleDescription={getRoleDescription}
              />
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                {/* Turn order indicator */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', justifyContent: 'center', alignItems: 'center' }}>
                  {[
                    { icon: '🔪', label: 'Mafia', key: 'MAFIA_TURN' },
                    { icon: '🛡️', label: 'Doctor', key: 'DOCTOR_TURN' },
                    { icon: '🔎', label: 'Detective', key: 'DETECTIVE_TURN' }
                  ].map((step, i) => {
                    const order = ['MAFIA_TURN', 'DOCTOR_TURN', 'DETECTIVE_TURN'];
                    const currentIdx = order.indexOf(room.nightTurn);
                    const stepIdx = order.indexOf(step.key);
                    const isPast = stepIdx < currentIdx;
                    const isActive = stepIdx === currentIdx;
                    const isMyStep = (myRole === 'MAFIA' && step.key === 'MAFIA_TURN') ||
                                     (myRole === 'DETECTIVE' && step.key === 'DETECTIVE_TURN') ||
                                     (myRole === 'DOCTOR' && step.key === 'DOCTOR_TURN');
                    return (
                      <React.Fragment key={step.key}>
                        {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>—</span>}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '3px 8px', borderRadius: '5px',
                          fontSize: '10px', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.3px',
                          background: isActive ? 'rgba(225,29,72,0.08)' : 'transparent',
                          border: `1px solid ${isActive ? 'rgba(225,29,72,0.15)' : 'transparent'}`,
                          color: isPast ? 'var(--text-muted)' : isActive ? 'var(--accent-text)' : 'var(--text-soft)',
                          opacity: isPast ? 0.4 : 1
                        }}>
                          <span>{step.icon}</span>
                          <span>{step.label}</span>
                          {isMyStep && <span style={{ fontSize: '8px', marginLeft: '2px' }}>✦</span>}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                {(() => {
                  const isMyTurn =
                    (room.nightTurn === 'MAFIA_TURN' && myRole === 'MAFIA') ||
                    (room.nightTurn === 'DOCTOR_TURN' && myRole === 'DOCTOR') ||
                    (room.nightTurn === 'DETECTIVE_TURN' && myRole === 'DETECTIVE');

                  const hasActedThisNight =
                    (myRole === 'MAFIA' && room.nightActions?.mafiaTarget != null) ||
                    (myRole === 'DETECTIVE' && room.nightActions?.detectiveCheck != null) ||
                    (myRole === 'DOCTOR' && room.nightActions?.doctorTarget != null);

                  const turnMsg =
                    room.nightTurn === 'MAFIA_TURN' ? 'The Mafia is choosing their target...' :
                    room.nightTurn === 'DOCTOR_TURN' ? 'The Doctor is deciding who to save...' :
                    room.nightTurn === 'DETECTIVE_TURN' ? 'The Detective is investigating...' :
                    'The night is dark and full of secrets...';

                  if (myRole === 'VILLAGER') {
                    return (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: '48px', marginBottom: '8px' }}>💤</div>
                        <h4>Sleep through the night</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{turnMsg}</p>
                      </div>
                    );
                  }

                  if (hasActedThisNight) {
                    return (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌙</div>
                        <h4 style={{ marginBottom: '4px' }}>Action Complete</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Waiting for other roles...</p>
                        {myRole === 'DETECTIVE' && detectiveResult && (
                          <div className="card card-sm" style={{ marginTop: '12px', background: detectiveResult.isMafia ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderColor: detectiveResult.isMafia ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                            <p style={{ fontWeight: 700 }}>
                              {detectiveResult.name} is {detectiveResult.isMafia ? '👿 MAFIA' : '✅ CLEAN'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (!isMyTurn) {
                    return (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🌙</div>
                        <h4>Wait for your turn</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{turnMsg}</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {myRole === 'MAFIA' && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span className="badge badge-crimson" style={{ fontSize: '12px', animation: 'glowPulse 2s ease-in-out infinite' }}>YOUR TURN</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Choose a target</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                            {room.players.filter(p => p.id !== joinedPlayer?.id && p.alive).map(p => (
                              <button
                                key={p.id}
                                onClick={() => setSelectedTarget(p.id)}
                                className={`target-btn ${selectedTarget === p.id ? 'active-danger' : ''}`}
                              >
                                <div className="target-btn-icon">🎯</div>
                                <span>{p.name}</span>
                              </button>
                            ))}
                          </div>
                          <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-danger btn-full">
                            Eliminate Target
                          </button>
                        </div>
                      )}

                      {myRole === 'DETECTIVE' && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '12px', animation: 'glowPulse 2s ease-in-out infinite' }}>YOUR TURN</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Select a suspect</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                            {room.players.filter(p => p.id !== joinedPlayer?.id && p.alive).map(p => (
                              <button
                                key={p.id}
                                onClick={() => setSelectedTarget(p.id)}
                                className={`target-btn ${selectedTarget === p.id ? 'active-cyan' : ''}`}
                              >
                                <div className="target-btn-icon">🔎</div>
                                <span>{p.name}</span>
                              </button>
                            ))}
                          </div>
                          <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-cyan btn-full">
                            Investigate
                          </button>
                        </div>
                      )}

                      {myRole === 'DOCTOR' && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span className="badge badge-teal" style={{ fontSize: '12px', animation: 'glowPulse 2s ease-in-out infinite' }}>YOUR TURN</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Choose who to protect</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                            {room.players.filter(p => p.alive).map(p => (
                              <button
                                key={p.id}
                                onClick={() => setSelectedTarget(p.id)}
                                className={`target-btn ${selectedTarget === p.id ? 'active-teal' : ''}`}
                              >
                                <div className="target-btn-icon">🛡️</div>
                                <span>{p.name} {p.id === joinedPlayer?.id && '(You)'}</span>
                              </button>
                            ))}
                          </div>
                          <button onClick={handleNightAction} disabled={!selectedTarget} className="btn btn-teal btn-full">
                            Protect
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* DAY */}
          {room.phase === 'DAY' && joinedPlayer?.alive && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div className="event-log" style={{ textAlign: 'left', marginTop: '8px' }}>
                  <p className="event-log-entry">
                    {room.dayLog?.length > 0 ? room.dayLog[room.dayLog.length - 1] : 'No news today.'}
                  </p>
                </div>
              </div>

              {/* Player Status Widget */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                  🟢 {room.players.filter(p => p.alive).length} Alive
                </span>
                <span className="badge badge-crimson" style={{ fontSize: '10px' }}>
                  💀 {room.players.filter(p => !p.alive).length} Dead
                </span>
                <span className="badge badge-ghost" style={{ fontSize: '10px' }}>
                  👥 {room.players.length} Total
                </span>
              </div>

              {/* Chat */}
              <div className="discussion-hub">
                <div className="discussion-hub-header">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="badge badge-cyan">Chat</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Channel: {effectiveChannel}</span>
                  </div>
                </div>

                <div className="discussion-chat-area" ref={chatAreaRef} onScroll={handleChatScroll}>
                  {chatScrolledUp && (
                    <button onClick={scrollToBottom} className="btn btn-sm scroll-bottom-btn">
                      ↓ Latest
                    </button>
                  )}
                  {filteredMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', margin: 'auto 0' }}>
                      No messages yet.
                    </div>
                  ) : (
                    filteredMessages.map((msg, i) => {
                      const isMe = msg.senderId === joinedPlayer?.id;
                      const isMafia = msg.channel === 'MAFIA';
                      return (
                        <div key={i} className={`chat-bubble ${isMe ? 'outgoing' : 'incoming'} ${isMafia ? 'channel-mafia' : ''}`}>
                          <div className="chat-bubble-meta" style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                            <span>{msg.senderName}</span>
                            <span>{msg.timestamp}</span>
                          </div>
                          <div className="chat-bubble-text" style={msg.type === 'voice_note' ? { padding: 0, background: 'transparent', border: 'none' } : {}}>
                            {msg.type === 'voice_note' ? (
                              <VoiceNotePlayer
                                msg={msg}
                                playingId={playingVoiceNoteId}
                                progress={voiceNoteProgress}
                                onPlayToggle={handleTogglePlayVoiceNote}
                              />
                            ) : (
                              msg.text
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="discussion-controls-bar">
                  <form onSubmit={handleSendMessage} className="discussion-text-row">
                    <input
                      type="text"
                      maxLength={120}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="field-input"
                      style={{ padding: '10px 14px', fontSize: '14px', borderRadius: 'var(--radius-sm)' }}
                      disabled={!joinedPlayer?.alive}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!joinedPlayer?.alive}>
                      Send
                    </button>
                  </form>
                  <div className="discussion-voice-row">
                    <div className="record-button-row">
                      {recording ? (
                        <>
                          <button onClick={() => stopRecording()} className="voice-note-rec-btn recording">
                            Stop & Send ⏹
                          </button>
                          <button onClick={() => stopRecording()} className="btn btn-ghost btn-sm">Cancel</button>
                          <span className="record-pulse">0:0{recordingTime}/0:15</span>
                        </>
                      ) : (
                        <button onClick={startRecording} className="voice-note-rec-btn" disabled={!joinedPlayer?.alive}>
                          🎤 Record Voice
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VOTING */}
          {room.phase === 'VOTING' && joinedPlayer?.alive && (
            <div>
              {/* Player Status Widget */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                  🟢 {room.players.filter(p => p.alive).length} Alive
                </span>
                <span className="badge badge-crimson" style={{ fontSize: '10px' }}>
                  💀 {room.players.filter(p => !p.alive).length} Dead
                </span>
                <span className="badge badge-ghost" style={{ fontSize: '10px' }}>
                  👥 {room.players.length} Total
                </span>
              </div>
              {votedTarget ? (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗳️</div>
                    <h4 style={{ marginBottom: '4px' }}>Vote Cast</h4>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      You voted for: <strong style={{ color: 'white' }}>
                        {votedTarget === 'skip' ? 'ABSTAIN' : room.players.find(p => p.id === votedTarget)?.name || 'Unknown'}
                      </strong>
                    </p>
                  </div>
                  {Object.keys(room.voteTally || {}).length > 0 && (
                    <div className="card card-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <h5 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Live Tally
                      </h5>
                      {room.players.filter(p => p.alive).map(p => {
                        const votes = (room.voteTally || {})[p.id] || 0;
                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}>
                            <span>{p.name}</span>
                            <span style={{ color: votes > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{votes}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
                    Waiting for others to vote...
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '12px' }}>
                    Who should be lynched?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
                    {room.players.filter(p => p.alive).map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleCastVote(p.id)}
                        className="target-btn"
                      >
                        <div className="target-btn-icon">👤</div>
                        <span>{p.name} {p.id === joinedPlayer?.id && '(You)'}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => handleCastVote('skip')} className="btn btn-ghost btn-full" style={{ borderStyle: 'dashed' }}>
                    Abstain / Skip
                  </button>
                </div>
              )}
            </div>
          )}

          {/* NIGHT_RESOLVED */}
          {room.phase === 'NIGHT_RESOLVED' && joinedPlayer?.alive && (
            <div style={{ textAlign: 'center' }}>
              <div className="phase-icon-ring" style={{ margin: '0 auto 12px' }}>📰</div>
              <h4>Morning Report Pending</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                The host is preparing the announcement.
              </p>
            </div>
          )}

          {/* VOTE_RESOLVED */}
          {room.phase === 'VOTE_RESOLVED' && joinedPlayer?.alive && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚖️</div>
              <h4>Verdict Reached</h4>
              <div className="event-log" style={{ textAlign: 'left', marginTop: '12px' }}>
                <p className="event-log-entry">{room.announcementText || 'The verdict is being finalized...'}</p>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                Awaiting the host to reveal the outcome.
              </p>
            </div>
          )}

          {/* ENDED */}
          {room.phase === 'ENDED' && gameOverData && (
            <div style={{ textAlign: 'center' }}>
              {(() => {
                const amIMafia = myRole === 'MAFIA';
                const mafiaWon = gameOverData.winner === 'MAFIA';
                const won = (amIMafia && mafiaWon) || (!amIMafia && !mafiaWon);
                return (
                  <>
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>{won ? '🎉' : '💀'}</div>
                    <h2 style={{ color: won ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {won ? 'You Won!' : 'You Lost!'}
                    </h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      The {gameOverData.winner.toLowerCase()} won this game.
                    </p>
                    <div className="card card-sm" style={{ background: getRoleBgColor(myRole), borderColor: getRoleBorderColor(myRole) }}>
                      <div style={{ color: getRoleTextColor(myRole) }}>{getRoleIcon(myRole)}</div>
                      <h4 style={{ fontWeight: 800, marginTop: '4px' }}>{joinedPlayer?.name}</h4>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: getRoleTextColor(myRole) }}>
                        You were a {myRole}
                      </p>
                    </div>
                  </>
                );
              })()}
              <button onClick={handleLeaveRoom} className="btn btn-primary btn-full" style={{ marginTop: '16px' }}>
                Return to Menu
              </button>
            </div>
          )}
        </div>
    );
  };

  // ========================================================
  // MAIN RENDER
  // ========================================================
  return (
    <div className="app-shell">
      <header className="site-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="site-logo">
            Shadows<span>.</span>
          </div>
          {room && (
            <span className={`badge ${isHost ? 'badge-crimson' : 'badge-ghost'}`} style={{ fontSize: '8px', padding: '2px 6px' }}>
              {isHost ? 'HOST' : 'PLAYER'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`conn-pill ${connected ? '' : 'offline'}`}>
            <div className={`conn-dot ${connected ? 'pulse' : ''}`}></div>
            {connected ? 'Connected' : 'Offline'}
          </div>
          {room && (
            <button onClick={handleLeaveRoom} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-text)' }}>
              ✕ Exit
            </button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div className="error-toast" style={{ maxWidth: '480px', margin: '0 auto 16px' }}>
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {showSplash ? renderSplashScreen() : !room ? renderLobby() : isHost ? renderHostView() : renderPlayerView()}
    </div>
  );
}

export default App;