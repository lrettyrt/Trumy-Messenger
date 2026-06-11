// ═══════════ TRUMY CLIENT ═══════════
 
const API_URL = '';
let socket = null;
let currentUser = null;
let currentChannel = null;
let currentDM = null;
let typingTimeout = null;
let replyingTo = null;
let allUsers = [];
let onlineUserIds = new Set();
 
// ─── DOM ELEMENTS ─────────────────────────────────────────
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
 
const channelsList = document.getElementById('channels-list');
const dmList = document.getElementById('dm-list');
const messagesContainer = document.getElementById('messages-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');
const fileInput = document.getElementById('file-input');
const chatTitle = document.getElementById('chat-title');
const chatDescription = document.getElementById('chat-description');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');
const btnNewChannel = document.getElementById('btn-new-channel');
const modalOverlay = document.getElementById('modal-overlay');
const modalClose = document.getElementById('modal-close');
const createChannelForm = document.getElementById('create-channel-form');
const membersPanel = document.getElementById('members-panel');
const btnMembers = document.getElementById('btn-members');
const closeMembers = document.getElementById('close-members');
const onlineMembers = document.getElementById('online-members');
const allMembers = document.getElementById('all-members');
const onlineCount = document.getElementById('online-count');
const replyPreview = document.getElementById('reply-preview');
const replyTextEl = document.getElementById('reply-text');
const replyCancel = document.getElementById('reply-cancel');
const sidebarToggle = document.getElementById('sidebar-toggle');
 
// ─── AUTH ─────────────────────────────────────────────────
 
showRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
});
 
showLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});
 
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
 
  try {
    const res = await fetch(API_URL + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.error) { loginError.textContent = data.error; return; }
    saveAuth(data);
    initChat();
  } catch (err) {
    loginError.textContent = 'Connection error';
  }
});
 
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
 
  try {
    const res = await fetch(API_URL + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (data.error) { registerError.textContent = data.error; return; }
    saveAuth(data);
    initChat();
  } catch (err) {
    registerError.textContent = 'Connection error';
  }
});
 
function saveAuth(data) {
  localStorage.setItem('trumy_token', data.token);
  localStorage.setItem('trumy_user', JSON.stringify(data.user));
  currentUser = data.user;
}
 
function loadAuth() {
  const token = localStorage.getItem('trumy_token');
  const user = localStorage.getItem('trumy_user');
  if (token && user) {
    currentUser = JSON.parse(user);
    return token;
  }
  return null;
}
 
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('trumy_token');
  localStorage.removeItem('trumy_user');
  if (socket) socket.disconnect();
  currentUser = null;
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
});
 
// ─── INIT ─────────────────────────────────────────────────
 
function initChat() {
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
 
  // Set user panel
  userAvatar.style.backgroundColor = currentUser.avatar_color;
  userAvatar.textContent = currentUser.username[0].toUpperCase();
  userName.textContent = currentUser.username;
 
  connectSocket();
  loadChannels();
  loadUsers();
}
 
// ─── SOCKET CONNECTION ────────────────────────────────────
 
function connectSocket() {
  const token = localStorage.getItem('trumy_token');
  socket = io({ auth: { token } });
 
  socket.on('connect', () => {
    console.log('Connected to Trumy');
  });
 
  socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
    if (err.message === 'Authentication required' || err.message === 'Invalid token') {
      btnLogout.click();
    }
  });
 
  // Online users
  socket.on('users:online', (users) => {
    onlineUserIds.clear();
    users.forEach(u => onlineUserIds.add(u.userId));
    updateMembersPanel();
    updateDMStatuses();
  });
 
  socket.on('user:online', ({ userId }) => {
    onlineUserIds.add(userId);
    updateMembersPanel();
    updateDMStatuses();
  });
 
  socket.on('user:offline', ({ userId }) => {
    onlineUserIds.delete(userId);
    updateMembersPanel();
    updateDMStatuses();
  });
 
  // Channel messages
  socket.on('channel:messages', ({ channelId, messages }) => {
    if (currentChannel === channelId) {
      renderMessages(messages);
    }
  });
 
  socket.on('message:new', (msg) => {
    if (currentChannel === msg.channel_id) {
      appendMessage(msg);
      scrollToBottom();
    }
  });
 
  socket.on('message:edited', ({ messageId, content }) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"] .msg-content`);
    if (el) {
      el.innerHTML = formatContent(content) + '<span class="msg-edited">(ред.)</span>';
    }
  });
 
  socket.on('message:deleted', ({ messageId }) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) el.remove();
  });
 
  // DM messages
  socket.on('dm:messages', ({ conversationId, targetUserId, messages }) => {
    if (currentDM === targetUserId) {
      renderMessages(messages, true);
    }
  });
 
  socket.on('dm:new', (msg) => {
    if (currentDM === msg.receiver_id || currentDM === msg.sender_id) {
      appendMessage(msg, true);
      scrollToBottom();
    }
  });
 
  socket.on('dm:notification', ({ from, preview }) => {
    if (currentDM !== from.id) {
      // Show notification badge
      const dmItem = document.querySelector(`[data-dm-user="${from.id}"]`);
      if (dmItem) {
        let badge = dmItem.querySelector('.dm-notification');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'dm-notification';
          dmItem.appendChild(badge);
        }
        badge.textContent = '!';
      }
    }
  });
 
  // Typing
  socket.on('typing:start', ({ username, channelId }) => {
    if (currentChannel === channelId) {
      showTyping(username);
    }
  });
 
  socket.on('typing:stop', ({ channelId }) => {
    if (currentChannel === channelId) {
      hideTyping();
    }
  });
 
  socket.on('dm:typing', ({ username }) => {
    showTyping(username);
  });
 
  // Channel created
  socket.on('channel:created', (channel) => {
    addChannelToList(channel);
  });
 
  socket.on('error:message', (msg) => {
    alert(msg);
  });
}
 
