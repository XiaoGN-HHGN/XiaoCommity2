// ============================================================================
// Xiao 2.0 · 数据访问层
// 设计原则：每个方法对应一张表，字段名 = SQL 列名，零映射层
// 所有方法返回 Promise，失败时抛出 Error（含 code/message）
// ============================================================================

(function (X) {
  const T = X.TABLES;
  const BIZ = X.BIZ;

  const store = {
    T,

    // ============================================================
    // profiles 用户主资料
    // ============================================================
    async getProfile(id) {
      if (!id) return null;
      return X.dbq.select(T.PROFILES, { eq: ['id', id], single: true });
    },
    async getProfileByName(username) {
      if (!username) return null;
      return X.dbq.select(T.PROFILES, { eq: ['username', username], single: true });
    },
    async listUsers({ limit = 200 } = {}) {
      return X.dbq.select(T.PROFILES, { order: ['created_at', { ascending: true }], limit });
    },
    async updateProfile(id, patch) {
      const rows = await X.dbq.update(T.PROFILES, patch, { eq: ['id', id] });
      return rows[0] || null;
    },
    /** 管理员：手动提升 / 撤销管理员（仅 super 可执行，service_role 兜底） */
    async setRole(id, role) {
      return this.updateProfile(id, { role });
    },
    /** 调整代币：调用 RPC adjust_coin（点赞 +0.01 / 建群 -20 / 管理员奖惩） */
    async adjustCoin(targetId, delta) {
      return X.dbq.rpc('adjust_coin', { target: targetId, delta: Number(delta) });
    },
    /** 封禁/禁言：banned/muted 字段是 jsonb，存 {perm:true} 或 {until:timestamp} */
    async setBan(id, banned) {
      return this.updateProfile(id, { banned });
    },
    async setMute(id, muted) {
      return this.updateProfile(id, { muted });
    },
    /** 实名认证：设置 realname=true + realname_info */
    async setRealname(id, info) {
      return this.updateProfile(id, { realname: true, realname_info: info });
    },

    // ============================================================
    // messages 公共大厅消息（带作者快照，渲染零 JOIN）
    // ============================================================
    async getMessages(limit = 100) {
      return X.dbq.select(T.MESSAGES, { order: ['created_at', { ascending: true }], limit });
    },
    async addMessage({ userId, username, avatar, avatarType, text }) {
      return X.dbq.insert(T.MESSAGES, {
        user_id: userId,
        username: username || '',
        avatar: avatar || '🐧',
        avatar_type: avatarType || 'emoji',
        text: text || '',
        created_at: new Date().toISOString()
      });
    },

    // ============================================================
    // dm_messages 私聊（pair_key 简化查询）
    // ============================================================
    dmKey(a, b) { return [a, b].sort().join('__'); },
    async getDM(userA, userB) {
      const pairKey = this.dmKey(userA, userB);
      return X.dbq.select(T.DM_MESSAGES, {
        eq: ['pair_key', pairKey],
        order: ['created_at', { ascending: true }],
        limit: 500
      });
    },
    async addDM({ fromId, fromName, fromAvatar, toId, text }) {
      return X.dbq.insert(T.DM_MESSAGES, {
        pair_key: this.dmKey(fromId, toId),
        from_id: fromId,
        to_id: toId,
        from_name: fromName || '',
        from_avatar: fromAvatar || '🐧',
        text: text || '',
        created_at: new Date().toISOString()
      });
    },

    // ============================================================
    // groups 群组 + group_members + group_messages
    // ============================================================
    async listGroupsByUser(userId) {
      // 我加入或拥有的群组
      const members = await X.dbq.select(T.GROUP_MEMBERS, {
        eq: ['user_id', userId],
        neq: ['status', 'kicked']
      });
      if (!members.length) return [];
      const ids = members.map(m => m.group_id);
      const groups = await X.dbq.select(T.GROUPS, { in_filter: ['id', ids] });
      return groups.map(g => ({
        ...g,
        my_role: members.find(m => m.group_id === g.id).role,
        my_status: members.find(m => m.group_id === g.id).status
      }));
    },
    async getGroup(id) {
      return X.dbq.select(T.GROUPS, { eq: ['id', id], single: true });
    },
    async createGroup({ ownerId, name }) {
      // 1) 先扣 20 代币（RPC 原子）
      await X.dbq.rpc('adjust_coin', { target: ownerId, delta: -BIZ.GROUP_COST });
      // 2) 建群
      const g = await X.dbq.insert(T.GROUPS, {
        owner_id: ownerId,
        name: name || '未命名群组',
        max_member: BIZ.GROUP_MAX,
        created_at: new Date().toISOString()
      });
      // 3) 群主自动成为成员 + role=owner
      await X.dbq.insert(T.GROUP_MEMBERS, {
        group_id: g.id,
        user_id: ownerId,
        role: 'owner',
        status: 'approved',
        joined_at: new Date().toISOString()
      });
      return g;
    },
    async listMembers(groupId) {
      return X.dbq.select(T.GROUP_MEMBERS, {
        eq: ['group_id', groupId],
        neq: ['status', 'kicked']
      });
    },
    async requestJoinGroup(groupId, userId) {
      return X.dbq.insert(T.GROUP_MEMBERS, {
        group_id: groupId,
        user_id: userId,
        role: 'member',
        status: 'pending',
        joined_at: new Date().toISOString()
      }).catch(e => { throw e; });
    },
    async approveJoinGroup(memberId) {
      const rows = await X.dbq.update(T.GROUP_MEMBERS, { status: 'approved' }, { eq: ['id', memberId] });
      return rows[0];
    },
    async kickMember(groupId, userId) {
      const rows = await X.dbq.update(T.GROUP_MEMBERS, { status: 'kicked' }, {
        filter: { group_id: groupId, user_id: userId }
      });
      return rows[0];
    },
    async muteInGroup(groupId, userId) {
      const rows = await X.dbq.update(T.GROUP_MEMBERS, { role: 'muted' }, {
        filter: { group_id: groupId, user_id: userId }
      });
      return rows[0];
    },
    async setGroupAdmin(groupId, userId, isAdmin) {
      const rows = await X.dbq.update(T.GROUP_MEMBERS, { role: isAdmin ? 'admin' : 'member' }, {
        filter: { group_id: groupId, user_id: userId }
      });
      return rows[0];
    },
    async getGroupMessages(groupId, limit = 100) {
      return X.dbq.select(T.GROUP_MESSAGES, {
        eq: ['group_id', groupId],
        order: ['created_at', { ascending: true }],
        limit
      });
    },
    async addGroupMessage({ groupId, userId, username, avatar, avatarType, text }) {
      return X.dbq.insert(T.GROUP_MESSAGES, {
        group_id: groupId,
        user_id: userId,
        username: username || '',
        avatar: avatar || '🐧',
        avatar_type: avatarType || 'emoji',
        text: text || '',
        created_at: new Date().toISOString()
      });
    },

    // ============================================================
    // works 作品
    // ============================================================
    async listWorks({ status = 'approved', limit = 50, offset = 0, authorId = null } = {}) {
      const filter = {};
      if (status && status !== 'all') filter.status = status;
      if (authorId) filter.author_id = authorId;
      return X.dbq.select(T.WORKS, {
        filter,
        order: ['created_at', { ascending: false }],
        limit
      });
    },
    async getWork(id) {
      return X.dbq.select(T.WORKS, { eq: ['id', id], single: true });
    },
    async createWork({ authorId, name, desc, category, price, fileName, filePath, fileType }) {
      return X.dbq.insert(T.WORKS, {
        author_id: authorId,
        name, description: desc || '', category,
        price: Number(price) || 0,
        file_name: fileName, file_path: filePath, file_type: fileType,
        status: 'pending',
        likes: 0,
        created_at: new Date().toISOString()
      });
    },
    async updateWork(id, patch) {
      const rows = await X.dbq.update(T.WORKS, patch, { eq: ['id', id] });
      return rows[0];
    },
    async approveWork(id) {
      return this.updateWork(id, { status: 'approved' });
    },
    async rejectWork(id) {
      return this.updateWork(id, { status: 'rejected' });
    },
    async listWorksByUser(userId) {
      return X.dbq.select(T.WORKS, {
        eq: ['author_id', userId],
        order: ['created_at', { ascending: false }]
      });
    },
    async deleteWork(id) {
      return X.dbq.remove(T.WORKS, { eq: ['id', id] });
    },

    // ============================================================
    // work_likes 点赞（unique 防重复，每次 +0.01 给作者）
    // ============================================================
    async getLike(workId, userId) {
      return X.dbq.select(T.WORK_LIKES, {
        filter: { work_id: workId, user_id: userId },
        single: true
      });
    },
    async toggleLike(workId, userId) {
      const existing = await this.getLike(workId, userId);
      if (existing) {
        // 已点赞 → 取消
        await X.dbq.remove(T.WORK_LIKES, {
          filter: { work_id: workId, user_id: userId }
        });
        const work = await this.getWork(workId);
        if (work && work.likes > 0) {
          await this.updateWork(workId, { likes: work.likes - 1 });
        }
        return { liked: false };
      }
      // 未点赞 → 新增
      await X.dbq.insert(T.WORK_LIKES, {
        work_id: workId, user_id: userId,
        created_at: new Date().toISOString()
      });
      const work = await this.getWork(workId);
      const newLikes = (work?.likes || 0) + 1;
      await this.updateWork(workId, { likes: newLikes });
      // 作者 +0.01（必须拿到 work.author_id）
      if (work && work.author_id) {
        try { await X.dbq.rpc('adjust_coin', { target: work.author_id, delta: BIZ.LIKE_REWARD }); } catch (_) {}
      }
      return { liked: true, likes: newLikes };
    },

    // ============================================================
    // download_requests 下载申请
    // ============================================================
    async listMyDownloadReqs(userId) {
      return X.dbq.select(T.DOWNLOAD_REQUESTS, {
        eq: ['user_id', userId],
        order: ['created_at', { ascending: false }]
      });
    },
    async listDownloadReqsForAuthor(authorId) {
      // 拉作者所有作品的下载申请
      const works = await this.listWorksByUser(authorId);
      if (!works.length) return [];
      const ids = works.map(w => w.id);
      return X.dbq.select(T.DOWNLOAD_REQUESTS, { in_filter: ['work_id', ids] });
    },
    async requestDownload(workId, userId) {
      return X.dbq.insert(T.DOWNLOAD_REQUESTS, {
        work_id: workId, user_id: userId,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    },
    async approveDownload(id) {
      const rows = await X.dbq.update(T.DOWNLOAD_REQUESTS, { status: 'approved' }, { eq: ['id', id] });
      return rows[0];
    },
    async rejectDownload(id) {
      const rows = await X.dbq.update(T.DOWNLOAD_REQUESTS, { status: 'rejected' }, { eq: ['id', id] });
      return rows[0];
    },

    // ============================================================
    // friend_requests + friendships + blocks
    // ============================================================
    async listFriendRequestsTo(userId) {
      return X.dbq.select(T.FRIEND_REQUESTS, {
        eq: ['to_id', userId],
        order: ['created_at', { ascending: false }]
      });
    },
    async listFriendRequestsFrom(userId) {
      return X.dbq.select(T.FRIEND_REQUESTS, {
        eq: ['from_id', userId]
      });
    },
    async requestFriend(fromId, toId) {
      return X.dbq.insert(T.FRIEND_REQUESTS, {
        from_id: fromId, to_id: toId,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    },
    async acceptFriend(reqId, fromId, toId) {
      // 1) 更新请求状态
      await X.dbq.update(T.FRIEND_REQUESTS, { status: 'accepted' }, { eq: ['id', reqId] });
      // 2) 双向插入 friendships（unique 防重复）
      await X.dbq.upsert(T.FRIENDSHIPS, {
        user_id: fromId, friend_id: toId,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,friend_id' });
      await X.dbq.upsert(T.FRIENDSHIPS, {
        user_id: toId, friend_id: fromId,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,friend_id' });
    },
    async rejectFriend(reqId) {
      await X.dbq.update(T.FRIEND_REQUESTS, { status: 'rejected' }, { eq: ['id', reqId] });
    },
    async listFriends(userId) {
      const rows = await X.dbq.select(T.FRIENDSHIPS, {
        eq: ['user_id', userId]
      });
      if (!rows.length) return [];
      const ids = rows.map(r => r.friend_id);
      return X.dbq.select(T.PROFILES, { in_filter: ['id', ids] });
    },
    async removeFriend(userId, friendId) {
      // 双向删除
      await X.dbq.remove(T.FRIENDSHIPS, {
        filter: { user_id: userId, friend_id: friendId }
      });
      await X.dbq.remove(T.FRIENDSHIPS, {
        filter: { user_id: friendId, friend_id: userId }
      });
    },
    async blockUser(userId, blockedId) {
      return X.dbq.upsert(T.BLOCKS, {
        user_id: userId, blocked_id: blockedId,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,blocked_id' });
    },
    async unblockUser(userId, blockedId) {
      await X.dbq.remove(T.BLOCKS, {
        filter: { user_id: userId, blocked_id: blockedId }
      });
    },
    async listBlocked(userId) {
      const rows = await X.dbq.select(T.BLOCKS, { eq: ['user_id', userId] });
      if (!rows.length) return [];
      const ids = rows.map(r => r.blocked_id);
      return X.dbq.select(T.PROFILES, { in_filter: ['id', ids] });
    },
    async isBlockedBy(a, b) {
      // a 是否被 b 拉黑
      const r = await X.dbq.select(T.BLOCKS, {
        filter: { user_id: b, blocked_id: a },
        single: true
      });
      return !!r;
    },

    // ============================================================
    // reports 举报
    // ============================================================
    async listReports({ status = 'pending', limit = 200 } = {}) {
      const filter = status === 'all' ? {} : { status };
      return X.dbq.select(T.REPORTS, {
        filter,
        order: ['created_at', { ascending: false }],
        limit
      });
    },
    async addReport({ reporterId, targetType, targetId, reason }) {
      return X.dbq.insert(T.REPORTS, {
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId ? String(targetId) : null,
        reason: reason || '',
        status: 'pending',
        created_at: new Date().toISOString()
      });
    },
    async resolveReport(id, action, note) {
      const rows = await X.dbq.update(T.REPORTS, {
        status: 'resolved',
        action: action || '',
        note: note || '',
        resolved_at: new Date().toISOString()
      }, { eq: ['id', id] });
      return rows[0];
    },

    // ============================================================
    // admin_logs 管理员操作日志
    // ============================================================
    async listLogs(limit = 200) {
      return X.dbq.select(T.ADMIN_LOGS, {
        order: ['created_at', { ascending: false }],
        limit
      });
    },
    async addLog({ operatorId, action, targetUserId, targetId, reason, meta }) {
      return X.dbq.insert(T.ADMIN_LOGS, {
        operator_id: operatorId,
        action: action || '',
        target_user_id: targetUserId || null,
        target_id: targetId ? String(targetId) : null,
        reason: reason || '',
        meta: meta || null,
        created_at: new Date().toISOString()
      });
    },

    // ============================================================
    // v2.1 扩展表名（comments/favorites/tags/announcements/polls/
    // tasks/user_levels/medals/user_medals/snippets/pinned_messages）
    // ============================================================
    T2: {
      COMMENTS: 'comments',
      FAVORITES: 'favorites',
      TAGS: 'tags',
      WORK_TAGS: 'work_tags',
      ANNOUNCEMENTS: 'announcements',
      POLLS: 'polls',
      POLL_OPTIONS: 'poll_options',
      POLL_VOTES: 'poll_votes',
      TASKS: 'tasks',
      USER_LEVELS: 'user_levels',
      MEDALS: 'medals',
      USER_MEDALS: 'user_medals',
      PINNED_MESSAGES: 'pinned_messages',
      MESSAGE_EDITS: 'message_edits',
      SNIPPETS: 'snippets'
    },

    // ============================================================
    // 消息升级：撤回（软删）/ 编辑 / 回复 / 置顶
    // ============================================================
    async editMessage(id, newText, editorId) {
      // 先存历史
      try {
        const old = await X.dbq.select(T.MESSAGES, { eq: ['id', id], single: true });
        if (old && old.text) {
          await X.dbq.insert(this.T2.MESSAGE_EDITS, {
            message_id: id, old_text: old.text, editor_id: editorId,
            created_at: new Date().toISOString()
          });
        }
      } catch (_) {}
      const rows = await X.dbq.update(T.MESSAGES, {
        text: newText, edited_at: new Date().toISOString()
      }, { eq: ['id', id] });
      return rows[0];
    },
    async deleteMessage(id) {
      const rows = await X.dbq.update(T.MESSAGES, { deleted: true }, { eq: ['id', id] });
      return rows[0];
    },
    async listPinnedMessages() {
      return X.dbq.select(this.T2.PINNED_MESSAGES, {
        order: ['created_at', { ascending: false }], limit: 20
      });
    },
    async pinMessage(messageId, userId) {
      return X.dbq.insert(this.T2.PINNED_MESSAGES, {
        message_id: messageId, pinned_by: userId,
        created_at: new Date().toISOString()
      });
    },
    async unpinMessage(messageId) {
      return X.dbq.remove(this.T2.PINNED_MESSAGES, { eq: ['message_id', messageId] });
    },

    // ============================================================
    // comments 作品评论
    // ============================================================
    async listComments(workId) {
      return X.dbq.select(this.T2.COMMENTS, {
        eq: ['work_id', workId],
        order: ['created_at', { ascending: true }], limit: 200
      });
    },
    async addComment({ workId, userId, username, avatar, avatarType, text, replyTo }) {
      return X.dbq.insert(this.T2.COMMENTS, {
        work_id: workId, user_id: userId,
        username: username || '', avatar: avatar || '🐧', avatar_type: avatarType || 'emoji',
        text: text || '', reply_to: replyTo || null,
        created_at: new Date().toISOString()
      });
    },
    async deleteComment(id) {
      return X.dbq.remove(this.T2.COMMENTS, { eq: ['id', id] });
    },

    // ============================================================
    // favorites 作品收藏
    // ============================================================
    async listFavorites(userId) {
      const rows = await X.dbq.select(this.T2.FAVORITES, { eq: ['user_id', userId] });
      if (!rows.length) return [];
      const ids = rows.map(r => r.work_id);
      return X.dbq.select(T.WORKS, { in_filter: ['id', ids] });
    },
    async isFavorited(workId, userId) {
      const r = await X.dbq.select(this.T2.FAVORITES, {
        filter: { work_id: workId, user_id: userId }, single: true
      });
      return !!r;
    },
    async toggleFavorite(workId, userId) {
      const exists = await this.isFavorited(workId, userId);
      if (exists) {
        await X.dbq.remove(this.T2.FAVORITES, {
          filter: { work_id: workId, user_id: userId }
        });
        return { favorited: false };
      }
      await X.dbq.insert(this.T2.FAVORITES, {
        work_id: workId, user_id: userId,
        created_at: new Date().toISOString()
      });
      return { favorited: true };
    },

    // ============================================================
    // tags + work_tags
    // ============================================================
    async listTags() {
      return X.dbq.select(this.T2.TAGS, { order: ['name', { ascending: true }] });
    },
    async listWorkTags(workId) {
      const rows = await X.dbq.select(this.T2.WORK_TAGS, { eq: ['work_id', workId] });
      if (!rows.length) return [];
      const ids = rows.map(r => r.tag_id);
      return X.dbq.select(this.T2.TAGS, { in_filter: ['id', ids] });
    },
    async addWorkTag(workId, tagId) {
      return X.dbq.insert(this.T2.WORK_TAGS, { work_id: workId, tag_id: tagId });
    },
    async createTag(name, color, icon) {
      return X.dbq.insert(this.T2.TAGS, { name, color: color || '#4493f8', icon: icon || '#' });
    },

    // ============================================================
    // announcements 全站公告
    // ============================================================
    async listAnnouncements() {
      return X.dbq.select(this.T2.ANNOUNCEMENTS, {
        order: ['created_at', { ascending: false }], limit: 50
      });
    },
    async getLatestAnnouncement() {
      return X.dbq.select(this.T2.ANNOUNCEMENTS, {
        order: ['created_at', { ascending: false }], limit: 1
      }).then(r => r[0] || null);
    },
    async createAnnouncement({ authorId, title, body, pinned }) {
      return X.dbq.insert(this.T2.ANNOUNCEMENTS, {
        author_id: authorId, title, body: body || '',
        pinned: !!pinned, created_at: new Date().toISOString()
      });
    },
    async updateAnnouncement(id, patch) {
      const rows = await X.dbq.update(this.T2.ANNOUNCEMENTS, patch, { eq: ['id', id] });
      return rows[0];
    },
    async deleteAnnouncement(id) {
      return X.dbq.remove(this.T2.ANNOUNCEMENTS, { eq: ['id', id] });
    },

    // ============================================================
    // polls + poll_options + poll_votes
    // ============================================================
    async listPolls() {
      return X.dbq.select(this.T2.POLLS, {
        order: ['created_at', { ascending: false }], limit: 50
      });
    },
    async createPoll({ authorId, question, multiple, expiresAt }) {
      return X.dbq.insert(this.T2.POLLS, {
        author_id: authorId, question,
        multiple: !!multiple, closed: false,
        expires_at: expiresAt || null,
        created_at: new Date().toISOString()
      });
    },
    async addPollOptions(pollId, options) {
      const rows = options.map((text, i) => ({
        poll_id: pollId, text, sort_order: i
      }));
      return X.dbq.insertMany(this.T2.POLL_OPTIONS, rows);
    },
    async listPollOptions(pollId) {
      return X.dbq.select(this.T2.POLL_OPTIONS, {
        eq: ['poll_id', pollId],
        order: ['sort_order', { ascending: true }]
      });
    },
    async listPollVotes(pollId) {
      return X.dbq.select(this.T2.POLL_VOTES, { eq: ['poll_id', pollId] });
    },
    async listMyVotes(pollId, userId) {
      return X.dbq.select(this.T2.POLL_VOTES, {
        filter: { poll_id: pollId, user_id: userId }
      });
    },
    async votePoll({ pollId, optionId, userId }) {
      return X.dbq.insert(this.T2.POLL_VOTES, {
        poll_id: pollId, option_id: optionId, user_id: userId,
        created_at: new Date().toISOString()
      });
    },
    async closePoll(id) {
      const rows = await X.dbq.update(this.T2.POLLS, { closed: true }, { eq: ['id', id] });
      return rows[0];
    },

    // ============================================================
    // tasks 任务看板
    // ============================================================
    async listTasks() {
      return X.dbq.select(this.T2.TASKS, {
        order: ['sort_order', { ascending: true }], limit: 200
      });
    },
    async createTask({ title, description, columnKey, assigneeId, creatorId, dueDate }) {
      return X.dbq.insert(this.T2.TASKS, {
        title, description: description || '',
        column_key: columnKey || 'todo',
        assignee_id: assigneeId || null, creator_id: creatorId,
        sort_order: Date.now(),
        due_date: dueDate || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    },
    async updateTask(id, patch) {
      const rows = await X.dbq.update(this.T2.TASKS, {
        ...patch, updated_at: new Date().toISOString()
      }, { eq: ['id', id] });
      return rows[0];
    },
    async moveTask(id, columnKey) {
      return this.updateTask(id, { column_key: columnKey });
    },
    async deleteTask(id) {
      return X.dbq.remove(this.T2.TASKS, { eq: ['id', id] });
    },

    // ============================================================
    // user_levels + medals + user_medals
    // ============================================================
    async listLevels() {
      return X.dbq.select(this.T2.USER_LEVELS, {
        order: ['level', { ascending: true }]
      });
    },
    async listMedals() {
      return X.dbq.select(this.T2.MEDALS, { order: ['name', { ascending: true }] });
    },
    async listUserMedals(userId) {
      return X.dbq.select(this.T2.USER_MEDALS, { eq: ['user_id', userId] });
    },
    async awardMedal(userId, medalCode) {
      return X.dbq.upsert(this.T2.USER_MEDALS, {
        user_id: userId, medal_code: medalCode,
        awarded_at: new Date().toISOString()
      }, { onConflict: 'user_id,medal_code' });
    },
    async awardExp(targetId, delta) {
      return X.dbq.rpc('award_exp', { target, delta: Number(delta) });
    },

    // ============================================================
    // snippets 代码片段
    // ============================================================
    async listSnippets(authorId, { publicOnly = false } = {}) {
      const filter = {};
      if (authorId) filter.author_id = authorId;
      return X.dbq.select(this.T2.SNIPPETS, {
        filter, order: ['updated_at', { ascending: false }], limit: 100
      });
    },
    async listPublicSnippets() {
      return X.dbq.select(this.T2.SNIPPETS, {
        eq: ['is_public', true],
        order: ['updated_at', { ascending: false }], limit: 100
      });
    },
    async getSnippet(id) {
      return X.dbq.select(this.T2.SNIPPETS, { eq: ['id', id], single: true });
    },
    async saveSnippet({ id, authorId, name, language, code, isPublic }) {
      if (id) {
        const rows = await X.dbq.update(this.T2.SNIPPETS, {
          name, language, code, is_public: isPublic,
          updated_at: new Date().toISOString()
        }, { eq: ['id', id] });
        return rows[0];
      }
      return X.dbq.insert(this.T2.SNIPPETS, {
        author_id: authorId, name, language, code,
        is_public: !!isPublic,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    },
    async deleteSnippet(id) {
      return X.dbq.remove(this.T2.SNIPPETS, { eq: ['id', id] });
    },

    // ============================================================
    // 在线状态：profiles.last_seen 更新
    // ============================================================
    async updateLastSeen(userId) {
      try {
        await X.dbq.update(T.PROFILES, { last_seen: new Date().toISOString() }, { eq: ['id', userId] });
      } catch (_) {}
    },
    async listOnlineUsers(seconds = 60) {
      const since = new Date(Date.now() - seconds * 1000).toISOString();
      const { data, error } = await X.db.from(T.PROFILES)
        .select('*').gte('last_seen', since);
      if (error) return [];
      return data || [];
    }
  };

  X.store = store;
})(window.Xiao = window.Xiao || {});
