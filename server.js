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

// ========== 邮件发送配置 ==========
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

// ========== 会话存储 ==========
const SESSIONS = new Map();
const VERIFY_CODES = new Map(); // key -> { code, expires }

// ========== 初始化目录和数据文件 ==========
[DATA_DIR, UPLOADS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');

// ========== 工具函数 ==========
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

// 初始化默认设置
if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, { siteName: 'GENFUN 论坛', announcement: '欢迎来到 GENFUN 论坛！', allowRegister: true });
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

// ========== Express 配置 ==========
const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(express.static(__dirname));
app.use('/genbbs/uploads', express.static(UPLOADS_DIR));

// ========== 认证中间件 ==========
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = SESSIONS.get(token);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  req.token = token;
  next();
};

// ========== 用户系统 ==========

// 发送验证码
app.post('/api/send-code', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) return res.status(400).json({ error: '请提供邮箱或手机号' });

    const key = email || phone;

    // 检查是否在冷却期内（60秒）
    const existing = VERIFY_CODES.get(key);
    if (existing && Date.now() - existing.sentAt < 60000) {
      const wait = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ error: `请${wait}秒后再试` });
    }

    // 检查该邮箱/手机是否已注册
    const users = readJSON(USERS_FILE);
    if (email && users.find(u => u.email === email)) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: '该手机号已被注册' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    VERIFY_CODES.set(key, { code, expires: Date.now() + 300000, sentAt: Date.now() });

    // 发送邮件
    if (email) {
      try {
        await mailer.sendMail({
          from: '"GENFUN论坛" <Rr_052052052052@163.com>',
          to: email,
          subject: 'GENFUN论坛 - 邮箱验证码',
          html: `<div style="max-width:480px;margin:0 auto;padding:30px;font-family:Arial,sans-serif;background:#f6f8fa;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#3b82f6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">GENFUN 论坛</span>
          </div>
          <div style="background:#fff;padding:24px;border-radius:8px;text-align:center;">
            <p style="color:#656d76;font-size:14px;margin:0 0 16px;">您的验证码是</p>
            <div style="font-size:36px;font-weight:800;color:#2563eb;letter-spacing:8px;margin-bottom:16px;">${code}</div>
            <p style="color:#8c959f;font-size:12px;margin:0;">验证码 5 分钟内有效，请勿泄露给他人</p>
          </div>
          <p style="color:#8c959f;font-size:11px;text-align:center;margin-top:16px;">此邮件由系统自动发送，请勿回复</p>
        </div>`
        });
        console.log(`[验证码] 邮件已发送至 ${email}，验证码: ${code}`);
      } catch (mailErr) {
        console.error(`[邮件发送失败] ${email}:`, mailErr.message);
        // 邮件发送失败时回退：返回验证码让用户仍可注册
        return res.json({ ok: true, code, fallback: true, message: '邮件发送失败，验证码已显示在页面上' });
      }
    } else {
      console.log(`[验证码] ${phone} => ${code}`);
    }

    res.json({ ok: true }); // 不再返回验证码，安全
  } catch (e) {
    console.error('发送验证码失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 注册
app.post('/api/register', (req, res) => {
  try {
    const { email, phone, password, nickname, verifyCode } = req.body;

    if (!nickname || !nickname.trim()) return res.status(400).json({ error: '请输入昵称' });
    if (!password || password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    if (!email && !phone) return res.status(400).json({ error: '请填写邮箱或手机号' });
    if (!verifyCode) return res.status(400).json({ error: '请输入验证码' });

    // 邮箱格式验证
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    // 手机号格式验证
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 验证码校验
    const key = email || phone;
    const codeData = VERIFY_CODES.get(key);
    if (!codeData) return res.status(400).json({ error: '请先获取验证码' });
    if (Date.now() > codeData.expires) {
      VERIFY_CODES.delete(key);
      return res.status(400).json({ error: '验证码已过期，请重新获取' });
    }
    if (codeData.code !== String(verifyCode).trim()) {
      return res.status(400).json({ error: '验证码错误' });
    }
    VERIFY_CODES.delete(key); // 验证通过，删除验证码

    const users = readJSON(USERS_FILE);
    if (email && users.find(u => u.email === email)) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: '该手机号已被注册' });
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

    console.log(`[注册] ${safeUser.nickname} (${email || phone})`);
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('注册失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });

    const users = readJSON(USERS_FILE);
    const user = users.find(u =>
      (u.email === account || u.phone === account) && u.password === sha256(password)
    );

    if (!user) return res.status(401).json({ error: '账号或密码错误' });

    if (user.banned) return res.status(403).json({ error: '该账号已被封禁' });

    const token = genToken();
    const safeUser = { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, role: user.role };
    SESSIONS.set(token, safeUser);

    console.log(`[登录] ${safeUser.nickname}`);
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('登录失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
app.get('/api/me', auth, (req, res) => {
  // 从数据库实时读取，确保角色信息最新
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const safeUser = { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, role: user.role };
  // 同步更新会话
  SESSIONS.set(req.token, safeUser);
  res.json({ user: safeUser });
});

// 退出登录
app.post('/api/logout', auth, (req, res) => {
  SESSIONS.delete(req.token);
  console.log(`[登出] ${req.user.nickname}`);
  res.json({ ok: true });
});

// ========== 管理员中间件 ==========
const adminAuth = (req, res, next) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  req.fullUser = user;
  next();
};

// ========== 管理员系统 ==========

// 获取用户列表（管理员）
app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE).map(u => ({
    id: u.id, nickname: u.nickname, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt
  }));
  res.json({ users });
});

// 修改用户角色（管理员）
app.post('/api/admin/user-role', auth, adminAuth, (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !['user', 'admin'].includes(role)) return res.status(400).json({ error: '参数错误' });
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.id === req.user.id) return res.status(400).json({ error: '不能修改自己的角色' });
  user.role = role;
  writeJSON(USERS_FILE, users);
  console.log(`[管理员] ${req.user.nickname} 将 ${user.nickname} 设为 ${role}`);
  res.json({ ok: true, userId, role });
});

