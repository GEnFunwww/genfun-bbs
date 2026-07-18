# GENFUN论坛项目记忆

## 项目概述
- GitHub Issues 驱动论坛，部署在 GitHub Pages
- 帖子=Issue，回复=Comment，分类=Label，置顶=pinned标签
- 聊天室=Issue#3的Comments（聊天大厅）
- 所有人可看帖子/聊天，GitHub用户可登录发帖回复聊天
- 网址: https://genfunwww.github.io/genfun-bbs/（HTTPS已强制）

## 技术架构
- GitHub Issues 驱动：帖子=Issue，回复=Comment，分类=Label，聊天=Issue#3
- 前端部署在 GitHub Pages
- GitHub OAuth 设备流认证 + 邮箱/手机号注册
- 仓库标签：技术/生活/游戏/资源/其他/pinned/聊天
- 管理员=仓库owner（GEnFunwww）+ 邮箱admin（T）
- 纯前端SPA，HTML+CSS+JS单文件

## 功能清单
- 双认证登录：GitHub OAuth设备流 + 邮箱/手机号注册（SHA-256哈希+验证码自动填入）
- 邮箱用户发帖/回复/聊天用仓库PAT代为创建（author标记在body中）
- 帖子CRUD（发帖=创建Issue，查看=读取Issue，关闭Issue）
- 回复系统（=Issue Comments）
- 分类筛选（=Issue Labels）
- 置顶（pinned标签）
- 搜索+分页
- 管理后台（仓库owner + 邮箱admin角色）
- 主题切换（暗黑/亮色）
- 会员主题色（7种颜色：蓝色免费，6种VIP专属）
- VIP主题混搭：VIP用户可用颜色选择器自定义任意accent色
- 会员按钮（右下角👑按钮，弹窗提示加QQ3932892962）
- 在线点歌（VIP专属）：导航栏🎵点歌按钮→弹窗→搜索网易云音乐→HTML5 Audio播放
- 点歌权限：VIP永久免费，签到奖励可获得1天或3天点歌权限
- 底部播放条：正在播放时底部显示歌曲信息和控制按钮（播放/暂停/上下首/关闭）
- 聊天室（大厅聊天=Issue#3 Comments，每天早上8点清理）
- 右下角FAB发帖按钮
- 预置管理员：T / Rr052052052@163.com / T123456（自动VIP）
- 个人资料编辑：点击用户按钮弹出资料面板，可修改名称和头像
- 修改名称：邮箱用户直接改username，GitHub用户通过displayName覆盖
- 修改头像：支持URL输入+本地文件上传（base64，≤512KB）
- 头像覆盖：localStorage存储genfun_avatar_override和genfun_display_name_override
- 每月注册限制：同一设备每月只能注册一次邮箱账号（localStorage记录genfun_last_register_time）
- 称号系统：VIP用户可自定义称号（最多10字符），显示在名字旁边金色标签
- VIP预设用户：是P、Kyle（注册时自动VIP，initDefaultUsers也强制VIP）
- 管理员预设称号："管理员"
- 粉丝系统：用户可关注/取消关注其他用户，显示粉丝数和关注数
- 经验等级系统：LV1=50, LV2=100, LV3=500, LV4=1000+签到7天, LV5=5000+VIP
- 经验获取：发帖+10, 回复+5, 聊天+1
- LV5自动VIP，升级时自动提示
- 签到系统（7天一轮）：Day1=称号"夏日淌水", Day2=经验+10, Day3=经验+50, Day4=经验+100, Day5=经验+100+点歌1天, Day6=红色主题, Day7=点歌3天
- 签到奖励点歌权限和红色主题色可持久使用

## 重要备注
- GitHub PAT: charCode数组编码存储（详见HTML源码_tk数组）
- GitHub OAuth App Client ID: Ov23liPJiMtpMicE7Jt4
- 聊天大厅Issue编号: #3
- 会员QQ: 3932892962
- GitHub API 限流：未认证60次/小时，认证5000次/小时（有缓存）
- LeanCloud已下线，改用GitHub Issues方案
- 旧后端文件不再需要
- 自定义域名尝试失败：Cloudflare不支持子域名(qd.je)，已放弃
- DigitalPlat注册的genfunbbs.qd.je域名因DNS无法配置而无法使用
