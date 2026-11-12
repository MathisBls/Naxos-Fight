const TRACKS = {
  title: 'assets/music/title.mp3',
  select: 'assets/music/select.mp3',
  battle: 'assets/music/battle.mp3',
};
const MUSIC_VOLUME = 0.45;
const CROSSFADE_SECONDS = 1.2;

const players = new Map();
let currentTrack = null;
let lastTick = null;
let isTicking = false;

function getPlayer(track) {
  if (!players.has(track)) {
    const audio = new Audio(TRACKS[track]);
    audio.loop = true;
    audio.preload = 'auto';
    players.set(track, { audio, volume: 0, target: 0 });
  }
  return players.get(track);
}

function startPlayback(player) {
  player.audio.play().catch(() => {});
}

function tick(now) {
  const dt = lastTick === null ? 0 : (now - lastTick) / 1000;
  lastTick = now;
  const step = (MUSIC_VOLUME / CROSSFADE_SECONDS) * dt;
  let isFading = false;
  for (const player of players.values()) {
    if (player.volume < player.target) player.volume = Math.min(player.target, player.volume + step);
    else if (player.volume > player.target) player.volume = Math.max(player.target, player.volume - step);
    player.audio.volume = player.volume;
    if (player.volume === 0 && player.target === 0 && !player.audio.paused) {
      player.audio.pause();
      player.audio.currentTime = 0;
    }
    if (player.volume !== player.target) isFading = true;
  }
  if (isFading) requestAnimationFrame(tick);
  else { lastTick = null; isTicking = false; }
}

function startFade() {
  if (isTicking) return;
  isTicking = true;
  requestAnimationFrame(tick);
}

export const music = {
  play(track) {
    if (track === currentTrack) return;
    currentTrack = track;
    for (const [key, player] of players) if (key !== track) player.target = 0;
    const player = getPlayer(track);
    player.target = MUSIC_VOLUME;
    player.audio.volume = player.volume;
    startPlayback(player);
    startFade();
  },

  resume() {
    if (!currentTrack) return;
    const player = getPlayer(currentTrack);
    if (player.audio.paused) startPlayback(player);
  },
};
