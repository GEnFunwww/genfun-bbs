const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'genbbs');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// ========== 閭欢鍙戦€侀厤缃?==========
const mailer = nodemailer.createTransport({
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  auth: {
    user: 'Rr_052052052052@163.com',
    pass: 'PBWqF32Vn7ZtVTV4'
  },
  tls: { rejectUnauthorized: false }
});
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const FOLLOWS_FILE = path.join(DATA_DIR, 'follows.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ========== 浼氳瘽瀛樺偍 ==========
const SESSIONS = new Map();
const VERIFY_CODES = new Map(); // key -> { code, expires }

// ========== 鍒濆鍖栫洰褰曞拰鏁版嵁鏂囦欢 ==========
[DATA_DIR, UPLOADS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');

// ========== 宸ュ叿鍑芥暟 ==========
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

// 鍒濆鍖栭粯璁よ缃?if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, { siteName: 'GENFUN 璁哄潧', announcement: '娆㈣繋鏉ュ埌 GENFUN 璁哄潧锛?, allowRegister: true });
if (!fs.existsSync(FOLLOWS_FILE)) writeJSON(FOLLOWS_FILE, []);
const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');
const uid = () => crypto.randomUUID();
const genToken = () => crypto.randomBytes(32).toString('hex');
const fmtSize = (bytes) => {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
};

// ========== Express 閰嶇疆 ==========
const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(express.static(__dirname));
app.use('/genbbs/uploads', express.static(UPLOADS_DIR));

// ========== 璁よ瘉涓棿浠?==========
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = SESSIONS.get(token);
  if (!user) return res.status(401).json({ error: '璇峰厛鐧诲綍' });
  req.user = user;
  req.token = token;
  next();
};

// ========== 鐢ㄦ埛绯荤粺 ==========

// 鍙戦€侀獙璇佺爜
app.post('/api/send-code', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) return res.status(400).json({ error: '璇锋彁渚涢偖绠辨垨鎵嬫満鍙? });

    const key = email || phone;

    // 妫€鏌ユ槸鍚﹀湪鍐峰嵈鏈熷唴锛?0绉掞級
    const existing = VERIFY_CODES.get(key);
    if (existing && Date.now() - existing.sentAt < 60000) {
      const wait = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ error: `璇?{wait}绉掑悗鍐嶈瘯` });
    }

    // 妫€鏌ヨ閭/鎵嬫満鏄惁宸叉敞鍐?    const users = readJSON(USERS_FILE);
    if (email && users.find(u => u.email === email)) {
      return res.status(400).json({ error: '璇ラ偖绠卞凡琚敞鍐? });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: '璇ユ墜鏈哄彿宸茶娉ㄥ唽' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    VERIFY_CODES.set(key, { code, expires: Date.now() + 300000, sentAt: Date.now() });

    // 鍙戦€侀偖浠?    if (email) {
      try {
        await mailer.sendMail({
          from: '"GENFUN璁哄潧" <Rr_052052052052@163.com>',
          to: email,
          subject: 'GENFUN璁哄潧 - 閭楠岃瘉鐮?,
          html: `<div style="max-width:480px;margin:0 auto;padding:30px;font-family:Arial,sans-serif;background:#f6f8fa;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#3b82f6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">GENFUN 璁哄潧</span>
          </div>
          <div style="background:#fff;padding:24px;border-radius:8px;text-align:center;">
            <p style="color:#656d76;font-size:14px;margin:0 0 16px;">鎮ㄧ殑楠岃瘉鐮佹槸</p>
            <div style="font-size:36px;font-weight:800;color:#2563eb;letter-spacing:8px;margin-bottom:16px;">${code}</div>
            <p style="color:#8c959f;font-size:12px;margin:0;">楠岃瘉鐮?5 鍒嗛挓鍐呮湁鏁堬紝璇峰嬁娉勯湶缁欎粬浜?/p>
          </div>
          <p style="color:#8c959f;font-size:11px;text-align:center;margin-top:16px;">姝ら偖浠剁敱绯荤粺鑷姩鍙戦€侊紝璇峰嬁鍥炲</p>
        </div>`
        });
        console.log(`[楠岃瘉鐮乚 閭欢宸插彂閫佽嚦 ${email}锛岄獙璇佺爜: ${code}`);
      } catch (mailErr) {
        console.error(`[閭欢鍙戦€佸け璐 ${email}:`, mailErr.message);
        // 閭欢鍙戦€佸け璐ユ椂鍥為€€锛氳繑鍥為獙璇佺爜璁╃敤鎴蜂粛鍙敞鍐?        return res.json({ ok: true, code, fallback: true, message: '閭欢鍙戦€佸け璐ワ紝楠岃瘉鐮佸凡鏄剧ず鍦ㄩ〉闈笂' });
      }
    } else {
      console.log(`[楠岃瘉鐮乚 ${phone} => ${code}`);
    }

    res.json({ ok: true }); // 涓嶅啀杩斿洖楠岃瘉鐮侊紝瀹夊叏
  } catch (e) {
    console.error('鍙戦€侀獙璇佺爜澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 娉ㄥ唽
app.post('/api/register', (req, res) => {
  try {
    const { email, phone, password, nickname, verifyCode } = req.body;

    if (!nickname || !nickname.trim()) return res.status(400).json({ error: '璇疯緭鍏ユ樀绉? });
    if (!password || password.length < 6) return res.status(400).json({ error: '瀵嗙爜鑷冲皯6浣? });
    if (!email && !phone) return res.status(400).json({ error: '璇峰～鍐欓偖绠辨垨鎵嬫満鍙? });
    if (!verifyCode) return res.status(400).json({ error: '璇疯緭鍏ラ獙璇佺爜' });

    // 閭鏍煎紡楠岃瘉
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '閭鏍煎紡涓嶆纭? });
    }
    // 鎵嬫満鍙锋牸寮忛獙璇?    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '鎵嬫満鍙锋牸寮忎笉姝ｇ‘' });
    }

    // 楠岃瘉鐮佹牎楠?    const key = email || phone;
    const codeData = VERIFY_CODES.get(key);
    if (!codeData) return res.status(400).json({ error: '璇峰厛鑾峰彇楠岃瘉鐮? });
    if (Date.now() > codeData.expires) {
      VERIFY_CODES.delete(key);
      return res.status(400).json({ error: '楠岃瘉鐮佸凡杩囨湡锛岃閲嶆柊鑾峰彇' });
    }
    if (codeData.code !== String(verifyCode).trim()) {
      return res.status(400).json({ error: '楠岃瘉鐮侀敊璇? });
    }
    VERIFY_CODES.delete(key); // 楠岃瘉閫氳繃锛屽垹闄ら獙璇佺爜

    const users = readJSON(USERS_FILE);
    if (email && users.find(u => u.email === email)) {
      return res.status(400).json({ error: '璇ラ偖绠卞凡琚敞鍐? });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: '璇ユ墜鏈哄彿宸茶娉ㄥ唽' });
    }

    const user = {
      id: uid(),
      email: email || '',
      phone: phone || '',
      nickname: nickname.trim(),
      password: sha256(password),
      role: 'user',
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeJSON(USERS_FILE, users);

    const token = genToken();
    const safeUser = { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, role: user.role };
    SESSIONS.set(token, safeUser);

    console.log(`[娉ㄥ唽] ${safeUser.nickname} (${email || phone})`);
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('娉ㄥ唽澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 鐧诲綍
app.post('/api/login', (req, res) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) return res.status(400).json({ error: '璇疯緭鍏ヨ处鍙峰拰瀵嗙爜' });

    const users = readJSON(USERS_FILE);
    const user = users.find(u =>
      (u.email === account || u.phone === account) && u.password === sha256(password)
    );

    if (!user) return res.status(401).json({ error: '璐﹀彿鎴栧瘑鐮侀敊璇? });

    if (user.banned) return res.status(403).json({ error: '璇ヨ处鍙峰凡琚皝绂? });

    const token = genToken();
    const safeUser = { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, role: user.role };
    SESSIONS.set(token, safeUser);

    console.log(`[鐧诲綍] ${safeUser.nickname}`);
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('鐧诲綍澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 鑾峰彇褰撳墠鐢ㄦ埛
app.get('/api/me', auth, (req, res) => {
  // 浠庢暟鎹簱瀹炴椂璇诲彇锛岀‘淇濊鑹蹭俊鎭渶鏂?  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  const safeUser = { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, role: user.role };
  // 鍚屾鏇存柊浼氳瘽
  SESSIONS.set(req.token, safeUser);
  res.json({ user: safeUser });
});

// 閫€鍑虹櫥褰?app.post('/api/logout', auth, (req, res) => {
  SESSIONS.delete(req.token);
  console.log(`[鐧诲嚭] ${req.user.nickname}`);
  res.json({ ok: true });
});

// ========== 绠＄悊鍛樹腑闂翠欢 ==========
const adminAuth = (req, res, next) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: '闇€瑕佺鐞嗗憳鏉冮檺' });
  req.fullUser = user;
  next();
};

// ========== 绠＄悊鍛樼郴缁?==========

// 鑾峰彇鐢ㄦ埛鍒楄〃锛堢鐞嗗憳锛?app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE).map(u => ({
    id: u.id, nickname: u.nickname, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt
  }));
  res.json({ users });
});

// 淇敼鐢ㄦ埛瑙掕壊锛堢鐞嗗憳锛?app.post('/api/admin/user-role', auth, adminAuth, (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !['user', 'admin'].includes(role)) return res.status(400).json({ error: '鍙傛暟閿欒' });
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.id === req.user.id) return res.status(400).json({ error: '涓嶈兘淇敼鑷繁鐨勮鑹? });
  user.role = role;
  writeJSON(USERS_FILE, users);
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} 灏?${user.nickname} 璁句负 ${role}`);
  res.json({ ok: true, userId, role });
});

// 鍒犻櫎浠讳綍甯栧瓙锛堢鐞嗗憳锛?app.delete('/api/admin/posts/:id', auth, adminAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '甯栧瓙涓嶅瓨鍦? });
  posts.splice(idx, 1);
  writeJSON(POSTS_FILE, posts);
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} 鍒犻櫎浜嗗笘瀛?${req.params.id}`);
  res.json({ ok: true });
});

// 浠〃鐩樼粺璁?app.get('/api/admin/stats', auth, adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const posts = readJSON(POSTS_FILE);
  const totalReplies = posts.reduce((sum, p) => sum + (p.replies || []).length, 0);
  const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
  const totalAttachments = posts.reduce((sum, p) => sum + (p.attachments || []).length, 0);
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    stats: {
      users: users.length,
      posts: posts.length,
      replies: totalReplies,
      views: totalViews,
      attachments: totalAttachments,
      admins: users.filter(u => u.role === 'admin').length,
      banned: users.filter(u => u.banned).length,
      todayPosts: posts.filter(p => p.createdAt.slice(0, 10) === today).length
    }
  });
});

// 绠＄悊绔笘瀛愬垪琛紙鍏ㄩ噺锛?app.get('/api/admin/posts', auth, adminAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE).map(p => ({
    id: p.id, title: p.title, category: p.category,
    author: p.author, views: p.views || 0,
    replyCount: (p.replies || []).length,
    attachCount: (p.attachments || []).length,
    pinned: p.pinned || false,
    createdAt: p.createdAt, updatedAt: p.updatedAt
  }));
  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json({ posts });
});

// 缃《/鍙栨秷缃《
app.post('/api/admin/posts/:id/pin', auth, adminAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '甯栧瓙涓嶅瓨鍦? });
  post.pinned = !post.pinned;
  writeJSON(POSTS_FILE, posts);
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} ${post.pinned ? '缃《' : '鍙栨秷缃《'}浜嗗笘瀛? ${post.title}`);
  res.json({ ok: true, pinned: post.pinned });
});

// 鎵归噺鍒犻櫎甯栧瓙
app.post('/api/admin/posts/batch-delete', auth, adminAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '璇烽€夋嫨瑕佸垹闄ょ殑甯栧瓙' });
  let posts = readJSON(POSTS_FILE);
  const deleted = posts.filter(p => ids.includes(p.id));
  posts = posts.filter(p => !ids.includes(p.id));
  writeJSON(POSTS_FILE, posts);
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} 鎵归噺鍒犻櫎浜?${deleted.length} 涓笘瀛恅);
  res.json({ ok: true, count: deleted.length });
});

// 灏佺/瑙ｅ皝鐢ㄦ埛
app.post('/api/admin/users/:id/ban', auth, adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.id === req.user.id) return res.status(400).json({ error: '涓嶈兘灏佺鑷繁' });
  user.banned = !user.banned;
  writeJSON(USERS_FILE, users);
  // 娓呴櫎琚皝绂佺敤鎴风殑浼氳瘽
  if (user.banned) {
    for (const [token, sess] of SESSIONS) {
      if (sess.id === user.id) SESSIONS.delete(token);
    }
  }
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} ${user.banned ? '灏佺' : '瑙ｅ皝'}浜嗙敤鎴? ${user.nickname}`);
  res.json({ ok: true, banned: user.banned });
});

