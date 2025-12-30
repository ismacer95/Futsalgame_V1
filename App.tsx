
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Team, NetworkRole, NetworkMessage } from './types';
import { PHYSICS, WORLD_W, WORLD_H, MATCH_DURATION, COLORS } from './constants';
import { createInitialPlayers, resolvePlayerCollisions } from './services/gameLogic';
import { soundManager } from './services/soundManager';
import GameCanvas from './components/GameCanvas';

declare const Peer: any;

const App: React.FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [networkRole, setNetworkRole] = useState<NetworkRole>('local');
  const [peerId, setPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const wasOutRef = useRef<boolean>(false);
  
  const [gameConfig, setGameConfig] = useState({
    ballSpeed: PHYSICS.BALL_SPEED,
    playerSpeed: PHYSICS.PLAYER_SPEED,
    stealCooldown: PHYSICS.IMMUNE_TIME,
    recaptureCooldown: PHYSICS.KICK_COOLDOWN_TICKS
  });

  const [gameState, setGameState] = useState<GameState>({
    players: createInitialPlayers(),
    ball: { x: 250, y: 450, vx: 0, vy: 0, lastTeam: 'p1' },
    score: { p1: 0, p2: 0 },
    timeRemaining: MATCH_DURATION,
    gameRunning: false,
    isPaused: false,
    isGoal: false,
    isOut: false,
    turnToKick: null,
    kickTimer: 0,
    ballOwner: null,
    moveCache: { p1: null, p2: null }
  });

  const lastTickRef = useRef(Date.now());
  const loopRef = useRef<number>(0);
  const lastTimeUpdate = useRef(Date.now());

  const generateShortCode = () => Math.random().toString(36).substring(2, 7).toUpperCase();

  const initPeer = (customId?: string) => {
    if (peerRef.current) peerRef.current.destroy();
    const peer = customId ? new Peer(customId) : new Peer();
    peerRef.current = peer;

    peer.on('open', (id: string) => {
      setPeerId(id);
      setConnectionError(null);
    });

    peer.on('connection', (conn: any) => {
      setNetworkRole('host');
      setupConnection(conn);
    });

    peer.on('error', (err: any) => {
      if (err.type === 'unavailable-id') initPeer();
      else {
        setConnectionError("Error de red. Verifica tu conexión.");
        setIsConnecting(false);
      }
    });
  };

  useEffect(() => {
    initPeer();
    return () => peerRef.current?.destroy();
  }, []);

  const setupConnection = (conn: any) => {
    connRef.current = conn;
    conn.on('open', () => {
      setIsConnected(true);
      setIsConnecting(false);
      if (networkRole === 'client') {
        setShowJoinInput(false);
      }
    });

    conn.on('data', (data: NetworkMessage) => {
      if (data.type === 'STATE_UPDATE') setGameState(data.state);
      else if (data.type === 'INPUT_ACTION') setGameState(prev => ({ ...prev, ...data.patch }));
      else if (data.type === 'START_GAME') {
        startGame(false);
      }
    });

    conn.on('close', () => {
      setIsConnected(false);
      setNetworkRole('local');
    });
  };

  const joinRoom = (id: string) => {
    if (!peerRef.current) return;
    soundManager.unlockAudio();
    setIsConnecting(true);
    setConnectionError(null);
    setNetworkRole('client');
    const conn = peerRef.current.connect(id.toLowerCase(), { reliable: true });
    setupConnection(conn);
    
    setTimeout(() => {
      if (!connRef.current?.open && !isConnected) {
        setConnectionError("No se encontró la sala. Comprueba el código.");
        setIsConnecting(false);
      }
    }, 8000);
  };

  const createRoom = () => {
    soundManager.unlockAudio();
    const shortCode = generateShortCode();
    initPeer(shortCode.toLowerCase());
    setNetworkRole('host');
    setShowInviteModal(true);
  };

  const getInviteUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', peerId);
    return url.toString();
  };

  const inviteUrl = getInviteUrl();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(inviteUrl)}`;

  const initMatch = useCallback((isKickoff = false) => {
    if (isKickoff) {
      soundManager.play('WHISTLE');
    }
    setGameState(prev => ({
      ...prev,
      players: createInitialPlayers(),
      ball: { x: 250, y: 450, vx: 0, vy: 0, lastTeam: (isKickoff ? (prev.ball.lastTeam === 'p1' ? 'p2' : 'p1') : prev.ball.lastTeam) as Team },
      ballOwner: null,
      isGoal: false,
      isOut: isKickoff,
      turnToKick: isKickoff ? (prev.ball.lastTeam === 'p1' ? 'p2' : 'p1') : null,
      kickTimer: 0,
      moveCache: { p1: null, p2: null }
    }));
  }, []);

  const startGame = (broadcast = true) => {
    soundManager.unlockAudio();
    if (broadcast && connRef.current) {
      connRef.current.send({ type: 'START_GAME' });
    }
    setGameState(prev => ({ 
      ...prev, 
      gameRunning: true, 
      isPaused: false,
      score: { p1: 0, p2: 0 }, 
      timeRemaining: MATCH_DURATION 
    }));
    setSettingsOpen(false);
    setShowInviteModal(false);
    setShowJoinInput(false);
    initMatch(true);
  };

  const backToMenu = () => {
    setGameState(prev => ({ ...prev, gameRunning: false, isPaused: false }));
    setSettingsOpen(false);
    setShowInviteModal(false);
    setShowJoinInput(false);
    setNetworkRole('local');
    if (connRef.current) connRef.current.close();
  };

  const update = useCallback(() => {
    if (networkRole === 'client') return;
    setGameState(prev => {
      if (!prev.gameRunning || prev.isPaused || prev.isGoal) return prev;
      
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      const newState = { ...prev };

      if (now - lastTimeUpdate.current >= 1000) {
        if (!prev.isGoal && !prev.isOut) {
          newState.timeRemaining = Math.max(0, prev.timeRemaining - 1);
          if (newState.timeRemaining === 0) {
            newState.gameRunning = false;
            soundManager.playSequence('WHISTLE', 3, 400);
          }
        }
        lastTimeUpdate.current = now;
      }

      newState.players = prev.players.map(p => {
        let { x, y, vx, vy, target, immune, kickCooldown } = p;
        if (immune > 0) immune--;
        if (kickCooldown > 0) kickCooldown--;
        if (target) {
          const dx = target.x - x; const dy = target.y - y; const dist = Math.hypot(dx, dy);
          if (dist > 4) { vx = (dx / dist) * gameConfig.playerSpeed; vy = (dy / dist) * gameConfig.playerSpeed; x += vx; y += vy; }
          else { target = null; vx = 0; vy = 0; }
        } else { vx = 0; vy = 0; }
        x = Math.max(30, Math.min(WORLD_W - 30, x)); y = Math.max(30, Math.min(WORLD_H - 30, y));
        return { ...p, x, y, vx, vy, target, immune, kickCooldown };
      });

      resolvePlayerCollisions(newState.players);

      if (prev.isOut) {
        const owner = newState.players.find(p => p.team === prev.turnToKick && Math.hypot(p.x - prev.ball.x, p.y - prev.ball.y) < 65);
        if (owner) {
          newState.ballOwner = owner;
          newState.ball = { ...prev.ball, x: owner.x, y: owner.y, vx: 0, vy: 0 };
          newState.kickTimer = prev.kickTimer + delta;
          if (newState.kickTimer >= PHYSICS.KICK_TIME) {
            newState.players = newState.players.map(p => p.id === owner.id ? { ...p, kickCooldown: gameConfig.recaptureCooldown } : p);
            newState.ball.vy = (prev.turnToKick === 'p1' ? -1 : 1) * gameConfig.ballSpeed * 0.7;
            newState.isOut = false; newState.ballOwner = null; newState.kickTimer = 0;
            soundManager.play('KICK');
          }
        }
      } else if (newState.ballOwner) {
        const currentOwner = newState.players.find(p => p.id === newState.ballOwner!.id);
        if (currentOwner) {
          const cache = newState.moveCache[currentOwner.team];
          if (cache && cache.playerID === currentOwner.id) {
            newState.players = newState.players.map(p => p.id === currentOwner.id ? { ...p, kickCooldown: gameConfig.recaptureCooldown } : p);
            newState.ball = { ...prev.ball, x: currentOwner.x, y: currentOwner.y, vx: cache.vx, vy: cache.vy, lastTeam: currentOwner.team };
            newState.ballOwner = null;
            newState.moveCache = { ...newState.moveCache, [currentOwner.team]: null };
            soundManager.play('KICK');
          } else {
            newState.ball = { ...prev.ball, x: currentOwner.x, y: currentOwner.y };
            newState.players.forEach(p => {
              if (p.team !== currentOwner.team && p.immune === 0 && currentOwner.immune === 0) {
                if (Math.hypot(p.x - currentOwner.x, p.y - currentOwner.y) < PHYSICS.STEAL_DIST && Math.random() < PHYSICS.STEAL_PROB * delta * 60) {
                  newState.ballOwner = p; newState.ball.lastTeam = p.team;
                  newState.players = newState.players.map(pl => (pl.id === p.id || pl.id === currentOwner.id) ? { ...pl, immune: gameConfig.stealCooldown } : pl);
                  soundManager.play('STEAL');
                }
              }
            });
          }
        }
      } else {
        let bx = prev.ball.x + prev.ball.vx; let by = prev.ball.y + prev.ball.vy;
        const inGoalRange = bx > PHYSICS.POST_L && bx < PHYSICS.POST_R;
        
        let outDetectedThisFrame = false;

        if (by < 15 && !prev.isGoal) {
          if (inGoalRange) { 
            newState.score = { ...prev.score, p1: prev.score.p1 + 1 }; 
            newState.isGoal = true; 
            newState.ball.vx = 0; newState.ball.vy = 0;
          } 
          else { newState.isOut = true; newState.turnToKick = prev.ball.lastTeam === 'p1' ? 'p2' : 'p1'; by = 35; newState.ball.vx = 0; newState.ball.vy = 0; outDetectedThisFrame = true; }
        } else if (by > WORLD_H - 15 && !prev.isGoal) {
          if (inGoalRange) { 
            newState.score = { ...prev.score, p2: prev.score.p2 + 1 }; 
            newState.isGoal = true; 
            newState.ball.vx = 0; newState.ball.vy = 0;
          } 
          else { newState.isOut = true; newState.turnToKick = prev.ball.lastTeam === 'p2' ? 'p1' : 'p2'; by = WORLD_H - 35; newState.ball.vx = 0; newState.ball.vy = 0; outDetectedThisFrame = true; }
        } else if ((bx < 15 || bx > WORLD_W - 15) && !prev.isGoal) {
          newState.isOut = true; newState.turnToKick = prev.ball.lastTeam === 'p1' ? 'p2' : 'p1';
          newState.ball.vx = 0; newState.ball.vy = 0; bx = bx < 15 ? 35 : WORLD_W - 35;
          outDetectedThisFrame = true;
        }

        if (outDetectedThisFrame && !wasOutRef.current) {
          soundManager.play('WHISTLE');
        }
        wasOutRef.current = newState.isOut;
        
        newState.ball = { ...prev.ball, x: bx, y: by };
        
        if (!newState.isGoal && !newState.isOut) {
          newState.players.forEach(p => {
            if (Math.hypot(bx - p.x, by - p.y) < PHYSICS.PLAYER_RAD + PHYSICS.BALL_RAD + 8 && p.kickCooldown === 0 && p.immune === 0) {
              newState.ballOwner = p; newState.ball.lastTeam = p.team; newState.ball.vx = 0; newState.ball.vy = 0;
            }
          });
        }
      }

      if (networkRole === 'host' && isConnected && connRef.current) {
        connRef.current.send({ type: 'STATE_UPDATE', state: newState });
      }
      return newState;
    });
  }, [gameConfig, networkRole, isConnected]);

  useEffect(() => {
    if (gameState.isGoal) {
      soundManager.play('GOAL_ROAR');
      const musicTimer = setTimeout(() => soundManager.play('GOAL_MUSIC'), 500);
      const resetTimer = setTimeout(() => initMatch(true), 3500);
      return () => { clearTimeout(musicTimer); clearTimeout(resetTimer); };
    }
  }, [gameState.isGoal, initMatch]);

  useEffect(() => {
    loopRef.current = requestAnimationFrame(function frame() { update(); loopRef.current = requestAnimationFrame(frame); });
    return () => cancelAnimationFrame(loopRef.current);
  }, [update]);

  const onInteractionUpdate = (patch: Partial<GameState>) => {
    soundManager.unlockAudio();
    if (networkRole === 'client' && connRef.current) connRef.current.send({ type: 'INPUT_ACTION', patch });
    else setGameState(p => ({ ...p, ...patch }));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  const updateConfig = (key: keyof typeof gameConfig, val: number) => {
    setGameConfig(prev => ({ ...prev, [key]: val }));
  };

  const toggleSound = () => {
    soundManager.unlockAudio();
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    soundManager.toggle(newState);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-white overflow-hidden font-sans select-none">
      {/* HUD Superior */}
      <div className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50 shadow-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => { soundManager.unlockAudio(); setGameState(p => ({ ...p, isPaused: !p.isPaused })); }} className={`p-2 rounded-lg transition shadow-lg ${gameState.isPaused ? 'bg-emerald-600 scale-105 shadow-emerald-900/40' : 'bg-slate-800 hover:bg-slate-700'}`}>
            {gameState.isPaused ? <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> : <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
          </button>
          {isConnected && <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full border border-emerald-500/30">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Online</span>
          </div>}
        </div>
        <div className="flex flex-col items-center">
          <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest mb-1">
            <span className={(networkRole === 'client' && isConnected) ? "text-slate-500" : "text-blue-400"}>P1 {gameState.score.p1}</span>
            <span className="text-slate-600">VS</span>
            <span className={(networkRole === 'client' && isConnected) ? "text-red-400" : "text-slate-500"}>{gameState.score.p2} P2</span>
          </div>
          <div className={`font-mono text-xl px-3 rounded border border-slate-800 shadow-inner transition ${gameState.isPaused ? 'text-slate-500 bg-slate-900' : 'text-yellow-500 bg-black'}`}>
            {formatTime(gameState.timeRemaining)}
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={toggleSound} className={`p-2 rounded-lg transition ${soundEnabled ? 'bg-slate-800 text-blue-400' : 'bg-slate-900 text-slate-600'}`}>
              {soundEnabled ? <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg> : <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>}
           </button>
           <button onClick={() => { soundManager.unlockAudio(); setSettingsOpen(true); }} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 1 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
           </button>
        </div>
      </div>

      {/* Área de Juego */}
      <div className="flex-1 relative bg-slate-900 flex items-center justify-center p-2 overflow-hidden">
        <GameCanvas state={gameState} userTeam={networkRole === 'client' ? 'p2' : 'p1'} ballSpeed={gameConfig.ballSpeed} onUpdate={onInteractionUpdate} />
        
        {gameState.isGoal && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[60] backdrop-blur-sm animate-pulse">
            <h1 className="text-7xl font-black italic text-yellow-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] uppercase scale-110">GOOOL</h1>
          </div>
        )}

        {/* Overlay de Pausa */}
        {gameState.isPaused && !settingsOpen && !showInviteModal && !showJoinInput && gameState.gameRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-[200] backdrop-blur-md animate-fade-in p-6">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-center shadow-2xl space-y-4">
              <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white mb-6">Pausa</h2>
              <button 
                onClick={() => { soundManager.unlockAudio(); setGameState(p => ({ ...p, isPaused: false })); }} 
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-xl shadow-lg shadow-emerald-900/30 transition transform active:scale-95"
              >
                REANUDAR
              </button>
              <button 
                onClick={() => startGame()} 
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-slate-300 transition"
              >
                REINICIAR PARTIDO
              </button>
              <div className="h-px bg-slate-800 my-4" />
              <button 
                onClick={backToMenu} 
                className="w-full py-4 bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 rounded-2xl font-black uppercase text-xs tracking-widest transition"
              >
                Menú Principal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Menú Principal */}
      {!gameState.gameRunning && gameState.timeRemaining > 0 && !showInviteModal && !showJoinInput && (
        <div className="absolute inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center text-center p-8 animate-fade-in">
          <div className="mb-12">
            <h1 className="text-6xl font-black italic mb-1 tracking-tighter text-white drop-shadow-2xl">FUTSAL MASTER</h1>
            <p className="text-blue-500 tracking-[0.4em] font-medium uppercase text-[10px]">Tactical Simulator</p>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={() => startGame()} className="py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xl shadow-xl shadow-blue-900/40 border-b-4 border-blue-800 transition transform active:scale-95">MODO ENTRENAMIENTO</button>
            
            <div className="flex items-center gap-4 my-2">
              <div className="h-px bg-slate-800 flex-1" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Online</span>
              <div className="h-px bg-slate-800 flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
               <button onClick={createRoom} className="py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-700 transition">Crear Sala</button>
               <button onClick={() => setShowJoinInput(true)} className="py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-700 transition">Unirse</button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de Fin */}
      {!gameState.gameRunning && gameState.timeRemaining <= 0 && (
        <div className="absolute inset-0 bg-slate-950/90 z-[150] flex flex-col items-center justify-center text-center p-8 animate-fade-in backdrop-blur-sm">
          <h2 className="text-7xl font-black italic text-yellow-500 mb-8 uppercase tracking-tighter">FIN DEL PARTIDO</h2>
          <div className="text-4xl font-black mb-12 flex gap-8 bg-black/50 px-8 py-4 rounded-3xl border border-slate-800">
            <span className="text-blue-400">P1 {gameState.score.p1}</span>
            <span className="text-slate-600">-</span>
            <span className="text-red-400">{gameState.score.p2} P2</span>
          </div>
          <button onClick={() => startGame()} className="py-5 px-12 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xl shadow-xl transition transform active:scale-95">JUGAR OTRA VEZ</button>
          <button onClick={backToMenu} className="mt-4 text-slate-500 font-bold hover:text-white transition">Menú Principal</button>
        </div>
      )}

      {/* Configuración (Ajustes de Motor) */}
      {settingsOpen && (
        <div className="absolute inset-0 bg-slate-950/90 z-[400] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl my-auto animate-fade-in">
            <h3 className="text-xl font-black italic mb-8 border-b border-slate-800 pb-4 uppercase tracking-tighter">Ajustes de Motor</h3>
            <div className="space-y-8">
              {/* Velocidad Balón */}
              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-3">
                  <span>Velocidad Balón</span>
                  <span className="text-blue-400 text-sm">{gameConfig.ballSpeed.toFixed(1)}</span>
                </div>
                <input type="range" min="1.0" max="10.0" step="0.1" value={gameConfig.ballSpeed} onChange={(e) => updateConfig('ballSpeed', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>

              {/* Velocidad Jugador */}
              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-3">
                  <span>Velocidad Jugador</span>
                  <span className="text-blue-400 text-sm">{gameConfig.playerSpeed.toFixed(1)}</span>
                </div>
                <input type="range" min="0.5" max="5.0" step="0.1" value={gameConfig.playerSpeed} onChange={(e) => updateConfig('playerSpeed', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>

              {/* Cooldown Robo */}
              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-3">
                  <span>Cooldown Robo (ticks)</span>
                  <span className="text-blue-400 text-sm">{gameConfig.stealCooldown}</span>
                </div>
                <input type="range" min="30" max="300" step="10" value={gameConfig.stealCooldown} onChange={(e) => updateConfig('stealCooldown', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>

              {/* Cooldown Recaptura */}
              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-3">
                  <span>Cooldown Recaptura (ticks)</span>
                  <span className="text-blue-400 text-sm">{gameConfig.recaptureCooldown}</span>
                </div>
                <input type="range" min="20" max="250" step="10" value={gameConfig.recaptureCooldown} onChange={(e) => updateConfig('recaptureCooldown', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>

              <div className="pt-4">
                <button onClick={() => setSettingsOpen(false)} className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black transition shadow-lg shadow-blue-900/20 active:scale-95 uppercase tracking-widest text-sm">GUARDAR Y CERRAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unirse a Partida */}
      {showJoinInput && (
        <div className="absolute inset-0 bg-slate-950/98 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-black italic mb-2 uppercase">Unirse a Partida</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-6">Ingresa el código del rival</p>
            <input type="text" placeholder="CÓDIGO" maxLength={10} value={manualCode} onChange={(e) => setManualCode(e.target.value)} className="w-full bg-black border border-slate-800 rounded-2xl py-5 text-center text-3xl font-mono font-black text-blue-400 mb-4 focus:border-blue-500 outline-none uppercase tracking-widest" />
            {connectionError && <p className="text-red-500 text-xs font-bold mb-4 uppercase">{connectionError}</p>}
            <button disabled={isConnecting || manualCode.length < 3} onClick={() => joinRoom(manualCode)} className={`w-full py-5 rounded-2xl font-black text-lg transition ${isConnecting ? 'bg-slate-700 animate-pulse' : 'bg-blue-600 shadow-lg shadow-blue-900/30'}`}>
              {isConnecting ? 'CONECTANDO...' : 'CONECTAR'}
            </button>
            <button onClick={() => setShowJoinInput(false)} className="mt-4 text-slate-500 font-bold hover:text-white transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Crear Sala (Host) */}
      {showInviteModal && (
        <div className="absolute inset-0 bg-slate-950/98 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fade-in overflow-y-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-center shadow-2xl my-auto">
            <h2 className="text-2xl font-black italic mb-2 uppercase">Sala de Espera</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-6">Comparte este código con tu rival</p>
            <div className="bg-white p-3 rounded-2xl inline-block mb-4 shadow-xl">
              <img src={qrUrl} alt="QR" className="w-44 h-44" />
            </div>
            <div className="text-3xl font-mono font-black text-blue-400 bg-black py-4 rounded-xl border border-slate-800 mb-4 tracking-widest uppercase shadow-inner">{peerId}</div>
            
            <div className="flex flex-col gap-2">
              <button onClick={() => copyToClipboard()} className={`w-full py-4 rounded-2xl font-bold transition-all border-b-2 ${copied ? 'bg-emerald-600 border-emerald-800' : 'bg-slate-800 border-slate-900 hover:bg-slate-700'}`}>
                {copied ? '¡ENLACE COPIADO!' : 'Copiar Enlace'}
              </button>

              <div className="h-px bg-slate-800 my-4" />

              {isConnected ? (
                <button 
                  onClick={() => startGame()} 
                  className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-xl shadow-xl shadow-emerald-900/40 border-b-4 border-emerald-800 transition transform hover:scale-105 active:scale-95 animate-bounce"
                >
                  INICIAR PARTIDO
                </button>
              ) : (
                <div className="py-6 bg-slate-800/50 rounded-2xl border border-slate-800 flex items-center justify-center gap-3">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping" />
                  <span className="text-slate-400 font-black uppercase text-xs tracking-widest">Esperando rival...</span>
                </div>
              )}
            </div>

            <button onClick={backToMenu} className="w-full py-4 mt-6 text-slate-500 font-bold hover:text-white transition">Abandonar Sala</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
