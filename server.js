// Relay server: it never decrypts anything, it only forwards ciphertext.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static('public'));

const users = new Map(); // socket.id -> username

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    name = String(name || '').trim().slice(0, 20) || 'Guest';
    users.set(socket.id, name);
    io.emit('system', `${name} joined the chat`);
    io.emit('users', [...users.values()]);
  });

  socket.on('msg', (m) => {
    const user = users.get(socket.id);
    if (!user) return;
    const packet = { user, cipher: m.cipher, ct: String(m.ct).slice(0, 2000), t: Date.now() };
    console.log(`[WIRE] ${user} (${packet.cipher}): ${packet.ct}`); // what the server "sees"
    socket.broadcast.emit('msg', packet);
  });

  socket.on('typing', () => {
    const u = users.get(socket.id);
    if (u) socket.broadcast.emit('typing', u);
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);
    if (name) {
      io.emit('system', `${name} left the chat`);
      io.emit('users', [...users.values()]);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));
