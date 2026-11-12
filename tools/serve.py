"""Serve Naxos Fight and relay online matches over WebSocket, with the standard library only.

Usage: python tools/serve.py [port]   (default 8790)
Static files come from the repository root. /ws pairs a host and a guest by match code and forwards
every message between them, so an online match only needs this one HTTP(S) origin (works through an
ngrok tunnel and corporate networks, no peer-to-peer connection).
"""
import asyncio
import base64
import hashlib
import json
import mimetypes
import struct
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
WEBSOCKET_PATH = '/ws'
WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
OPCODE_TEXT = 0x1
OPCODE_CLOSE = 0x8
OPCODE_PING = 0x9
OPCODE_PONG = 0xA
MAX_HEADER_BYTES = 16384
MAX_MESSAGE_BYTES = 65536
DEFAULT_PORT = 8790

rooms = {}


class WebSocketPeer:
    def __init__(self, reader, writer):
        self.reader = reader
        self.writer = writer
        self.closed = False

    async def receive(self):
        while True:
            head = await self.reader.readexactly(2)
            opcode = head[0] & 0x0F
            masked = head[1] & 0x80
            length = head[1] & 0x7F
            if length == 126:
                length = struct.unpack('!H', await self.reader.readexactly(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', await self.reader.readexactly(8))[0]
            if length > MAX_MESSAGE_BYTES:
                return None
            mask = await self.reader.readexactly(4) if masked else b'\0\0\0\0'
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(await self.reader.readexactly(length)))
            if opcode == OPCODE_CLOSE:
                return None
            if opcode == OPCODE_PING:
                await self.send_frame(OPCODE_PONG, payload)
                continue
            if opcode == OPCODE_TEXT:
                return payload.decode('utf-8')

    async def send_frame(self, opcode, payload):
        if self.closed:
            return
        length = len(payload)
        if length < 126:
            header = struct.pack('!BB', 0x80 | opcode, length)
        elif length < 65536:
            header = struct.pack('!BBH', 0x80 | opcode, 126, length)
        else:
            header = struct.pack('!BBQ', 0x80 | opcode, 127, length)
        try:
            self.writer.write(header + payload)
            await self.writer.drain()
        except (ConnectionError, RuntimeError):
            self.closed = True

    async def send_json(self, message):
        await self.send_frame(OPCODE_TEXT, json.dumps(message).encode('utf-8'))

    async def close(self):
        if not self.closed:
            await self.send_frame(OPCODE_CLOSE, b'')
            self.closed = True
            self.writer.close()


async def send_status(peer, status):
    await peer.send_json({'kind': 'relayStatus', 'status': status})


async def relay(peer):
    hello = json.loads(await peer.receive() or '{}')
    code = str(hello.get('code', ''))
    role = hello.get('kind')
    room = rooms.get(code)
    if role == 'host' and room is None:
        room = rooms[code] = {'host': peer, 'guest': None}
        await send_status(peer, 'waiting')
    elif role == 'join' and room is not None and room['guest'] is None:
        room['guest'] = peer
        await send_status(room['host'], 'connected')
        await send_status(peer, 'connected')
    else:
        await send_status(peer, 'failed')
        return
    side, other_side = ('host', 'guest') if role == 'host' else ('guest', 'host')
    try:
        while True:
            text = await peer.receive()
            if text is None:
                break
            other = room[other_side]
            if other is not None:
                await other.send_frame(OPCODE_TEXT, text.encode('utf-8'))
    finally:
        room[side] = None
        other = room[other_side]
        if other is not None:
            await send_status(other, 'closed')
            await other.close()
        if rooms.get(code) is room:
            del rooms[code]


async def handle_websocket(reader, writer, headers):
    key = headers.get('sec-websocket-key')
    if not key:
        await respond(writer, 400, b'Bad Request')
        return
    accept = base64.b64encode(hashlib.sha1((key + WEBSOCKET_GUID).encode()).digest()).decode()
    writer.write((
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n\r\n'
    ).encode())
    await writer.drain()
    peer = WebSocketPeer(reader, writer)
    try:
        await relay(peer)
    except (asyncio.IncompleteReadError, ConnectionError, json.JSONDecodeError, UnicodeDecodeError):
        pass
    finally:
        await peer.close()


async def respond(writer, status, body, content_type='text/plain; charset=utf-8', head_only=False):
    reason = {200: 'OK', 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed'}.get(status, 'OK')
    writer.write((
        f'HTTP/1.1 {status} {reason}\r\n'
        f'Content-Type: {content_type}\r\n'
        f'Content-Length: {len(body)}\r\n'
        'Cache-Control: no-cache\r\n'
        'Connection: close\r\n\r\n'
    ).encode() + (b'' if head_only else body))
    await writer.drain()


async def handle_file(writer, method, path):
    relative = unquote(urlparse(path).path).lstrip('/') or 'index.html'
    target = (ROOT / relative).resolve()
    if ROOT not in target.parents and target != ROOT:
        await respond(writer, 404, b'Not Found')
        return
    if target.is_dir():
        target = target / 'index.html'
    if not target.is_file():
        await respond(writer, 404, b'Not Found')
        return
    content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
    if content_type.startswith('text/') or content_type in ('application/javascript', 'application/json'):
        content_type += '; charset=utf-8'
    await respond(writer, 200, target.read_bytes(), content_type, head_only=method == 'HEAD')


async def handle_connection(reader, writer):
    try:
        raw = await reader.readuntil(b'\r\n\r\n')
        if len(raw) > MAX_HEADER_BYTES:
            return
        request_line, *header_lines = raw.decode('latin-1').split('\r\n')
        method, path, _ = request_line.split(' ', 2)
        headers = {name.strip().lower(): value.strip() for name, _, value in (line.partition(':') for line in header_lines if line)}
        if urlparse(path).path == WEBSOCKET_PATH and headers.get('upgrade', '').lower() == 'websocket':
            await handle_websocket(reader, writer, headers)
        elif method in ('GET', 'HEAD'):
            await handle_file(writer, method, path)
        else:
            await respond(writer, 405, b'Method Not Allowed')
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError, ValueError):
        pass
    finally:
        if not writer.is_closing():
            writer.close()


async def main(port):
    mimetypes.add_type('application/javascript', '.js')
    server = await asyncio.start_server(handle_connection, '0.0.0.0', port, limit=MAX_HEADER_BYTES)
    print(f'Naxos Fight on http://localhost:{port} (online relay at {WEBSOCKET_PATH})', flush=True)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT))
