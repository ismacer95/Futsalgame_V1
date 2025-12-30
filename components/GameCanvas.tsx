
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Player, Team, Point } from '../types';
import { WORLD_W, WORLD_H, PHYSICS, COLORS } from '../constants';
import { soundManager } from '../services/soundManager';

interface GameCanvasProps {
  state: GameState;
  onUpdate: (newState: Partial<GameState>) => void;
  userTeam: Team;
  ballSpeed: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ state, onUpdate, userTeam, ballSpeed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  const interactionRef = useRef<{ 
    isDragging: boolean; 
    startPos: Point; 
    currentPos: Point;
    dragTargetId: number | null;
  }>({
    isDragging: false,
    startPos: { x: 0, y: 0 },
    currentPos: { x: 0, y: 0 },
    dragTargetId: null
  });

  const getMousePos = (e: any): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    return {
      x: (clientX - rect.left) * (WORLD_W / rect.width),
      y: (clientY - rect.top) * (WORLD_H / rect.height)
    };
  };

  const handleStart = (e: any) => {
    if (state.isPaused || !state.gameRunning) return;
    const pos = getMousePos(e);
    
    let clickedPlayer: Player | null = null;
    let minD = PHYSICS.SELECT_RADIUS;
    
    state.players.forEach(p => {
      if (p.team === userTeam) {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < minD) {
          minD = d;
          clickedPlayer = p;
        }
      }
    });

    interactionRef.current = {
      isDragging: true,
      startPos: pos,
      currentPos: pos,
      dragTargetId: clickedPlayer ? clickedPlayer.id : null
    };

    if (clickedPlayer) {
      setSelectedId(clickedPlayer.id);
    }
  };

  const handleMove = (e: any) => {
    if (!interactionRef.current.isDragging) return;
    if (e.cancelable) e.preventDefault();
    interactionRef.current.currentPos = getMousePos(e);
  };

  const handleEnd = (e: any) => {
    if (!interactionRef.current.isDragging) return;
    
    const { startPos, currentPos, dragTargetId } = interactionRef.current;
    const dist = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);
    const isDragGesture = dist > 20;

    if (!isDragGesture) {
      if (dragTargetId === null && selectedId !== null) {
        // Asignación de destino (movimiento táctico)
        const updatedPlayers = state.players.map(p => 
          p.id === selectedId ? { ...p, target: { x: currentPos.x, y: currentPos.y } } : p
        );
        onUpdate({ players: updatedPlayers });
        // Silbido tenue de movimiento asignado
        soundManager.play('SWOOSH');
      }
    } else {
      const activeId = dragTargetId !== null ? dragTargetId : selectedId;
      if (activeId !== null) {
        const angle = Math.atan2(currentPos.y - startPos.y, currentPos.x - startPos.x);
        const vx = Math.cos(angle) * ballSpeed;
        const vy = Math.sin(angle) * ballSpeed;

        if (state.ballOwner?.id === activeId) {
          const updatedPlayers = state.players.map(p => 
            p.id === activeId ? { ...p, kickCooldown: PHYSICS.KICK_COOLDOWN_TICKS } : p
          );
          onUpdate({
            ballOwner: null,
            ball: { ...state.ball, vx, vy, lastTeam: userTeam },
            players: updatedPlayers,
            isOut: false,
            kickTimer: 0
          });
          soundManager.play('KICK');
        } else {
          const newCache = { ...state.moveCache };
          newCache[userTeam] = { vx: vy, vy: vy, playerID: activeId, timestamp: Date.now() };
          onUpdate({ moveCache: newCache });
        }
      }
    }

    interactionRef.current.isDragging = false;
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = COLORS.PITCH;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.strokeStyle = COLORS.PITCH_LINES;
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, WORLD_W - 40, WORLD_H - 40);
    ctx.beginPath(); ctx.moveTo(20, WORLD_H / 2); ctx.lineTo(WORLD_W - 20, WORLD_H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(WORLD_W / 2, WORLD_H / 2, 75, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = COLORS.GOAL; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(PHYSICS.POST_L, 20); ctx.lineTo(PHYSICS.POST_R, 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PHYSICS.POST_L, WORLD_H - 20); ctx.lineTo(PHYSICS.POST_R, WORLD_H - 20); ctx.stroke();

    const now = Date.now();

    if (interactionRef.current.isDragging) {
      const { startPos, currentPos, dragTargetId } = interactionRef.current;
      const activeId = dragTargetId !== null ? dragTargetId : selectedId;
      const player = state.players.find(p => p.id === activeId);
      const dist = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);
      
      if (player && dist > 20) {
        const isOwner = state.ballOwner?.id === player.id;
        ctx.beginPath();
        ctx.setLineDash([8, 5]);
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + (currentPos.x - startPos.x), player.y + (currentPos.y - startPos.y));
        ctx.strokeStyle = isOwner ? COLORS.GOAL : 'rgba(255,255,255,0.4)';
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(player.x + (currentPos.x - startPos.x), player.y + (currentPos.y - startPos.y), 6, 0, Math.PI * 2);
        ctx.fillStyle = isOwner ? COLORS.GOAL : 'white';
        ctx.fill();
      }
    }

    state.players.forEach(p => {
      const cache = state.moveCache[p.team];
      if (cache && cache.playerID === p.id) {
        const timeLeft = PHYSICS.CACHE_LIFETIME - (now - cache.timestamp);
        if (timeLeft > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, PHYSICS.PLAYER_RAD + 8, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (timeLeft / PHYSICS.CACHE_LIFETIME)));
          ctx.strokeStyle = COLORS.GOAL; ctx.lineWidth = 4; ctx.stroke();
        }
      }

      ctx.globalAlpha = p.immune > 0 ? 0.6 : 1.0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, PHYSICS.PLAYER_RAD, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      
      const isSelected = selectedId === p.id;
      const isOwner = state.ballOwner?.id === p.id;
      
      if (isSelected) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 5;
        ctx.stroke();
      } else if (isOwner) {
        ctx.strokeStyle = COLORS.GOAL;
        ctx.lineWidth = 4;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.globalAlpha = 1.0;

      if (p.target) {
        ctx.beginPath();
        ctx.setLineDash([2, 4]);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.target.x, p.target.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(p.target.x, p.target.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
      }

      if (isOwner && state.isOut) {
        const timeLeft = Math.max(0, PHYSICS.KICK_TIME - state.kickTimer);
        ctx.fillStyle = timeLeft < 1 ? '#ef4444' : 'white';
        ctx.font = "bold 18px monospace"; ctx.textAlign = "center";
        ctx.fillText(timeLeft.toFixed(1) + "s", p.x, p.y - 35);
      }
    });

    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, PHYSICS.BALL_RAD, 0, Math.PI * 2);
    ctx.fillStyle = state.isOut ? COLORS.GOAL : COLORS.BALL;
    ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();

  }, [state, userTeam, selectedId]);

  useEffect(() => {
    let frame = requestAnimationFrame(function loop() {
      render();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [render]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={WORLD_W}
        height={WORLD_H}
        className="rounded shadow-2xl bg-emerald-950 border-2 border-slate-700 max-h-full max-w-full object-contain touch-none cursor-crosshair"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
    </div>
  );
};

export default GameCanvas;
