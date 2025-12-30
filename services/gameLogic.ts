
import { Player, Point } from '../types';
import { PHYSICS, WORLD_W, WORLD_H } from '../constants';

export const resolvePlayerCollisions = (players: Player[]): boolean => {
  let anyCollision = false;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = PHYSICS.PLAYER_RAD * 2;
      
      if (dist < minDist) {
        anyCollision = true;
        const overlap = minDist - dist;
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        p1.x -= nx * (overlap / 2);
        p1.y -= ny * (overlap / 2);
        p2.x += nx * (overlap / 2);
        p2.y += ny * (overlap / 2);
      }
    }
  }
  return anyCollision;
};

export const createInitialPlayers = (): Player[] => [
  // Equipo P1 - Azul
  { id: 0, x: 250, y: 840, team: 'p1', color: '#60a5fa', role: 'gk', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 1, x: 250, y: 650, team: 'p1', color: '#2563eb', role: 'fwd', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 2, x: 150, y: 550, team: 'p1', color: '#2563eb', role: 'def', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 3, x: 350, y: 550, team: 'p1', color: '#2563eb', role: 'def', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 4, x: 250, y: 480, team: 'p1', color: '#2563eb', role: 'mid', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  
  // Equipo P2 - Rojo
  { id: 5, x: 250, y: 60, team: 'p2', color: '#f87171', role: 'gk', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 6, x: 250, y: 250, team: 'p2', color: '#dc2626', role: 'fwd', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 7, x: 150, y: 350, team: 'p2', color: '#dc2626', role: 'def', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 8, x: 350, y: 350, team: 'p2', color: '#dc2626', role: 'def', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 },
  { id: 9, x: 250, y: 420, team: 'p2', color: '#dc2626', role: 'mid', target: null, immune: 0, vx: 0, vy: 0, kickCooldown: 0 }
];

export const getBallKickAngle = (owner: Player): Point => {
  const targetX = WORLD_W / 2;
  const targetY = WORLD_H / 2;
  const dx = targetX - owner.x;
  const dy = targetY - owner.y;
  const angle = Math.atan2(dy, dx === 0 ? 1 : dx);
  return {
    x: Math.cos(angle) * (PHYSICS.BALL_SPEED * 0.7),
    y: Math.sin(angle) * (PHYSICS.BALL_SPEED * 0.7)
  };
};