// ─── CHANNELS ─────────────────────────────────────────────
 
async function loadChannels() {
  const res = await fetch(API_URL + '/api/channels');
  const channels = await res.json();
  channelsList.innerHTML = '';
  channels.forEach(addChannelToList);
  
  // Join first channel by default
  if (channels.length > 0 && !currentChannel) {
    selectChannel(channels[0].id, channels[0].name, channels[0].description);
  }
}
 
function addChannelToList(channel) {
  const li = document.createElement('li');
  li.className = 'nav-item';
  li.dataset.channelId = channel.id;
  li.innerHTML = `<span class="channel-hash">#</span> ${escapeHtml(channel.name)}`;
  li.addEventListener('click', () => selectChannel(channel.id, channel.name, channel.description));
  channelsList.appendChild(li);
}
 
function selectChannel(channelId, name, description) {
  // Leave previous
  if (currentChannel) socket.emit('channel:leave', currentChannel);
  currentDM = null;
  currentChannel = channelId;
 
  // Update UI
  chatTitle.textContent = '# ' + name;
  chatDescription.textContent = description || '';
  messagesList.innerHTML = '';
  hideTyping();
  clearReply();
 
  // Highlight active
  document.querySelectorAll('#channels-list .nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#dm-list .nav-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`[data-channel-id="${channelId}"]`);
  if (active) active.classList.add('active');
 
  // Join channel
  socket.emit('channel:join', channelId);
 
  // Close sidebar on mobile
  document.querySelector('.sidebar').classList.remove('open');
}
 
// ─── DIRECT MESSAGES ──────────────────────────────────────
 
async function loadUsers() {
  const res = await fetch(API_URL + '/api/users');
  allUsers = await res.json();
  renderDMList();
  updateMembersPanel();
}
 
function renderDMList() {
  dmList.innerHTML = '';
  allUsers.filter(u => u.id !== currentUser.id).forEach(user => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.dataset.dmUser = user.id;
    const isOnline = onlineUserIds.has(user.id);
    li.innerHTML = `
      <div class="dm-avatar" style="background:${user.avatar_color}">${user.username[0].toUpperCase()}</div>
      <span>${escapeHtml(user.username)}</span>
      <span class="dm-status ${isOnline ? 'online' : ''}"></span>
    `;
    li.addEventListener('click', () => openDM(user));
    dmList.appendChild(li);
  });
}
 
function updateDMStatuses() {
  document.querySelectorAll('#dm-list .nav-item').forEach(el => {
    const userId = el.dataset.dmUser;
    const dot = el.querySelector('.dm-status');
    if (dot) {
      dot.classList.toggle('online', onlineUserIds.has(userId));
    }
  });
}
 