// 鑾峰彇绯荤粺璁剧疆
app.get('/api/admin/settings', auth, adminAuth, (req, res) => {
  res.json({ settings: readJSON(SETTINGS_FILE) });
});

// 鏇存柊绯荤粺璁剧疆
app.post('/api/admin/settings', auth, adminAuth, (req, res) => {
  const { siteName, announcement, allowRegister } = req.body;
  const settings = readJSON(SETTINGS_FILE);
  if (siteName !== undefined) settings.siteName = siteName;
  if (announcement !== undefined) settings.announcement = announcement;
  if (allowRegister !== undefined) settings.allowRegister = allowRegister;
  writeJSON(SETTINGS_FILE, settings);
  console.log(`[绠＄悊鍛榏 ${req.user.nickname} 鏇存柊浜嗙郴缁熻缃甡);
  res.json({ ok: true, settings });
});

// ========== 甯栧瓙绯荤粺 ==========

// 甯栧瓙鍒楄〃锛堟敮鎸佸垎绫汇€佹悳绱€佸垎椤碉級
app.get('/api/posts', (req, res) => {
  try {
    const { category, page = 1, limit = 20, search } = req.query;
    let posts = readJSON(POSTS_FILE);

    // 鍒嗙被杩囨护
    if (category && category !== '鍏ㄩ儴') {
      posts = posts.filter(p => p.category === category);
    }

    // 鍏抽敭璇嶆悳绱?    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      posts = posts.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
      );
    }

    // 缃《浼樺厛锛岀劧鍚庢寜鏇存柊鏃堕棿鍊掑簭
    posts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });

    const total = posts.length;
    const start = (+page - 1) * +limit;
    const pagePosts = posts.slice(start, start + +limit).map(p => ({
      ...p,
      content: p.content.length > 200 ? p.content.substring(0, 200) + '...' : p.content,
      replyCount: (p.replies || []).length,
      attachCount: (p.attachments || []).length
    }));

    res.json({
      posts: pagePosts,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
      limit: +limit
    });
  } catch (e) {
    console.error('鑾峰彇甯栧瓙鍒楄〃澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 甯栧瓙璇︽儏
app.get('/api/posts/:id', (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '甯栧瓙涓嶅瓨鍦? });

    // 澧炲姞娴忚閲?    posts[idx].views = (posts[idx].views || 0) + 1;
    writeJSON(POSTS_FILE, posts);

    res.json({ post: posts[idx] });
  } catch (e) {
    console.error('鑾峰彇甯栧瓙璇︽儏澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 鍙戝笘
app.post('/api/posts', auth, (req, res) => {
  try {
    const { title, content, category, attachments } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ error: '璇疯緭鍏ユ爣棰? });
    if (!content || !content.trim()) return res.status(400).json({ error: '璇疯緭鍏ュ唴瀹? });
    if (title.trim().length > 200) return res.status(400).json({ error: '鏍囬涓嶈兘瓒呰繃200瀛? });

    const posts = readJSON(POSTS_FILE);
    const post = {
      id: uid(),
      title: title.trim(),
      content: content.trim(),
      category: category || '鍏朵粬',
      author: {
        id: req.user.id,
        nickname: req.user.nickname
      },
      attachments: (attachments || []).map(f => ({
        name: f.name,
        size: f.size,
        sizeDisplay: fmtSize(f.size),
        path: f.path,
        mimetype: f.mimetype || ''
      })),
      views: 0,
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    posts.push(post);
    writeJSON(POSTS_FILE, posts);

    console.log(`[鍙戝笘] ${req.user.nickname}: ${post.title}`);
    res.json({ post });
  } catch (e) {
    console.error('鍙戝笘澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 鍥炲甯栧瓙
app.post('/api/posts/:id/reply', auth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '璇疯緭鍏ュ洖澶嶅唴瀹? });

    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '甯栧瓙涓嶅瓨鍦? });

    const reply = {
      id: uid(),
      content: content.trim(),
      author: {
        id: req.user.id,
        nickname: req.user.nickname
      },
      createdAt: new Date().toISOString()
    };

    posts[idx].replies.push(reply);
    posts[idx].updatedAt = new Date().toISOString();
    writeJSON(POSTS_FILE, posts);

    console.log(`[鍥炲] ${req.user.nickname} 鍥炲浜嗗笘瀛? ${posts[idx].title}`);
    res.json({ reply });
  } catch (e) {
    console.error('鍥炲澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// 鍒犻櫎甯栧瓙锛堜粎浣滆€咃級
app.delete('/api/posts/:id', auth, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '甯栧瓙涓嶅瓨鍦? });
    if (posts[idx].author.id !== req.user.id) {
      return res.status(403).json({ error: '鍙兘鍒犻櫎鑷繁鐨勫笘瀛? });
    }

    const deleted = posts.splice(idx, 1)[0];
    writeJSON(POSTS_FILE, posts);

    console.log(`[鍒犲笘] ${req.user.nickname}: ${deleted.title}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('鍒犲笘澶辫触:', e);
    res.status(500).json({ error: '鏈嶅姟鍣ㄩ敊璇? });
  }
});

// ========== 鏂囦欢涓婁紶 ==========

// Multer 閰嶇疆锛氱鐩樺瓨鍌?const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    // 澶勭悊涓枃鏂囦欢鍚?    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(safeName);
    const baseName = path.basename(safeName, ext);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${baseName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB 鍗曟枃浠堕檺鍒?    files: 10 // 鏈€澶?0涓枃浠?  }
});

// 鍗曟枃浠朵笂浼狅紙鏀寔澶ф枃浠讹紝甯﹁繘搴︾敱瀹㈡埛绔?XMLHttpRequest 澶勭悊锛?app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '璇烽€夋嫨鏂囦欢' });

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    console.log(`[涓婁紶] ${req.user.nickname} 涓婁紶浜? ${originalName} (${fmtSize(req.file.size)})`);

    res.json({
      file: {
        name: originalName,
        size: req.file.size,
        sizeDisplay: fmtSize(req.file.size),
        path: `/genbbs/uploads/${req.file.filename}`,
        mimetype: req.file.mimetype
      }
    });
  } catch (e) {
    console.error('鏂囦欢涓婁紶澶辫触:', e);
    res.status(500).json({ error: '涓婁紶澶辫触锛岃閲嶈瘯' });
  }
});

