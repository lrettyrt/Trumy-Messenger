const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
 
const JWT_SECRET = process.env.JWT_SECRET || 'trumy-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';
 
const AVATAR_COLORS = [
  '#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245',
  '#3ba55d', '#faa61a', '#e67e22', '#9b59b6', '#1abc9c',
  '#e91e63', '#2196f3', '#ff5722', '#795548', '#607d8b'
];
 
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}
 
function register(username, email, password) {
  if (!username || !email || !password) {
    return { error: 'All fields are required' };
  }
  if (username.length < 2 || username.length > 32) {
    return { error: 'Username must be 2-32 characters' };
  }
  if (password.length < 4) {
    return { error: 'Password must be at least 4 characters' };
  }
 
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return { error: 'Username or email already taken' };
  }
 
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const avatarColor = randomColor();
 
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, avatar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, email, passwordHash, avatarColor);
 
  // Auto-join public channels
  const publicChannels = db.prepare("SELECT id FROM channels WHERE type = 'public'").all();
  const joinStmt = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  for (const ch of publicChannels) {
    joinStmt.run(ch.id, id);
  }
 
  const token = jwt.sign({ userId: id, username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
 
  return {
    token,
    user: { id, username, email, avatar_color: avatarColor }
  };
}
 
function login(email, password) {
  if (!email || !password) {
    return { error: 'Email and password are required' };
  }
 
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return { error: 'Invalid email or password' };
  }
 
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { error: 'Invalid email or password' };
  }
 
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
 
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_color: user.avatar_color
    }
  };
}
 
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
 
function getUserById(id) {
  return db.prepare('SELECT id, username, email, avatar_color, status, last_seen FROM users WHERE id = ?').get(id);
}
 
module.exports = { register, login, verifyToken, getUserById };
