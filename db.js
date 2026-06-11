const Database = require('better-sqlite3');
const path = require('path');
 
const dbPath = path.join(__dirname, 'trumy.db');
const db = new Database(dbPath);
 
// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
 
// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#5865f2',
    status TEXT DEFAULT 'offline',
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
 
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'public',
    owner_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
 
  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    file_url TEXT,
    reply_to TEXT,
    edited INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    file_url TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS dm_conversations (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL,
    user2_id TEXT NOT NULL,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user1_id, user2_id)
  );
 
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
`);
 
// Insert default channels
const existingChannels = db.prepare('SELECT COUNT(*) as count FROM channels').get();
if (existingChannels.count === 0) {
  const { v4: uuidv4 } = require('uuid');
  
  const systemUserId = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_color, status)
    VALUES (?, 'Trumy Bot', 'bot@trumy.app', 'nologin', '#57f287', 'online')
  `).run(systemUserId);
 
  const generalId = uuidv4();
  const randomId = uuidv4();
  
  db.prepare(`
    INSERT INTO channels (id, name, description, type, owner_id)
    VALUES (?, 'general', 'General discussion for everyone', 'public', ?)
  `).run(generalId, systemUserId);
 
  db.prepare(`
    INSERT INTO channels (id, name, description, type, owner_id)
    VALUES (?, 'random', 'Off-topic conversations and fun', 'public', ?)
  `).run(randomId, systemUserId);
}
 
module.exports = db;