function openDM(user) {
  if (currentChannel) {
    socket.emit('channel:leave', currentChannel);
    currentChannel = null;
  }
  currentDM = user.id;
 
  // Update UI
  chatTitle.textContent = user.username;
  chatDescription.textContent = onlineUserIds.has(user.id) ? 'в сети' : 'не в сети';
  messagesList.innerHTML = '';
  hideTyping();
  clearReply();
 
  // Highlight
  document.querySelectorAll('#channels-list .nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#dm-list .nav-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`[data-dm-user="${user.id}"]`);
  if (active) {
    active.classList.add('active');
    const badge = active.querySelector('.dm-notification');
    if (badge) badge.remove();
  }
 
  socket.emit('dm:open', user.id);
  document.querySelector('.sidebar').classList.remove('open');
}
 
// ─── MESSAGES RENDERING ───────────────────────────────────
 
function renderMessages(messages, isDM = false) {
  messagesList.innerHTML = '';
  if (messages.length === 0) {
    messagesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <h3>Начните беседу!</h3>
        <p>Отправьте первое сообщение</p>
      </div>
    `;
    return;
  }
 
  let lastUser = null;
  let lastTime = null;
  messages.forEach(msg => {
    const senderId = isDM ? msg.sender_id : msg.user_id;
    const msgTime = new Date(msg.created_at).getTime();
    const isGrouped = lastUser === senderId && (msgTime - lastTime) < 300000; // 5 min
    appendMessage(msg, isDM, isGrouped);
    lastUser = senderId;
    lastTime = msgTime;
  });
  scrollToBottom(true);
}
 
function appendMessage(msg, isDM = false, isGrouped = false) {
  const senderId = isDM ? msg.sender_id : msg.user_id;
  const isOwn = senderId === currentUser.id;
  const div = document.createElement('div');
  div.className = `message ${isGrouped ? '' : 'message-group-start'}`;
  div.dataset.msgId = msg.id;
 
  const time = formatTime(msg.created_at);
  const initial = (msg.username || '?')[0].toUpperCase();
  const color = msg.avatar_color || '#5865f2';
 
  let replyHtml = '';
  if (msg.reply_to) {
    replyHtml = `<div class="msg-reply-bar">↩ ответ на сообщение</div>`;
  }
 
  let contentHtml = '';
  if (msg.type === 'image' && msg.file_url) {
    contentHtml = `<img class="msg-image" src="${msg.file_url}" alt="image" loading="lazy">`;
  } else if (msg.type === 'file' && msg.file_url) {
    contentHtml = `<a class="msg-file" href="${msg.file_url}" target="_blank">📎 ${escapeHtml(msg.content || 'File')}</a>`;
  } else {
    contentHtml = `<div class="msg-content">${formatContent(msg.content)}${msg.edited ? '<span class="msg-edited">(ред.)</span>' : ''}</div>`;
  }
 
  const actionsHtml = isOwn ? `
    <div class="msg-actions">
      <button class="msg-action-btn" onclick="editMessage('${msg.id}')">✏️</button>
      <button class="msg-action-btn" onclick="deleteMessage('${msg.id}')">🗑</button>
    </div>
  ` : `
    <div class="msg-actions">
      <button class="msg-action-btn" onclick="replyToMessage('${msg.id}', '${escapeHtml(msg.username)}')">↩</button>
    </div>
  `;
 
  if (isGrouped) {
    div.innerHTML = `
      <div class="msg-avatar hidden-avatar"></div>
      <div class="msg-body">
        ${replyHtml}
        ${contentHtml}
      </div>
      ${actionsHtml}
    `;
  } else {
    div.innerHTML = `
      <div class="msg-avatar" style="background:${color}" onclick="openDMFromMessage('${senderId}')">${initial}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-username" style="color:${color}">${escapeHtml(msg.username)}</span>
          <span class="msg-time">${time}</span>
        </div>
        ${replyHtml}
        ${contentHtml}
      </div>
      ${actionsHtml}
    `;
  }
 
  messagesList.appendChild(div);
}
 
function scrollToBottom(instant = false) {
  setTimeout(() => {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: instant ? 'auto' : 'smooth'
    });
  }, 50);
}
 
// ─── MESSAGE ACTIONS ──────────────────────────────────────
 
function editMessage(msgId) {
  const el = document.querySelector(`[data-msg-id="${msgId}"] .msg-content`);
  if (!el) return;
  const oldText = el.textContent.replace('(ред.)', '').trim();
  const newText = prompt('Редактировать сообщение:', oldText);
  if (newText && newText !== oldText) {
    socket.emit('message:edit', { messageId: msgId, content: newText });
  }
}
 
function deleteMessage(msgId) {
  if (confirm('Удалить сообщение?')) {
    socket.emit('message:delete', msgId);
  }
}
 
function replyToMessage(msgId, username) {
  replyingTo = msgId;
  replyTextEl.textContent = `Ответ для ${username}`;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}
 
function clearReply() {
  replyingTo = null;
  replyPreview.classList.add('hidden');
}
 
replyCancel.addEventListener('click', clearReply);
 
window.editMessage = editMessage;
window.deleteMessage = deleteMessage;
window.replyToMessage = replyToMessage;
 
window.openDMFromMessage = function(userId) {
  if (userId === currentUser.id) return;
  const user = allUsers.find(u => u.id === userId);
  if (user) openDM(user);
};
 
// ─── SEND MESSAGE ─────────────────────────────────────────
 
function sendMessage() {
  const content = messageInput.value.trim();
  if (!content) return;
 
  if (currentChannel) {
    socket.emit('message:send', {
      channelId: currentChannel,
      content,
      type: 'text',
      replyTo: replyingTo
    });
  } else if (currentDM) {
    socket.emit('dm:send', {
      targetUserId: currentDM,
      content,
      type: 'text'
    });
  }
 
  messageInput.value = '';
  messageInput.style.height = 'auto';
  clearReply();
 
  if (currentChannel) socket.emit('typing:stop', currentChannel);
}
 
btnSend.addEventListener('click', sendMessage);
 
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
 
// Auto-resize textarea
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
 
  // Typing indicator
  if (currentChannel) {
    socket.emit('typing:start', currentChannel);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing:stop', currentChannel);
    }, 2000);
  } else if (currentDM) {
    socket.emit('dm:typing', currentDM);
  }
});
 
// ─── FILE UPLOAD ──────────────────────────────────────────
 
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
 
  const formData = new FormData();
  formData.append('file', file);
 
  try {
    const res = await fetch(API_URL + '/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
 
    const isImage = file.type.startsWith('image/');
    const type = isImage ? 'image' : 'file';
 
    if (currentChannel) {
      socket.emit('message:send', {
        channelId: currentChannel,
        content: file.name,
        type,
        fileUrl: data.url
      });
    } else if (currentDM) {
      socket.emit('dm:send', {
        targetUserId: currentDM,
        content: file.name,
        type,
        fileUrl: data.url
      });
    }
  } catch (err) {
    alert('Upload failed');
  }
 
  fileInput.value = '';
});
 
// ─── TYPING INDICATOR ─────────────────────────────────────
 
function showTyping(username) {
  typingText.textContent = `${username} печатает...`;
  typingIndicator.classList.remove('hidden');
}
 
function hideTyping() {
  typingIndicator.classList.add('hidden');
}
 
// ─── CREATE CHANNEL ───────────────────────────────────────
 
btnNewChannel.addEventListener('click', () => {
  modalOverlay.classList.remove('hidden');
});
 
modalClose.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});
 
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});
 
createChannelForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('channel-name-input').value.trim();
  const description = document.getElementById('channel-desc-input').value.trim();
  if (!name) return;
  socket.emit('channel:create', { name, description });
  modalOverlay.classList.add('hidden');
  createChannelForm.reset();
});
 
// ─── MEMBERS PANEL ────────────────────────────────────────
 
btnMembers.addEventListener('click', () => {
  membersPanel.classList.toggle('hidden');
  membersPanel.classList.toggle('open');
});
 
closeMembers.addEventListener('click', () => {
  membersPanel.classList.add('hidden');
  membersPanel.classList.remove('open');
});
 
function updateMembersPanel() {
  const online = allUsers.filter(u => onlineUserIds.has(u.id) && u.id !== currentUser.id);
  onlineCount.textContent = online.length + 1; // +1 for current user
 
  onlineMembers.innerHTML = '';
  // Add self first
  onlineMembers.innerHTML += memberHtml(currentUser, true);
  online.forEach(u => {
    onlineMembers.innerHTML += memberHtml(u, true);
  });
 
  allMembers.innerHTML = '';
  allUsers.filter(u => u.id !== currentUser.id && !onlineUserIds.has(u.id)).forEach(u => {
    allMembers.innerHTML += memberHtml(u, false);
  });
}
 
function memberHtml(user, isOnline) {
  return `
    <li class="member-item" onclick="window.openDMFromMessage('${user.id}')">
      <div class="member-avatar" style="background:${user.avatar_color}">
        ${user.username[0].toUpperCase()}
        <span class="status-dot ${isOnline ? 'online' : ''}"></span>
      </div>
      <span class="member-name">${escapeHtml(user.username)}</span>
    </li>
  `;
}
 
// ─── MOBILE SIDEBAR ───────────────────────────────────────
 
sidebarToggle.addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
});
 
// ─── UTILITIES ────────────────────────────────────────────
 
function formatContent(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // URLs
  html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code `text`
  html = html.replace(/`(.+?)`/g, '<code style="background:var(--bg-secondary);padding:1px 4px;border-radius:3px">$1</code>');
  return html;
}
 
function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + time;
}
 
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
 
// ─── INIT ON LOAD ─────────────────────────────────────────
 
(function() {
  const token = loadAuth();
  if (token) {
    initChat();
  }
})();