// 澶ф枃浠跺垎鍧椾笂浼?- 鎺ユ敹鍒嗗潡
app.post('/api/upload/chunk', auth, upload.single('chunk'), (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks, fileName } = req.body;
    if (!fileId || chunkIndex === undefined) {
      return res.status(400).json({ error: '鍙傛暟涓嶅畬鏁? });
    }

    const chunkDir = path.join(UPLOADS_DIR, 'chunks', fileId);
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

    // 绉诲姩鍒嗗潡鍒扮洰鏍囩洰褰?    const chunkFile = path.join(chunkDir, `chunk-${String(chunkIndex).padStart(6, '0')}`);
    fs.renameSync(req.file.path, chunkFile);

    res.json({ ok: true, chunkIndex: +chunkIndex, totalChunks: +totalChunks });
  } catch (e) {
    console.error('鍒嗗潡涓婁紶澶辫触:', e);
    res.status(500).json({ error: '鍒嗗潡涓婁紶澶辫触' });
  }
});

// 澶ф枃浠跺垎鍧椾笂浼?- 鍚堝苟鍒嗗潡
app.post('/api/upload/complete', auth, (req, res) => {
  try {
    const { fileId, fileName } = req.body;
    if (!fileId) return res.status(400).json({ error: '鍙傛暟涓嶅畬鏁? });

    const chunkDir = path.join(UPLOADS_DIR, 'chunks', fileId);
    if (!fs.existsSync(chunkDir)) {
      return res.status(400).json({ error: '鍒嗗潡鏁版嵁涓嶅瓨鍦? });
    }

    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const finalName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${baseName}${ext}`;
    const finalPath = path.join(UPLOADS_DIR, finalName);

    // 鎸夋枃浠跺悕鎺掑簭鍚堝苟
    const chunks = fs.readdirSync(chunkDir).sort();
    const ws = fs.createWriteStream(finalPath);

    for (const chunk of chunks) {
      const chunkData = fs.readFileSync(path.join(chunkDir, chunk));
      ws.write(chunkData);
    }
    ws.end();

    // 娓呯悊鍒嗗潡
    fs.rmSync(chunkDir, { recursive: true, force: true });

    const stats = fs.statSync(finalPath);
    console.log(`[涓婁紶瀹屾垚] ${req.user.nickname}: ${fileName} (${fmtSize(stats.size)})`);

    res.json({
      file: {
        name: fileName,
        size: stats.size,
        sizeDisplay: fmtSize(stats.size),
        path: `/genbbs/uploads/${finalName}`
      }
    });
  } catch (e) {
    console.error('鍚堝苟鍒嗗潡澶辫触:', e);
    res.status(500).json({ error: '鍚堝苟鏂囦欢澶辫触' });
  }
});

// ========== 鍋ュ悍妫€鏌?& 缁熻 ==========

app.get('/api/health', (req, res) => {
  const users = readJSON(USERS_FILE);
  const posts = readJSON(POSTS_FILE);
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    stats: {
      users: users.length,
      posts: posts.length,
      sessions: SESSIONS.size
    }
  });
});

// ========== 鍏虫敞绯荤粺 ==========
// 鍏虫敞/鍙栨秷鍏虫敞
app.post('/api/follow', auth, (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: '缂哄皯鐩爣鐢ㄦ埛' });
  if (targetId === req.user.id) return res.status(400).json({ error: '涓嶈兘鍏虫敞鑷繁' });
  const users = readJSON(USERS_FILE);
  if (!users.find(u => u.id === targetId)) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  const follows = readJSON(FOLLOWS_FILE);
  const idx = follows.findIndex(f => f.from === req.user.id && f.to === targetId);
  if (idx !== -1) {
    follows.splice(idx, 1);
    writeJSON(FOLLOWS_FILE, follows);
    return res.json({ ok: true, following: false });
  }
  follows.push({ from: req.user.id, to: targetId, createdAt: new Date().toISOString() });
  writeJSON(FOLLOWS_FILE, follows);
  res.json({ ok: true, following: true });
});

// 妫€鏌ユ垜鏄惁鍏虫敞浜嗘煇浜?app.get('/api/follow/:userId', auth, (req, res) => {
  const follows = readJSON(FOLLOWS_FILE);
  const following = follows.some(f => f.from === req.user.id && f.to === req.params.userId);
  res.json({ following });
});

// 鐢ㄦ埛涓婚〉
app.get('/api/user/:id/profile', (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  const follows = readJSON(FOLLOWS_FILE);
  const posts = readJSON(POSTS_FILE);
  const safeUser = { id: user.id, nickname: user.nickname, role: user.role || 'user', createdAt: user.createdAt };
  res.json({
    user: safeUser,
    fans: follows.filter(f => f.to === user.id).length,
    following: follows.filter(f => f.from === user.id).length,
    postCount: posts.filter(p => p.author.id === user.id).length
  });
});

// 鎴戝叧娉ㄧ殑浜?app.get('/api/following', auth, (req, res) => {
  const follows = readJSON(FOLLOWS_FILE);
  const users = readJSON(USERS_FILE);
  const myFollows = follows.filter(f => f.from === req.user.id);
  const list = myFollows.map(f => {
    const u = users.find(u => u.id === f.to);
    if (!u) return null;
    return { id: u.id, nickname: u.nickname, role: u.role || 'user' };
  }).filter(Boolean);
  res.json({ list });
});

// 鎴戠殑绮変笣
app.get('/api/fans', auth, (req, res) => {
  const follows = readJSON(FOLLOWS_FILE);
  const users = readJSON(USERS_FILE);
  const myFans = follows.filter(f => f.to === req.user.id);
  const list = myFans.map(f => {
    const u = users.find(u => u.id === f.from);
    if (!u) return null;
    return { id: u.id, nickname: u.nickname, role: u.role || 'user' };
  }).filter(Boolean);
  res.json({ list });
});

// 浠绘剰鐢ㄦ埛鐨勫叧娉?绮変笣鍒楄〃
app.get('/api/user/:id/:type', (req, res) => {
  const { id, type } = req.params;
  if (!['following', 'fans'].includes(type)) return res.status(400).json({ error: '绫诲瀷閿欒' });
  const users = readJSON(USERS_FILE);
  const target = users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  const follows = readJSON(FOLLOWS_FILE);
  const items = type === 'fans'
    ? follows.filter(f => f.to === id).map(f => f.from)
    : follows.filter(f => f.from === id).map(f => f.to);
  const list = items.map(fid => {
    const u = users.find(u => u.id === fid);
    if (!u) return null;
    return { id: u.id, nickname: u.nickname, role: u.role || 'user' };
  }).filter(Boolean);
  res.json({ list });
});

// ========== 棣栭〉璺敱 ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'GENFUN璁哄潧.html'));
});

// ========== 404 澶勭悊 ==========
app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'GENFUN璁哄潧.html'));
  } else {
    res.status(404).json({ error: '鎺ュ彛涓嶅瓨鍦? });
  }
});

// ========== 瀹氭湡娓呯悊杩囨湡楠岃瘉鐮?==========
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of VERIFY_CODES) {
    if (now > data.expires) VERIFY_CODES.delete(key);
  }
}, 60000);

// ========== 鍚姩鏈嶅姟 ==========
app.listen(PORT, () => {
  const users = readJSON(USERS_FILE);
  const posts = readJSON(POSTS_FILE);
  console.log('');
  console.log('  鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽');
  console.log('  鈺?       馃殌  GENFUN璁哄潧 宸插惎鍔?        鈺?);
  console.log('  鈺犫晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暎');
  console.log(`  鈺? 鍦板潃: http://localhost:${PORT}         鈺慲);
  console.log(`  鈺? 鏁版嵁: ${DATA_DIR}`);
  console.log(`  鈺? 鐢ㄦ埛: ${users.length} 涓?              鈺慲);
  console.log(`  鈺? 甯栧瓙: ${posts.length} 涓?              鈺慲);
  console.log('  鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆');
  console.log('');
});