// 删除任何帖子（管理员）
app.delete('/api/admin/posts/:id', auth, adminAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
  posts.splice(idx, 1);
  writeJSON(POSTS_FILE, posts);
  console.log(`[管理员] ${req.user.nickname} 删除了帖子 ${req.params.id}`);
  res.json({ ok: true });
});

// 仪表盘统计
app.get('/api/admin/stats', auth, adminAuth, (req, res) => {
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

// 管理端帖子列表（全量）
app.get('/api/admin/posts', auth, adminAuth, (req, res) => {
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

// 置顶/取消置顶
app.post('/api/admin/posts/:id/pin', auth, adminAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  post.pinned = !post.pinned;
  writeJSON(POSTS_FILE, posts);
  console.log(`[管理员] ${req.user.nickname} ${post.pinned ? '置顶' : '取消置顶'}了帖子: ${post.title}`);
  res.json({ ok: true, pinned: post.pinned });
});

// 批量删除帖子
app.post('/api/admin/posts/batch-delete', auth, adminAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的帖子' });
  let posts = readJSON(POSTS_FILE);
  const deleted = posts.filter(p => ids.includes(p.id));
  posts = posts.filter(p => !ids.includes(p.id));
  writeJSON(POSTS_FILE, posts);
  console.log(`[管理员] ${req.user.nickname} 批量删除了 ${deleted.length} 个帖子`);
  res.json({ ok: true, count: deleted.length });
});

// 封禁/解封用户
app.post('/api/admin/users/:id/ban', auth, adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.id === req.user.id) return res.status(400).json({ error: '不能封禁自己' });
  user.banned = !user.banned;
  writeJSON(USERS_FILE, users);
  // 清除被封禁用户的会话
  if (user.banned) {
    for (const [token, sess] of SESSIONS) {
      if (sess.id === user.id) SESSIONS.delete(token);
    }
  }
  console.log(`[管理员] ${req.user.nickname} ${user.banned ? '封禁' : '解封'}了用户: ${user.nickname}`);
  res.json({ ok: true, banned: user.banned });
});

