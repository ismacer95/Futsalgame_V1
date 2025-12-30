
export const WORLD_W = 500;
export const WORLD_H = 900;
export const GOAL_LIMIT = 5;
export const MATCH_DURATION = 180; // 3 minutos

export const PHYSICS = {
  PLAYER_RAD: 22,
  BALL_RAD: 11,
  PLAYER_SPEED: 2.2,
  BALL_SPEED: 2.8, // Actualizado de 5.0 a 2.8
  STEAL_DIST: 44,
  STEAL_PROB: 0.15,
  POST_L: 160,
  POST_R: 340,
  IMMUNE_TIME: 120, // Actualizado de 100 a 120 (Cooldown robo)
  KICK_TIME: 4.0,
  KICK_COOLDOWN_TICKS: 110, // Actualizado de 80 a 110 (Cooldown recaptura)
  CACHE_LIFETIME: 2000,
  SELECT_RADIUS: 65
};

export const COLORS = {
  P1: '#3b82f6',
  P1_DARK: '#1d4ed8',
  P2: '#ef4444',
  P2_DARK: '#b91c1c',
  PITCH: '#064e3b',
  PITCH_LINES: 'rgba(255,255,255,0.2)',
  GOAL: '#fbbf24',
  BALL: '#ffffff'
};
