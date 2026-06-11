const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth');
 
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6 // 10MB
});
 
const PORT = process.env.PORT || 3000;
 
// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 
// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
 
// ─── REST API ───────────────────────────────────────────────
 
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  const result = auth.register(username, email, password);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
 
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const result = auth.login(email, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});
 
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname });
});
 
app.get('/api/channels', (req, res) => {
  const channels = db.prepare("SELECT * FROM channels ORDER BY created_at ASC").all();
  res.json(channels);
});
 
app.get('/api/users', (req, res) => {
  const users = db.prepare("SELECT id, username, avatar_color, status, last_seen FROM users WHERE username != 'Trumy Bot'").all();
  res.json(users);
});
 
// ─── SOCKET.IO ──────────────────────────────────────────────
 
const onlineUsers = new Map(); // socketId -> user
const userSockets = new Map(); // userId -> Set<socketId>
 
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  
  const decoded = auth.verifyToken(token);
  if (!decoded) return next(new Error('Invalid token'));
  
  const user = auth.getUserById(decoded.userId);
  if (!user) return next(new Error('User not found'));
  
  socket.user = user;
  next();
});
 
io.on('connection', (socket) => {
  const user = socket.user;
  
  // Track online status
  onlineUsers.set(socket.id, user);
  if (!userSockets.has(user.id)) {
    userSockets.set(user.id, new Set());
  }
  userSockets.get(user.id).add(socket.id);
  
  // Update user status
  db.prepare("UPDATE users SET status = 'online' WHERE id = ?").run(user.id);
  io.emit('user:online', { userId: user.id, username: user.username });
  
  // Send online users list
  const onlineList = [];
  const seen = new Set();
  for (const [, u] of onlineUsers) {
    if (!seen.has(u.id)) {
      onlineList.push({ userId: u.id, username: u.username, avatar_color: u.avatar_color });
      seen.add(u.id);
    }
  }
  socket.emit('users:online', onlineList);
 
  // ─── CHANNELS ───────────────────────────────────────────
  
  socket.on('channel:join', (channelId) => {
    socket.join('channel:' + channelId);
    
    // Add to channel_members if not already
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, user.id);
    
    // Send message history (last 100)
    const messages = db.prepare(`
      SELECT m.*, u.username, u.avatar_color
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all(channelId).reverse();
    
    socket.emit('channel:messages', { channelId, messages });
  });
 
  socket.on('channel:leave', (channelId) => {
    socket.leave('channel:' + channelId);
  });
 
  socket.on('channel:create', ({ name, description }) => {
    if (!name || name.length < 1) return;
    const channelName = name.toLowerCase().replace(/[^a-z0-9а-яё-]/gi, '-').substring(0, 40);
    
    const existing = db.prepare('SELECT id FROM channels WHERE name = ?').get(channelName);
    if (existing) {
      socket.emit('error:message', 'Channel name already exists');
      return;
    }
    
    const id = uuidv4();
    db.prepare(`
      INSERT INTO channels (id, name, description, type, owner_id)
      VALUES (?, ?, ?, 'public', ?)
    `).run(id, channelName, description || '', user.id);
    
    db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(id, user.id);
    
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    io.emit('channel:created', channel);
  });
 
  socket.on('message:send', ({ channelId, content, type, fileUrl, replyTo }) => {
    if (!content && !fileUrl) return;
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO messages (id, channel_id, user_id, content, type, file_url, reply_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, channelId, user.id, content || '', type || 'text', fileUrl || null, replyTo || null, now);
    
    const message = {
      id,
      channel_id: channelId,
      user_id: user.id,
      username: user.username,
      avatar_color: user.avatar_color,
      content: content || '',
      type: type || 'text',
      file_url: fileUrl || null,
      reply_to: replyTo || null,
      created_at: now
    };
    
    io.to('channel:' + channelId).emit('message:new', message);
  });
 
  socket.on('message:edit', ({ messageId, content }) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(messageId, user.id);
    if (!msg) return;
    
    db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(content, messageId);
    io.to('channel:' + msg.channel_id).emit('message:edited', { messageId, content });
  });
 
  socket.on('message:delete', (messageId) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(messageId, user.id);
    if (!msg) return;
    
    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    io.to('channel:' + msg.channel_id).emit('message:deleted', { messageId, channelId: msg.channel_id });
  });
 
  // ─── TYPING INDICATOR ──────────────────────────────────
  
  socket.on('typing:start', (channelId) => {
    socket.to('channel:' + channelId).emit('typing:start', {
      userId: user.id,
      username: user.username,
      channelId
    });
  });
 
  socket.on('typing:stop', (channelId) => {
    socket.to('channel:' + channelId).emit('typing:stop', {
      userId: user.id,
      channelId
    });
  });
 
  // ─── DIRECT MESSAGES ───────────────────────────────────
  
  socket.on('dm:open', (targetUserId) => {
    // Get or create DM conversation
    let conv = db.prepare(`
      SELECT * FROM dm_conversations 
      WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
    `).get(user.id, targetUserId, targetUserId, user.id);
    
    if (!conv) {
      const id = uuidv4();
      db.prepare('INSERT INTO dm_conversations (id, user1_id, user2_id) VALUES (?, ?, ?)').run(id, user.id, targetUserId);
      conv = { id, user1_id: user.id, user2_id: targetUserId };
    }
    
    socket.join('dm:' + conv.id);
    
    // Send DM history
    const messages = db.prepare(`
      SELECT dm.*, u.username, u.avatar_color
      FROM direct_messages dm
      JOIN users u ON dm.sender_id = u.id
      WHERE (dm.sender_id = ? AND dm.receiver_id = ?) OR (dm.sender_id = ? AND dm.receiver_id = ?)
      ORDER BY dm.created_at DESC
      LIMIT 100
    `).all(user.id, targetUserId, targetUserId, user.id).reverse();
    
    // Mark as read
    db.prepare('UPDATE direct_messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?').run(user.id, targetUserId);
    
    socket.emit('dm:messages', { conversationId: conv.id, targetUserId, messages });
  });
 
  socket.on('dm:send', ({ targetUserId, content, type, fileUrl }) => {
    if (!content && !fileUrl) return;
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO direct_messages (id, sender_id, receiver_id, content, type, file_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, targetUserId, content || '', type || 'text', fileUrl || null, now);
    
    // Get or create conversation
    let conv = db.prepare(`
      SELECT * FROM dm_conversations 
      WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
    `).get(user.id, targetUserId, targetUserId, user.id);
    
    if (!conv) {
      const convId = uuidv4();
      db.prepare('INSERT INTO dm_conversations (id, user1_id, user2_id, last_message_at) VALUES (?, ?, ?, ?)').run(convId, user.id, targetUserId, now);
      conv = { id: convId };
    } else {
      db.prepare('UPDATE dm_conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
    }
    
    const message = {
      id,
      sender_id: user.id,
      receiver_id: targetUserId,
      username: user.username,
      avatar_color: user.avatar_color,
      content: content || '',
      type: type || 'text',
      file_url: fileUrl || null,
      created_at: now
    };
    
    // Send to both users in the DM room
    io.to('dm:' + conv.id).emit('dm:new', message);
    
    // Also notify target user if they're online but haven't opened this DM
    const targetSockets = userSockets.get(targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('dm:notification', {
          from: { id: user.id, username: user.username, avatar_color: user.avatar_color },
          preview: (content || '').substring(0, 50)
        });
      }
    }
  });
 
  socket.on('dm:typing', (targetUserId) => {
    const conv = db.prepare(`
      SELECT * FROM dm_conversations 
      WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
    `).get(user.id, targetUserId, targetUserId, user.id);
    
    if (conv) {
      socket.to('dm:' + conv.id).emit('dm:typing', { userId: user.id, username: user.username });
    }
  });
 
  // ─── DISCONNECT ─────────────────────────────────────────
  
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    
    const sockets = userSockets.get(user.id);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(user.id);
        db.prepare("UPDATE users SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
        io.emit('user:offline', { userId: user.id });
      }
    }
  });
});
 
// Serve main page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
 
server.listen(PORT, () => {
  console.log(`Trumy messenger running on http://localhost:${PORT}`);
});