// 获取系统设置
app.get('/api/admin/settings', auth, adminAuth, (req, res) => {
  res.json({ settings: readJSON(SETTINGS_FILE) });
});

// 更新系统设置
app.post('/api/admin/settings', auth, adminAuth, (req, res) => {
  const { siteName, announcement, allowRegister } = req.body;
  const settings = readJSON(SETTINGS_FILE);
  if (siteName !== undefined) settings.siteName = siteName;
  if (announcement !== undefined) settings.announcement = announcement;
  if (allowRegister !== undefined) settings.allowRegister = allowRegister;
  writeJSON(SETTINGS_FILE, settings);
  console.log(`[管理员] ${req.user.nickname} 更新了系统设置`);
  res.json({ ok: true, settings });
});

// ========== 帖子系统 ==========

// 帖子列表（支持分类、搜索、分页）
app.get('/api/posts', (req, res) => {
  try {
    const { category, page = 1, limit = 20, search } = req.query;
    let posts = readJSON(POSTS_FILE);

    // 分类过滤
    if (category && category !== '全部') {
      posts = posts.filter(p => p.category === category);
    }

    // 关键词搜索
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      posts = posts.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
      );
    }

    // 置顶优先，然后按更新时间倒序
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
    console.error('获取帖子列表失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 帖子详情
app.get('/api/posts/:id', (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });

    // 增加浏览量
    posts[idx].views = (posts[idx].views || 0) + 1;
    writeJSON(POSTS_FILE, posts);

    res.json({ post: posts[idx] });
  } catch (e) {
    console.error('获取帖子详情失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 发帖
app.post('/api/posts', auth, (req, res) => {
  try {
    const { title, content, category, attachments } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ error: '请输入标题' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请输入内容' });
    if (title.trim().length > 200) return res.status(400).json({ error: '标题不能超过200字' });

    const posts = readJSON(POSTS_FILE);
    const post = {
      id: uid(),
      title: title.trim(),
      content: content.trim(),
      category: category || '其他',
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

    console.log(`[发帖] ${req.user.nickname}: ${post.title}`);
    res.json({ post });
  } catch (e) {
    console.error('发帖失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 回复帖子
app.post('/api/posts/:id/reply', auth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '请输入回复内容' });

    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });

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

    console.log(`[回复] ${req.user.nickname} 回复了帖子: ${posts[idx].title}`);
    res.json({ reply });
  } catch (e) {
    console.error('回复失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除帖子（仅作者）
app.delete('/api/posts/:id', auth, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
    if (posts[idx].author.id !== req.user.id) {
      return res.status(403).json({ error: '只能删除自己的帖子' });
    }

    const deleted = posts.splice(idx, 1)[0];
    writeJSON(POSTS_FILE, posts);

    console.log(`[删帖] ${req.user.nickname}: ${deleted.title}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('删帖失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 文件上传 ==========

// Multer 配置：磁盘存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    // 处理中文文件名
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(safeName);
    const baseName = path.basename(safeName, ext);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${baseName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB 单文件限制
    files: 10 // 最多10个文件
  }
});

// 单文件上传（支持大文件，带进度由客户端 XMLHttpRequest 处理）
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    console.log(`[上传] ${req.user.nickname} 上传了: ${originalName} (${fmtSize(req.file.size)})`);

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
    console.error('文件上传失败:', e);
    res.status(500).json({ error: '上传失败，请重试' });
  }
});

// 大文件分块上传 - 接收分块
app.post('/api/upload/chunk', auth, upload.single('chunk'), (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks, fileName } = req.body;
    if (!fileId || chunkIndex === undefined) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const chunkDir = path.join(UPLOADS_DIR, 'chunks', fileId);
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

    // 移动分块到目标目录
    const chunkFile = path.join(chunkDir, `chunk-${String(chunkIndex).padStart(6, '0')}`);
    fs.renameSync(req.file.path, chunkFile);

    res.json({ ok: true, chunkIndex: +chunkIndex, totalChunks: +totalChunks });
  } catch (e) {
    console.error('分块上传失败:', e);
    res.status(500).json({ error: '分块上传失败' });
  }
});

// 大文件分块上传 - 合并分块
app.post('/api/upload/complete', auth, (req, res) => {
  try {
    const { fileId, fileName } = req.body;
    if (!fileId) return res.status(400).json({ error: '参数不完整' });

    const chunkDir = path.join(UPLOADS_DIR, 'chunks', fileId);
    if (!fs.existsSync(chunkDir)) {
      return res.status(400).json({ error: '分块数据不存在' });
    }

    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const finalName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${baseName}${ext}`;
    const finalPath = path.join(UPLOADS_DIR, finalName);

    // 按文件名排序合并
    const chunks = fs.readdirSync(chunkDir).sort();
    const ws = fs.createWriteStream(finalPath);

    for (const chunk of chunks) {
      const chunkData = fs.readFileSync(path.join(chunkDir, chunk));
      ws.write(chunkData);
    }
    ws.end();

    // 清理分块
    fs.rmSync(chunkDir, { recursive: true, force: true });

    const stats = fs.statSync(finalPath);
    console.log(`[上传完成] ${req.user.nickname}: ${fileName} (${fmtSize(stats.size)})`);

    res.json({
      file: {
        name: fileName,
        size: stats.size,
        sizeDisplay: fmtSize(stats.size),
        path: `/genbbs/uploads/${finalName}`
      }
    });
  } catch (e) {
    console.error('合并分块失败:', e);
    res.status(500).json({ error: '合并文件失败' });
  }
});

// ========== 健康检查 & 统计 ==========

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

// ========== 关注系统 ==========
// 关注/取消关注
app.post('/api/follow', auth, (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: '缺少目标用户' });
  if (targetId === req.user.id) return res.status(400).json({ error: '不能关注自己' });
  const users = readJSON(USERS_FILE);
  if (!users.find(u => u.id === targetId)) return res.status(404).json({ error: '用户不存在' });
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

// 检查我是否关注了某人
app.get('/api/follow/:userId', auth, (req, res) => {
  const follows = readJSON(FOLLOWS_FILE);
  const following = follows.some(f => f.from === req.user.id && f.to === req.params.userId);
  res.json({ following });
});

// 用户主页
app.get('/api/user/:id/profile', (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
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

// 我关注的人
app.get('/api/following', auth, (req, res) => {
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

// 我的粉丝
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

// 任意用户的关注/粉丝列表
app.get('/api/user/:id/:type', (req, res) => {
  const { id, type } = req.params;
  if (!['following', 'fans'].includes(type)) return res.status(400).json({ error: '类型错误' });
  const users = readJSON(USERS_FILE);
  const target = users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
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

// ========== 首页路由 ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'GENFUN论坛.html'));
});

// ========== 404 处理 ==========
app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'GENFUN论坛.html'));
  } else {
    res.status(404).json({ error: '接口不存在' });
  }
});

// ========== 定期清理过期验证码 ==========
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of VERIFY_CODES) {
    if (now > data.expires) VERIFY_CODES.delete(key);
  }
}, 60000);

// ========== 启动服务 ==========
app.listen(PORT, () => {
  const users = readJSON(USERS_FILE);
  const posts = readJSON(POSTS_FILE);
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║        🚀  GENFUN论坛 已启动         ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  地址: http://localhost:${PORT}         ║`);
  console.log(`  ║  数据: ${DATA_DIR}`);
  console.log(`  ║  用户: ${users.length} 个               ║`);
  console.log(`  ║  帖子: ${posts.length} 个               ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
