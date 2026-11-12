const PEER_PREFIX = 'naxos-fight-';
const CODE_ALPHABET = 'BCDEFGHJKLNPRSTUVXY23456789';

export const CODE_LENGTH = 4;
export const ROLE = Object.freeze({ LOCAL: 'local', HOST: 'host', GUEST: 'guest' });
export const NET_STATUS = Object.freeze({ CONNECTING: 'connecting', WAITING: 'waiting', CONNECTED: 'connected', FAILED: 'failed', CLOSED: 'closed' });

export const CODE_KEYS = Object.fromEntries([...CODE_ALPHABET].map(character => [/\d/.test(character) ? `Digit${character}` : `Key${character}`, character]));

export function createRoomCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

export function isRoomCode(value) {
  return typeof value === 'string' && value.length === CODE_LENGTH && [...value].every(character => CODE_ALPHABET.includes(character));
}

export function buildJoinLink(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('join', code);
  return url.toString();
}

export function readJoinCode() {
  const code = new URL(window.location.href).searchParams.get('join')?.toUpperCase() ?? null;
  return isRoomCode(code) ? code : null;
}

const RELAY_PATH = '/ws';
const RELAY_STATUS = { waiting: NET_STATUS.WAITING, connected: NET_STATUS.CONNECTED, failed: NET_STATUS.FAILED, closed: NET_STATUS.CLOSED };

function relayUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${RELAY_PATH}`;
}

export function createNetSession(options) {
  let session = null;
  let closed = false;
  let opened = false;
  const socket = new WebSocket(relayUrl());
  const report = status => { if (!closed) options.onStatus(status); };

  options.onStatus(NET_STATUS.CONNECTING);
  socket.addEventListener('open', () => {
    opened = true;
    socket.send(JSON.stringify({ kind: options.role === ROLE.HOST ? 'host' : 'join', code: options.code }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.kind === 'relayStatus') report(RELAY_STATUS[message.status] ?? NET_STATUS.FAILED);
    else if (!closed) options.onMessage(message);
  });
  socket.addEventListener('close', () => {
    if (closed) return;
    if (opened) report(NET_STATUS.CLOSED);
    else session = createPeerSession(options);
  });

  return {
    send(message) {
      if (session) session.send(message);
      else if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      closed = true;
      socket.close();
      session?.close();
    },
  };
}

function createPeerSession({ role, code, onMessage, onStatus }) {
  const PeerClass = window.Peer;
  if (!PeerClass) {
    onStatus(NET_STATUS.FAILED);
    return { send() {}, close() {} };
  }
  const peer = role === ROLE.HOST ? new PeerClass(PEER_PREFIX + code) : new PeerClass();
  let connection = null;
  let closed = false;
  const report = status => { if (!closed) onStatus(status); };

  const bind = channel => {
    connection = channel;
    channel.on('open', () => report(NET_STATUS.CONNECTED));
    channel.on('data', onMessage);
    channel.on('close', () => report(NET_STATUS.CLOSED));
    channel.on('error', () => report(NET_STATUS.FAILED));
  };

  onStatus(NET_STATUS.CONNECTING);
  peer.on('open', () => {
    if (role === ROLE.HOST) report(NET_STATUS.WAITING);
    else bind(peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' }));
  });
  peer.on('connection', channel => {
    if (connection) { channel.close(); return; }
    bind(channel);
  });
  peer.on('error', () => report(connection?.open ? NET_STATUS.CLOSED : NET_STATUS.FAILED));

  return {
    send(message) { if (connection?.open) connection.send(message); },
    close() { closed = true; peer.destroy(); },
  };
}
