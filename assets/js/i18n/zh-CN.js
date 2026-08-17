// ============================================================================
// Xiao 2.0 · i18n 中文词典
// ============================================================================
(function (X) {
  X.i18n = X.i18n || {};
  X.i18n.zhCN = X.i18n.zhCN || {};
  Object.assign(X.i18n.zhCN, {
    app: { name: 'Xiao · 企海狐协会', tagline: '企鹅 + 海豚 + 雪狐 · 理科技术社区' },
    nav: {
      home: '首页', chat: '聊天大厅', works: '作品库', editor: '代码编辑器',
      social: '社交', admin: '管理后台', video: '科研视频',
      profile: '个人中心', redeem: '兑换码',
      leaderboard: '排行榜', tasks: '任务板', polls: '投票', announcements: '公告'
    },
    common: {
      confirm: '确认', cancel: '取消', submit: '提交', save: '保存',
      delete: '删除', edit: '编辑', back: '返回', loading: '加载中…',
      empty: '暂无数据', more: '加载更多', all: '全部', search: '搜索',
      yes: '是', no: '否', open: '打开', close: '关闭'
    },
    auth: {
      login: '登录', register: '注册', logout: '退出登录',
      username: '账号名', password: '密码', confirmPwd: '二次密码',
      phone: '手机号', avatar: '头像', remember: '记住密码',
      pickAvatar: '选择默认头像', uploadAvatar: '上传头像',
      noAccount: '还没有账号？去注册', hasAccount: '已有账号？去登录'
    },
    home: {
      hero: '欢迎来到 Xiao',
      intro: 'Xiao 是面向理科研究者的开源社区，支持公共聊天、私聊、群组协作、作品分享、在线代码编辑器。',
      features: '核心能力',
      feat1: '🐧 公共聊天大厅 + 私聊 + 群组（Realtime 推送）',
      feat2: '📦 作品上传：论文 / 文件夹 / 代码，在线预览 txt/python/js/html/css',
      feat3: '⚡ 内置 JS/HTML/CSS/Python 代码编辑器，支持协同创作',
      feat4: '🪙 Ttpx_A 代币系统：新用户 10 枚，点赞 +0.01，建群 -20',
      feat5: '🛡️ 管理员体系：兑换码临时权限，奖惩留日志',
      feat6: '🌍 三语言切换：中文 / English / Русский',
      feat7: '🎨 三主题切换：暗色 / 浅色 / 赛博朋克（localStorage 持久化）',
      feat8: '⌘ 命令面板：Ctrl/Cmd+K 快速跳转与操作',
      feat9: '🏆 排行榜 / 📋 任务看板 / 📊 投票系统 / 📢 公告中心',
      feat10: '🏅 等级经验勋章体系 / 💬 个人简介与状态 / 🏷 作品标签与评论',
      feat11: '📱 PWA 可安装到桌面，离线缓存静态资源',
      feat12: '🦴 骨架屏 + 在线状态实时同步（Supabase Presence）',
      start: '开始使用 →'
    },
    chat: {
      title: '公共聊天大厅',
      placeholder: '说点什么…（@用户 空格 链接 自动跳转）',
      send: '发送', online: '在线', msgs: '消息',
      emoji: '表情', muted: '你已被禁言',
      empty: '还没有消息，发第一条吧！',
      recall: '撤回', edit: '编辑', reply: '回复',
      pin: '置顶', unpin: '取消置顶',
      recalled: '该消息已撤回', edited: '已编辑',
      pinned: '置顶消息', replyTo: '回复'
    },
    social: {
      title: '社交中心',
      myFriends: '我的好友', addFriend: '加好友',
      friendReq: '好友申请', blocked: '已拉黑',
      myGroups: '我的群组', createGroup: '创建群组（消耗 {cost} Ttpx_A）',
      groupName: '群名', groupMax: '人数上限', joinReq: '申请入群',
      members: '成员', kick: '踢出', muteInGroup: '群内禁言',
      shareInGroup: '群内分享资源', dm: '私聊', block: '拉黑', unblock: '取消拉黑',
      accept: '接受', reject: '拒绝', remove: '删除好友'
    },
    works: {
      title: '作品库', upload: '上传作品', my: '我的作品',
      all: '全部作品', pending: '待审核', approved: '已通过',
      name: '作品名', desc: '描述', category: '分类',
      cat_paper: '论文', cat_folder: '文件夹', cat_code: '代码',
      price: '定价（0=免费）', free: '免费', file: '文件',
      preview: '在线预览', download: '下载', like: '点赞', likes: '赞',
      requestDl: '申请下载', approvedDl: '已批准下载',
      needRealname: '游戏分区下载需实名认证', realname: '实名认证',
      loadMore: '加载更多', loadAll: '已加载全部'
    },
    editor: {
      title: '在线代码编辑器', lang: '语言', run: '运行', clear: '清空',
      js: 'JavaScript', html: 'HTML', css: 'CSS', python: 'Python',
      collab: '协同创作（基于 Realtime）', output: '输出', noOutput: '无输出',
      pyNotSupported: 'Python 在线执行需要后端环境，目前仅本地预览'
    },
    profile: {
      title: '个人中心', info: '基本信息', myWorks: '我的作品',
      myFriends: '我的好友', myGroups: '我的群组', myBlocked: '我拉黑的',
      friendReq: '好友申请', balance: 'Ttpx_A 余额', realname: '实名认证',
      realnameDone: '已实名', realnameNone: '未实名',
      memberSince: '注册时间', editAvatar: '修改头像',
      level: '等级', exp: '经验', nextLevel: '距下一级',
      myMedals: '我的勋章', noMedals: '暂无勋章',
      editBio: '编辑简介', editStatus: '编辑状态', statusPlaceholder: '写点什么…'
    },
    admin: {
      title: '管理后台', users: '用户管理', works: '作品审核',
      reports: '举报处理', logs: '操作日志', coin: '代币管理',
      balance: '余额', role: '角色', banned: '封禁', muted: '禁言',
      realname: '实名', banUser: '封号', unbanUser: '解封',
      muteUser: '禁言', unmuteUser: '解除禁言', banPerm: '永久封',
      banTemp: '限时封禁', banHours: '封禁时长（小时）',
      adjustCoin: '调整代币', amount: '金额（+/-）',
      approve: '通过', reject: '拒绝', resolve: '处理举报',
      reason: '操作原因（必填）', action: '处理动作',
      addAdmin: '提升为管理员', removeAdmin: '撤销管理员',
      target: '目标用户', operator: '操作员', time: '时间',
      dashboard: '数据看板', totalUsers: '总用户', totalWorks: '总作品',
      pendingWorks: '待审核', totalMessages: '总消息', totalReports: '总举报',
      pendingReports: '待处理', last7days: '最近 7 天注册',
      newAnnouncement: '发布公告', annTitle: '标题', annBody: '正文', annPinned: '置顶',
      medals: '勋章', awardMedal: '授勋', exportCsv: '导出 CSV',
      searchUser: '搜索用户…', filterRole: '角色筛选'
    },
    video: { title: '科研长视频', dev: '功能正在开发中', placeholder: '🎬 此模块正在开发中，敬请期待' },
    misc: { contact: '联系我们', contactUrl: '在 B站 关注我们' },
    ok: {
      registered: '注册成功，已自动登录', loggedIn: '登录成功',
      loggedOut: '已退出登录', saved: '已保存', deleted: '已删除',
      sent: '已发送', approved: '已通过', rejected: '已拒绝',
      liked: '已点赞', unliked: '已取消点赞', friendAdded: '已添加好友',
      blocked: '已拉黑', unblocked: '已取消拉黑', groupCreated: '群组创建成功',
      joined: '已申请入群', kicked: '已踢出', muted: '已禁言',
      coinAdjusted: '代币已调整', banSet: '已设置封禁', muteSet: '已设置禁言'
    },
    err: {
      required: '此项必填', loginFail: '登录失败', registerFail: '注册失败',
      passwordMismatch: '两次密码不一致', phoneFormat: '手机号格式不正确',
      userExists: '账号已存在', noPerm: '无权限', notLoggedIn: '请先登录',
      notAdmin: '非管理员', alreadyFriend: '已经是好友', alreadyBlocked: '已拉黑',
      notFriend: '不是好友', coinNotEnough: 'Ttpx_A 不足',
      uploadFail: '上传失败', downloadFail: '下载失败', sendFail: '发送失败',
      redeemFail: '兑换码无效', sessionExpired: '会话过期，请重新登录'
    },
    cmdk: {
      title: '命令面板', placeholder: '输入命令或搜索…', empty: '无匹配结果',
      group_nav: '跳转', group_action: '操作', group_theme: '主题', group_lang: '语言'
    },
    theme: { dark: '暗色', light: '浅色', cyber: '赛博朋克', cycled: '主题已切换' },
    presence: { online: '在线', offline: '离线', justNow: '刚刚活跃' },
    tasks: {
      title: '任务板', todo: '待办', doing: '进行中', done: '已完成',
      newTask: '新建任务', taskTitle: '标题', taskDesc: '描述',
      dueDate: '截止日期', assignee: '负责人',
      noTasks: '暂无任务', moveTask: '拖拽移动'
    },
    polls: {
      title: '投票', newPoll: '发起投票', question: '问题', options: '选项',
      addOption: '添加选项', multiple: '多选', expiresAt: '截止时间',
      vote: '投票', voted: '已投票', totalVotes: '总票数',
      closed: '已关闭', closePoll: '关闭投票', noPolls: '暂无投票'
    },
    ann: {
      title: '公告', newAnn: '发布公告', pinned: '置顶',
      noAnn: '暂无公告', newAnnToast: '有新公告', viewAll: '查看全部'
    },
    leaderboard: {
      title: '排行榜', worksLikes: '作品点赞榜', topAuthors: '创作者榜',
      richest: '富豪榜', topExp: '等级榜',
      rank: '排名', author: '作者', likes: '点赞'
    }
  });
})(window.Xiao = window.Xiao || {});
