// Relay server: it never decrypts anything, it only forwards ciphertext.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static('public'));

const users = new Map(); // socket.id -> username

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const socketsOf = (name) =>
  [...users.entries()].filter(([, n]) => sameName(n, name)).map(([id]) => id);
const broadcastUsers = () => io.emit('users', [...new Set(users.values())]);
const system = (text) => io.emit('system', { text, t: Date.now() });

io.on('connection', (socket) => {
  socket.on('join', (data, ack) => {
    const name = String((data && data.name) || '').trim().slice(0, 20);
    const rejoin = !!(data && data.rejoin);
    if (!name) return ack && ack({ ok: false, error: 'Enter a username' });

    const existing = socketsOf(name).filter((id) => id !== socket.id);
    if (existing.length && !rejoin) {
      return ack && ack({ ok: false, error: `"${name}" is already online. Pick another name.` });
    }
    existing.forEach((id) => users.delete(id)); // reconnect: replace stale socket

    users.set(socket.id, name);
    if (!rejoin) system(`${name} joined the chat`);
    broadcastUsers();
    ack && ack({ ok: true, name });
  });

  socket.on('msg', (m) => {
    const from = users.get(socket.id);
    if (!from || !m) return;
    const packet = {
      from,
      to: m.to || null,
      cipher: String(m.cipher || ''),
      ct: String(m.ct || '').slice(0, 2000),
      t: Date.now(),
    };
    console.log(`[WIRE] ${from} -> ${packet.to || 'MAIN ROOM'} (${packet.cipher}): ${packet.ct}`);
    if (packet.to) socketsOf(packet.to).forEach((id) => io.to(id).emit('msg', packet));
    else socket.broadcast.emit('msg', packet);
  });

  socket.on('typing', (d) => {
    const from = users.get(socket.id);
    if (!from) return;
    const to = d && d.to;
    const payload = { from, to: to || null };
    if (to) socketsOf(to).forEach((id) => io.to(id).emit('typing', payload));
    else socket.broadcast.emit('typing', payload);
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);
    if (name && !socketsOf(name).length) {
      system(`${name} left the chat`);
    }
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));
