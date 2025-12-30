
const SOUNDS = {
  KICK: 'https://assets.mixkit.co/active_storage/sfx/2092/2092-preview.mp3',
  GOAL_ROAR: 'https://assets.mixkit.co/active_storage/sfx/2091/2091-preview.mp3',
  GOAL_MUSIC: 'https://assets.mixkit.co/active_storage/sfx/2088/2088-preview.mp3',
  // Nuevos sonidos de Freesound proporcionados por el usuario
  WHISTLE: 'https://cdn.freesound.org/previews/470/470927_10036662-lq.mp3',
  STEAL: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  SWOOSH: 'https://cdn.freesound.org/previews/269/269327_4486188-lq.mp3'
};

class SoundManager {
  private audios: Record<string, HTMLAudioElement> = {};
  private enabled: boolean = true;
  private isInitialized: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 0.5;
      this.audios[key] = audio;
    });
  }

  public unlockAudio() {
    if (this.isInitialized) return;
    Object.values(this.audios).forEach(audio => {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    });
    this.isInitialized = true;
  }

  play(key: keyof typeof SOUNDS, volume?: number) {
    if (!this.enabled) return;
    const original = this.audios[key];
    if (original) {
      const sound = original.cloneNode() as HTMLAudioElement;
      
      if (volume !== undefined) {
        sound.volume = volume;
      } else {
        // Volúmenes optimizados según feedback
        if (key === 'GOAL_ROAR') sound.volume = 0.8;
        else if (key === 'GOAL_MUSIC') sound.volume = 0.5;
        else if (key === 'WHISTLE') sound.volume = 0.6;
        else if (key === 'SWOOSH') sound.volume = 0.15; // Tenue para el movimiento
        else if (key === 'KICK') sound.volume = 0.45;
        else sound.volume = 0.4;
      }

      sound.play().catch(() => {
        // Fallback en caso de que cloneNode falle
        original.currentTime = 0;
        original.play().catch(() => {});
      });
    }
  }

  playSequence(key: keyof typeof SOUNDS, count: number, interval: number = 400) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.play(key), i * interval);
    }
  }

  toggle(enabled: boolean) {
    this.enabled = enabled;
  }
}

export const soundManager = new SoundManager();
