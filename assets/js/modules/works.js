// ============================================================================
// Xiao 2.0 · 作品模块
// 功能：列表（按需加载）/ 上传（论文/文件夹/代码）/ 在线预览 txt·py·js·html·css
//      / 下载申请（作者同意）/ 点赞（作者 +0.01）/ 游戏分区需实名
// v2.1 升级：作品评论 / 作品收藏 / 作品标签 / 封面图懒加载 / 骨架屏
// ============================================================================
(function (X) {
  const PREVIEW_EXT = ['txt', 'py', 'js', 'html', 'css', 'md', 'json'];
  const BATCH = 20;
  // 评论表名（X.TABLES 未暴露 v2.1 新表，使用字符串字面量）
  const T_COMMENTS = 'comments';

  const works = {
    loaded: [],
    offset: 0,
    hasMore: true,
    filter: 'approved',  // approved / pending / mine / all
    sub: null,            // 列表 Realtime 订阅（新作品）
    detailSub: null,      // 详情弹窗 Realtime 订阅（新评论）
    coverObserver: null,  // 封面图懒加载观察器

    render() {
      const cur = X.auth.currentUser();
      const tabs = [
        { key: 'approved', label: X.t('works.approved') },
        { key: 'all',      label: X.t('works.all') }
      ];
      if (cur) tabs.push({ key: 'mine', label: X.t('works.my') });

      const tabsHtml = tabs.map(t =>
        `<button class="tab${t.key === this.filter ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
      ).join('');

      return `
        <section class="works-page">
          <div class="works-head">
            <h2>${X.t('works.title')}</h2>
            <div class="works-actions">
              <div class="tabs" id="wk_tabs">${tabsHtml}</div>
              ${cur ? `<button class="btn primary sm" id="wk_upload">+ ${X.t('works.upload')}</button>` : ''}
            </div>
          </div>
          <div class="works-grid" id="wk_grid"><div class="dim center">${X.t('common.loading')}</div></div>
          <div class="center" id="wk_more" style="display:none;padding:12px">
            <button class="btn ghost sm" id="wk_loadmore">${X.t('common.more')}</button>
          </div>
        </section>
      `;
    },

    async afterRender() {
      const tabs = X.utils.$$('#wk_tabs .tab');
      tabs.forEach(b => b.addEventListener('click', () => this.switchTab(b.dataset.tab)));
      const up = X.utils.$('#wk_upload');
      if (up) up.addEventListener('click', () => this.openUpload());
      const more = X.utils.$('#wk_loadmore');
      if (more) more.addEventListener('click', () => this.loadMore());

      // 初始化封面图懒加载观察器
      this._initCoverObserver();

      this.loaded = [];
      this.offset = 0;
      this.hasMore = true;

      // 初始加载前显示骨架屏
      this._showSkeleton();

      await this.loadMore();

      // Realtime：新作品 → all/approved 标签下追加
      if (X.supabaseReady && this.filter !== 'mine') {
        this.sub = X.realtime.onInsert(X.TABLES.WORKS, null, payload => {
          const w = payload.new;
          if (w && !this.loaded.find(x => x.id === w.id)) {
            if (this.filter === 'approved' && w.status !== 'approved') return;
            this.loaded.unshift(w);
            this.renderGrid();
          }
        });
      }
    },

    onLeave() {
      if (this.sub) { X.realtime.off(this.sub); this.sub = null; }
      // 兜底清理详情弹窗订阅（防止用户离开页面但未关弹窗）
      this._clearDetailSub();
      if (this.coverObserver) { this.coverObserver.disconnect(); this.coverObserver = null; }
      this.loaded = [];
    },

    async switchTab(tab) {
      this.filter = tab;
      this.loaded = [];
      this.offset = 0;
      this.hasMore = true;
      X.utils.$$('#wk_tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      this._showSkeleton();
      await this.loadMore();
    },

    async loadMore() {
      if (!this.hasMore) return;
      const grid = X.utils.$('#wk_grid');
      if (!grid) return;
      try {
        let list;
        if (this.filter === 'mine') {
          list = await X.store.listWorksByUser(X.auth.currentUser().id);
          this.hasMore = false;  // 我的作品一次拉完
        } else {
          const status = this.filter === 'approved' ? 'approved' : 'all';
          list = await X.store.listWorks({ status, limit: BATCH, offset: this.offset });
          if (list.length < BATCH) this.hasMore = false;
          this.offset += list.length;
        }
        this.loaded = this.loaded.concat(list);
        this.renderGrid();
        const more = X.utils.$('#wk_more');
        if (more) more.style.display = this.hasMore ? '' : 'none';
      } catch (e) {
        grid.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    /** 加载阶段显示骨架屏（若可用） */
    _showSkeleton() {
      const grid = X.utils.$('#wk_grid');
      if (!grid) return;
      if (X.skeleton && typeof X.skeleton.card === 'function') {
        let html = '';
        for (let i = 0; i < 6; i++) html += X.skeleton.card();
        grid.innerHTML = html;
      } else {
        grid.innerHTML = `<div class="dim center">${X.t('common.loading')}</div>`;
      }
    },

    renderGrid() {
      const grid = X.utils.$('#wk_grid');
      if (!grid) return;
      if (!this.loaded.length) {
        grid.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`;
        return;
      }
      grid.innerHTML = '';
      this.loaded.forEach(w => grid.appendChild(this._card(w)));
      // 触发懒加载：观察新生成的封面图
      this._observeCovers();
    },

    _card(w) {
      const cat = w.category === 'paper' ? '📄' : (w.category === 'folder' ? '📁' : '💻');
      const price = Number(w.price) > 0 ? `🪙 ${X.utils.fmtCoin(w.price)}` : X.t('works.free');
      const status = w.status === 'pending' ? '⏳' : (w.status === 'rejected' ? '❌' : '');
      const cur = X.auth.currentUser();

      const card = X.utils.h('div', { class: 'work-card' });

      // 封面图（仅当 work.cover 存在时显示，懒加载）
      if (w.cover) {
        const coverWrap = X.utils.h('div', { class: 'work-cover' });
        const img = X.utils.h('img', {
          class: 'work-cover-img lazy',
          alt: w.name || '',
          'data-src': w.cover
        });
        // 占位透明像素，避免布局抖动
        img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        coverWrap.appendChild(img);
        card.appendChild(coverWrap);
      }

      card.appendChild(X.utils.h('div', { class: 'work-head' }, [
        X.utils.h('span', { class: 'work-cat', text: cat }),
        X.utils.h('span', { class: 'work-name', text: w.name }),
        X.utils.h('span', { class: 'dim', text: status })
      ]));
      card.appendChild(X.utils.h('div', { class: 'work-desc', text: w.description || '' }));

      // 标签条（异步填充，先放占位容器）
      const tagBar = X.utils.h('div', { class: 'work-tags', 'data-wid': w.id });
      card.appendChild(tagBar);

      card.appendChild(X.utils.h('div', { class: 'work-meta' }, [
        X.utils.h('span', { class: 'price', text: price }),
        X.utils.h('span', { class: 'dim', text: '· ' + X.utils.relTime(w.created_at) }),
        X.utils.h('span', { class: 'likes', text: '❤ ' + (w.likes || 0) })
      ]));

      // 收藏按钮（仅登录后显示）
      if (cur) {
        const favBtn = X.utils.h('button', {
          class: 'btn ghost xs work-fav-btn',
          text: '☆ 收藏',
          'data-wid': w.id
        });
        favBtn.addEventListener('click', e => {
          e.stopPropagation();
          this._toggleFavCard(w, favBtn);
        });
        card.appendChild(favBtn);
      }

      card.addEventListener('click', () => this.openDetail(w));
      return card;
    },

    // ----------------------------------------------------------------
    // 封面图懒加载（IntersectionObserver）
    // ----------------------------------------------------------------
    _initCoverObserver() {
      if (typeof IntersectionObserver === 'undefined') {
        this.coverObserver = null;
        return;
      }
      this.coverObserver = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            const img = en.target;
            const src = img.getAttribute('data-src');
            if (src) {
              img.setAttribute('src', src);
              img.removeAttribute('data-src');
            }
            this.coverObserver.unobserve(img);
          }
        });
      }, { rootMargin: '60px' });
    },

    _observeCovers() {
      if (!this.coverObserver) {
        // 降级：直接给所有懒加载图片赋 src
        X.utils.$$('.work-cover-img.lazy').forEach(img => {
          const s = img.getAttribute('data-src');
          if (s) { img.setAttribute('src', s); img.removeAttribute('data-src'); }
        });
        return;
      }
      X.utils.$$('.work-cover-img.lazy[data-src]').forEach(img => {
        this.coverObserver.observe(img);
      });
    },

    // ----------------------------------------------------------------
    // 收藏（卡片入口）
    // ----------------------------------------------------------------
    async _toggleFavCard(w, btn) {
      const cur = X.auth.currentUser();
      if (!cur) { X.ui.toast('请先登录', 'err'); return; }
      try {
        const r = await X.store.toggleFavorite(w.id, cur.id);
        btn.textContent = r.favorited ? '★ 已收藏' : '☆ 收藏';
        X.ui.toast(r.favorited ? '已收藏' : '已取消收藏', 'ok');
      } catch (e) {
        X.ui.toast('操作失败', 'err');
      }
    },

    async openDetail(w) {
      const cur = X.auth.currentUser();
      // 拉取最新作品
      let work = w;
      try { work = await X.store.getWork(w.id) || w; } catch (_) {}
      const isAuthor = cur && work.author_id === cur.id;
      const isAdmin = X.auth.isAdmin();

      const body = X.utils.h('div', { class: 'work-detail' });
      body.appendChild(X.utils.h('h3', { text: work.name }));

      // 封面图（详情也用懒加载）
      if (work.cover) {
        body.appendChild(X.utils.h('img', {
          class: 'work-cover-img',
          src: work.cover,
          alt: work.name || '',
          style: { maxWidth: '100%', borderRadius: '8px', marginBottom: '8px' }
        }));
      }

      body.appendChild(X.utils.h('div', { class: 'work-meta', style: { marginBottom: '8px' } }, [
        X.utils.h('span', { class: 'price', text: Number(work.price) > 0 ? `🪙 ${X.utils.fmtCoin(work.price)}` : X.t('works.free') }),
        X.utils.h('span', { class: 'dim', text: ' · ' + (work.category || '') + ' · ' + X.utils.relTime(work.created_at) })
      ]));
      body.appendChild(X.utils.h('p', { class: 'work-desc', text: work.description || X.t('common.empty') }));
      body.appendChild(X.utils.h('p', { class: 'dim', text: '文件：' + (work.file_name || '-') }));

      // 操作按钮区
      const actions = X.utils.h('div', { class: 'work-actions' });
      // 预览：仅 txt/py/js/html/css/md/json
      const ext = (work.file_name || '').split('.').pop().toLowerCase();
      if (PREVIEW_EXT.indexOf(ext) >= 0) {
        actions.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: X.t('works.preview'),
          onclick: () => this.openPreview(work) }));
      }
      // 点赞
      if (cur && !isAuthor) {
        actions.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: '❤ ' + X.t('works.like'),
          onclick: () => this.toggleLike(work) }));
      }
      // 收藏（登录后显示）
      if (cur) {
        const favBtn = X.utils.h('button', { class: 'btn ghost sm', text: '☆ 收藏' });
        // 初始状态：查询是否已收藏
        X.store.isFavorited(work.id, cur.id).then(fav => {
          favBtn.textContent = fav ? '★ 已收藏' : '☆ 收藏';
        }).catch(() => {});
        favBtn.addEventListener('click', async () => {
          try {
            const r = await X.store.toggleFavorite(work.id, cur.id);
            favBtn.textContent = r.favorited ? '★ 已收藏' : '☆ 收藏';
            X.ui.toast(r.favorited ? '已收藏' : '已取消收藏', 'ok');
          } catch (e) { X.ui.toast('操作失败', 'err'); }
        });
        actions.appendChild(favBtn);
      }
      // 下载申请（非作者；管理员直接下载）
      if (cur && !isAuthor) {
        actions.appendChild(X.utils.h('button', { class: 'btn primary sm', text: X.t('works.requestDl'),
          onclick: () => this.requestDownload(work) }));
      }
      // 作者：查看下载申请
      if (isAuthor) {
        actions.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: '下载申请',
          onclick: () => this.listMyDlReqs(work) }));
      }
      // 删除（作者）
      if (isAuthor) {
        actions.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: X.t('common.delete'),
          onclick: () => this.deleteWork(work) }));
      }
      // 管理员：通过/拒绝（仅 pending）
      if (isAdmin && work.status === 'pending') {
        actions.appendChild(X.utils.h('button', { class: 'btn primary sm', text: X.t('works.approved'),
          onclick: () => this.adminApprove(work) }));
        actions.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: X.t('works.rejected'),
          onclick: () => this.adminReject(work) }));
      }
      body.appendChild(actions);

      // 标签区
      const tagWrap = X.utils.h('div', { class: 'work-detail-tags', style: { marginTop: '12px' } });
      tagWrap.appendChild(X.utils.h('div', { class: 'dim', text: '标签：', style: { fontSize: '12px', marginBottom: '4px' } }));
      const tagList = X.utils.h('div', { class: 'tag-list' });
      tagWrap.appendChild(tagList);
      if (isAuthor) {
        const addTagBtn = X.utils.h('button', { class: 'btn ghost xs', text: '+ 添加标签' });
        addTagBtn.addEventListener('click', () => this._openAddTag(work, tagList));
        tagWrap.appendChild(addTagBtn);
      }
      body.appendChild(tagWrap);
      // 异步加载标签
      this._renderTags(work.id, tagList);

      // 评论区
      body.appendChild(this._buildCommentSection(work));

      // 打开弹窗，注册 onClose 清理评论订阅
      X.ui.modal({
        title: X.t('works.title'), body, size: 'lg',
        onClose: () => this._clearDetailSub()
      });

      // 加载评论 + 订阅新评论
      this._loadComments(work);
      this._subscribeComments(work);
    },

    // ----------------------------------------------------------------
    // 标签
    // ----------------------------------------------------------------
    async _renderTags(workId, container) {
      try {
        const tags = await X.store.listWorkTags(workId);
        container.innerHTML = '';
        if (!tags || !tags.length) {
          container.appendChild(X.utils.h('span', { class: 'dim', text: '无', style: { fontSize: '12px' } }));
          return;
        }
        tags.forEach(t => {
          const chip = X.utils.h('span', {
            class: 'tag-chip',
            text: (t.icon || '#') + ' ' + (t.name || ''),
            style: {
              display: 'inline-block',
              padding: '2px 8px',
              margin: '2px 4px 2px 0',
              borderRadius: '10px',
              fontSize: '12px',
              background: t.color || '#4493f8',
              color: '#fff'
            }
          });
          container.appendChild(chip);
        });
      } catch (e) {
        container.innerHTML = '';
        container.appendChild(X.utils.h('span', { class: 'dim', text: '加载失败', style: { fontSize: '12px' } }));
      }
    },

    async _openAddTag(work, tagList) {
      const cur = X.auth.currentUser();
      if (!cur) { X.ui.toast('请先登录', 'err'); return; }
      const isAdmin = X.auth.isAdmin();
      const body = X.utils.h('div');

      let allTags = [];
      try { allTags = await X.store.listTags() || []; } catch (e) { allTags = []; }

      // 已选标签容器
      const pickWrap = X.utils.h('div', { class: 'tag-pick-wrap' });
      const renderPicks = () => {
        pickWrap.innerHTML = '';
        if (!allTags.length) {
          pickWrap.appendChild(X.utils.h('span', { class: 'dim', text: '暂无标签可选' }));
          return;
        }
        allTags.forEach(t => {
          const b = X.utils.h('button', {
            class: 'btn ghost xs',
            text: (t.icon || '#') + ' ' + (t.name || ''),
            style: { margin: '2px' }
          });
          b.addEventListener('click', async () => {
            try {
              await X.store.addWorkTag(work.id, t.id);
              X.ui.toast('已添加', 'ok');
              this._renderTags(work.id, tagList);
            } catch (e) {
              const m = (e && e.message) || '';
              if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) {
                X.ui.toast('已存在该标签', 'err');
              } else {
                X.ui.toast('添加失败', 'err');
              }
            }
          });
          pickWrap.appendChild(b);
        });
      };
      renderPicks();
      body.appendChild(X.utils.h('p', { class: 'dim', text: '从已有标签选择：', style: { fontSize: '12px', margin: '0 0 4px' } }));
      body.appendChild(pickWrap);

      // 创建新标签（仅管理员）
      if (isAdmin) {
        body.appendChild(X.utils.h('hr'));
        body.appendChild(X.utils.h('p', { class: 'dim', text: '或创建新标签（仅管理员）：', style: { fontSize: '12px', margin: '8px 0 4px' } }));
        const fName = X.utils.h('input', { class: 'input', placeholder: '标签名', style: { marginBottom: '4px' } });
        const fColor = X.utils.h('input', { class: 'input', type: 'color', value: '#4493f8', style: { width: '60px', height: '32px', padding: '0' } });
        const fIcon = X.utils.h('input', { class: 'input', placeholder: '图标(emoji/#)', value: '#', style: { width: '80px' } });
        const row = X.utils.h('div', { class: 'row', style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, [fName, fColor, fIcon]);
        body.appendChild(row);
        const createBtn = X.utils.h('button', { class: 'btn primary sm', text: '创建并添加', style: { marginTop: '6px' } });
        createBtn.addEventListener('click', async () => {
          const name = fName.value.trim();
          if (!name) { X.ui.toast('请填标签名', 'err'); return; }
          try {
            const t = await X.store.createTag(name, fColor.value, fIcon.value.trim() || '#');
            await X.store.addWorkTag(work.id, t.id);
            X.ui.toast('已创建并添加', 'ok');
            this._renderTags(work.id, tagList);
          } catch (e) {
            X.ui.toast('创建失败：' + ((e && e.message) || ''), 'err');
          }
        });
        body.appendChild(createBtn);
      } else {
        body.appendChild(X.utils.h('p', { class: 'dim', text: '（创建新标签需管理员权限）', style: { fontSize: '12px', margin: '8px 0 0' } }));
      }

      X.ui.modal({ title: '添加标签', body, size: 'sm' });
    },

    // ----------------------------------------------------------------
    // 评论
    // ----------------------------------------------------------------
    _buildCommentSection(work) {
      const cur = X.auth.currentUser();
      const wrap = X.utils.h('div', { class: 'work-comments', style: { marginTop: '16px' } });
      wrap.appendChild(X.utils.h('div', { class: 'dim', text: '评论：', style: { fontSize: '13px', marginBottom: '6px' } }));

      // 评论列表容器
      const list = X.utils.h('div', { class: 'comment-list', id: 'wk_comment_list' });
      list.appendChild(X.utils.h('div', { class: 'dim center', text: X.t('common.loading'), style: { padding: '8px' } }));
      wrap.appendChild(list);

      // 输入区（仅登录后显示）
      if (cur) {
        const inputRow = X.utils.h('div', { class: 'comment-input-row', style: { display: 'flex', gap: '6px', marginTop: '8px' } });
        const input = X.utils.h('input', {
          class: 'input', type: 'text',
          placeholder: '写下你的评论…',
          id: 'wk_comment_input'
        });
        const sendBtn = X.utils.h('button', { class: 'btn primary sm', text: '发送' });
        // 回复状态提示（点击回复按钮时显示）
        const replyHint = X.utils.h('div', { class: 'dim', id: 'wk_reply_hint', style: { display: 'none', fontSize: '12px', marginTop: '4px' } });

        const doSend = async () => {
          const text = input.value.trim();
          if (!text) { X.ui.toast('评论不能为空', 'err'); return; }
          const replyTo = input.getAttribute('data-reply-to') || null;
          await this._sendComment(work, input, replyTo, replyHint);
        };
        sendBtn.addEventListener('click', doSend);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); doSend(); }
        });

        inputRow.appendChild(input);
        inputRow.appendChild(sendBtn);
        wrap.appendChild(inputRow);
        wrap.appendChild(replyHint);
      } else {
        wrap.appendChild(X.utils.h('div', { class: 'dim center', text: '登录后可评论', style: { padding: '8px', fontSize: '12px' } }));
      }

      return wrap;
    },

    async _loadComments(work) {
      const list = X.utils.$('#wk_comment_list');
      if (!list) return;
      try {
        const comments = await X.store.listComments(work.id) || [];
        this._renderComments(comments, list);
      } catch (e) {
        list.innerHTML = '';
        list.appendChild(X.utils.h('div', { class: 'dim center err', text: '评论加载失败', style: { padding: '8px' } }));
      }
    },

    _renderComments(comments, list) {
      const cur = X.auth.currentUser();
      list.innerHTML = '';
      if (!comments.length) {
        list.appendChild(X.utils.h('div', { class: 'dim center', text: '暂无评论', style: { padding: '8px' } }));
        return;
      }
      // 按时间排序（listComments 已按 created_at 升序，这里再保险一次）
      comments.slice().sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return (ta || 0) - (tb || 0);
      }).forEach(c => {
        list.appendChild(this._commentNode(c, cur, false));
      });
    },

    _commentNode(c, cur, isReply) {
      const avatarType = c.avatar_type || 'emoji';
      const av = c.avatar || '❓';
      const avEl = avatarType === 'dataurl'
        ? X.utils.h('img', { class: 'avatar sm', src: av, alt: c.username || '' })
        : X.utils.h('span', { class: 'avatar sm emoji' }, [av]);

      const head = X.utils.h('div', { class: 'comment-head', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        avEl,
        X.utils.h('span', { class: 'name', text: c.username || '?', style: { fontWeight: '600', fontSize: '13px' } }),
        X.utils.h('span', { class: 'dim', text: '· ' + X.utils.relTime(c.created_at), style: { fontSize: '12px' } })
      ]);

      const text = X.utils.h('div', { class: 'comment-text', text: c.text || '', style: { margin: '2px 0 4px 30px', fontSize: '14px', wordBreak: 'break-word' } });

      const acts = X.utils.h('div', { class: 'comment-actions', style: { marginLeft: '30px', marginBottom: '6px' } });
      // 回复按钮（登录后显示）
      if (cur) {
        const replyBtn = X.utils.h('button', { class: 'btn ghost xs', text: '回复', style: { padding: '0 6px' } });
        replyBtn.addEventListener('click', () => {
          const input = X.utils.$('#wk_comment_input');
          const hint = X.utils.$('#wk_reply_hint');
          if (input) {
            input.setAttribute('data-reply-to', c.id);
            input.focus();
            if (hint) {
              hint.style.display = '';
              hint.textContent = '回复 @' + (c.username || '?') + '（Esc 取消）';
            }
          }
        });
        acts.appendChild(replyBtn);
      }
      // 删除按钮（仅自己可删）
      if (cur && c.user_id === cur.id) {
        const delBtn = X.utils.h('button', { class: 'btn ghost xs', text: '删除', style: { padding: '0 6px', color: '#e55' } });
        delBtn.addEventListener('click', async () => {
          const ok = await X.ui.confirm('删除这条评论？');
          if (!ok) return;
          try {
            await X.store.deleteComment(c.id);
            X.ui.toast('已删除', 'ok');
            // 从 DOM 直接移除（Realtime 不会推送 DELETE，但本地清理）
            const node = delBtn.closest('.comment-node');
            if (node && node.parentNode) node.parentNode.removeChild(node);
          } catch (e) { X.ui.toast('删除失败', 'err'); }
        });
        acts.appendChild(delBtn);
      }

      const node = X.utils.h('div', { class: 'comment-node' + (isReply ? ' is-reply' : ''), 'data-id': c.id }, [head, text, acts]);
      // 回复评论缩进
      if (isReply) {
        node.style.marginLeft = '24px';
        node.style.borderLeft = '2px solid rgba(255,255,255,0.1)';
        node.style.paddingLeft = '8px';
      }
      return node;
    },

    async _sendComment(work, input, replyTo, replyHint) {
      const cur = X.auth.currentUser();
      if (!cur) { X.ui.toast('请先登录', 'err'); return; }
      const text = input.value.trim();
      if (!text) return;
      try {
        const created = await X.store.addComment({
          workId: work.id,
          userId: cur.id,
          username: cur.username,
          avatar: cur.avatar,
          avatarType: cur.avatar_type,
          text,
          replyTo: replyTo || null
        });
        // Realtime 会推送自己发的评论；为避免重复，这里检查去重后追加
        const list = X.utils.$('#wk_comment_list');
        if (list && created) {
          const exists = X.utils.$('.comment-node[data-id="' + created.id + '"]', list);
          if (!exists) {
            // 移除"暂无评论"占位
            const empty = list.querySelector('.dim.center');
            if (empty && empty.textContent.indexOf('暂无评论') >= 0) empty.remove();
            list.appendChild(this._commentNode(created, cur, !!replyTo));
            list.scrollTop = list.scrollHeight;
          }
        }
        input.value = '';
        input.removeAttribute('data-reply-to');
        if (replyHint) { replyHint.style.display = 'none'; replyHint.textContent = ''; }
        X.ui.toast('已发送', 'ok');
      } catch (e) {
        X.ui.toast('发送失败：' + ((e && e.message) || ''), 'err');
      }
    },

    /** 订阅评论表 INSERT（filter: work_id=eq.xxx） */
    _subscribeComments(work) {
      if (!X.supabaseReady) return;
      const filter = `work_id=eq.${work.id}`;
      this.detailSub = X.realtime.onInsert(T_COMMENTS, filter, payload => {
        const c = payload.new;
        if (!c) return;
        const list = X.utils.$('#wk_comment_list');
        if (!list) return;
        // 去重
        const exists = X.utils.$('.comment-node[data-id="' + c.id + '"]', list);
        if (exists) return;
        // 移除"暂无评论"占位
        const empty = list.querySelector('.dim.center');
        if (empty && empty.textContent.indexOf('暂无评论') >= 0) empty.remove();
        const cur = X.auth.currentUser();
        list.appendChild(this._commentNode(c, cur, !!c.reply_to));
        list.scrollTop = list.scrollHeight;
      });
    },

    /** 清理详情弹窗的评论订阅 */
    _clearDetailSub() {
      if (this.detailSub) {
        try { X.realtime.off(this.detailSub); } catch (_) {}
        this.detailSub = null;
      }
    },

    async openPreview(work) {
      if (!work.file_path) { X.ui.toast('文件路径为空', 'err'); return; }
      // 实名检查：游戏分区 + 非管理员需实名
      const isGame = (work.category || '').toLowerCase() === 'game' || (work.file_type || '').toLowerCase() === 'game';
      if (isGame && !X.auth.isAdmin() && !X.auth.isRealname()) {
        X.ui.toast(X.t('works.needRealname'), 'err');
        return;
      }
      try {
        const text = await X.storage.downloadText(X.SUPABASE_CONFIG.STORAGE_BUCKET_WORKS, work.file_path);
        const body = X.utils.h('pre', { class: 'code-preview' }, [text]);
        X.ui.modal({ title: '预览 · ' + work.file_name, body, size: 'lg' });
      } catch (e) {
        X.ui.toast(X.t('err.downloadFail') + '：' + (e.message || ''), 'err');
      }
    },

    async toggleLike(work) {
      try {
        const r = await X.store.toggleLike(work.id, X.auth.currentUser().id);
        X.ui.toast(r.liked ? X.t('ok.liked') : X.t('ok.unliked'), 'ok');
        // 刷新当前卡片
        const w = await X.store.getWork(work.id);
        if (w) { work.likes = w.likes; this.renderGrid(); }
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    async requestDownload(work) {
      if (!X.auth.requireLogin()) return;
      // 游戏分区需实名
      const isGame = (work.category || '').toLowerCase() === 'game' || (work.file_type || '').toLowerCase() === 'game';
      if (isGame && !X.auth.isRealname()) {
        X.ui.toast(X.t('works.needRealname'), 'err');
        return;
      }
      const cur = X.auth.currentUser();
      try {
        await X.store.requestDownload(work.id, cur.id);
        X.ui.toast(X.t('ok.sent'), 'ok');
      } catch (e) {
        const m = (e && e.message) || '';
        if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) {
          X.ui.toast('已申请过', 'err');
        } else {
          X.ui.toast('申请失败：' + m, 'err');
        }
      }
    },

    async listMyDlReqs(work) {
      try {
        const reqs = await X.store.listDownloadReqsForAuthor(X.auth.currentUser().id);
        const mine = reqs.filter(r => r.work_id === work.id);
        if (!mine.length) { X.ui.toast('暂无下载申请', 'info'); return; }
        const body = X.utils.h('div');
        mine.forEach(r => {
          const row = X.utils.h('div', { class: 'user-row' }, [
            X.utils.h('span', { text: '用户 ' + r.user_id.slice(0, 8) }),
            X.utils.h('span', { class: 'dim', text: r.status })
          ]);
          if (r.status === 'pending') {
            const acts = X.utils.h('div', { class: 'row-actions' });
            acts.appendChild(X.utils.h('button', { class: 'btn primary xs', text: X.t('common.confirm'),
              onclick: async () => { await X.store.approveDownload(r.id); X.ui.toast(X.t('ok.approved'),'ok'); } }));
            acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('common.cancel'),
              onclick: async () => { await X.store.rejectDownload(r.id); X.ui.toast(X.t('ok.rejected'),'ok'); } }));
            row.appendChild(acts);
          }
          body.appendChild(row);
        });
        X.ui.modal({ title: '下载申请', body });
      } catch (e) { X.ui.toast('加载失败', 'err'); }
    },

    async deleteWork(work) {
      const ok = await X.ui.confirm('删除作品「' + work.name + '」？');
      if (!ok) return;
      try {
        await X.store.deleteWork(work.id);
        // 尝试删文件
        if (work.file_path) {
          try { await X.storage.remove(X.SUPABASE_CONFIG.STORAGE_BUCKET_WORKS, [work.file_path]); } catch (_) {}
        }
        X.ui.toast(X.t('ok.deleted'), 'ok');
        this.loaded = this.loaded.filter(x => x.id !== work.id);
        this.renderGrid();
      } catch (e) { X.ui.toast('删除失败', 'err'); }
    },

    async adminApprove(work) {
      try {
        await X.store.approveWork(work.id);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'approve_work',
          targetId: work.id,
          reason: '通过作品'
        });
        X.ui.toast(X.t('ok.approved'), 'ok');
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },
    async adminReject(work) {
      const reason = await X.ui.prompt({
        title: X.t('admin.reason'), label: X.t('admin.reason'),
        multiline: true, confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      });
      if (!reason) return;
      try {
        await X.store.rejectWork(work.id);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'reject_work',
          targetId: work.id, reason
        });
        X.ui.toast(X.t('ok.rejected'), 'ok');
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    // ----------------------------------------------------------------
    // 上传作品弹窗
    // ----------------------------------------------------------------
    openUpload() {
      const cur = X.auth.currentUser();
      const body = X.utils.h('div', { class: 'form' });

      const fName = X.utils.h('input', { class: 'input', type: 'text', placeholder: X.t('works.name') });
      const fDesc = X.utils.h('textarea', { class: 'textarea', placeholder: X.t('works.desc'), rows: 2 });
      const fCat = X.utils.h('select', { class: 'input' });
      [['paper', X.t('works.cat_paper')], ['folder', X.t('works.cat_folder')], ['code', X.t('works.cat_code')]]
        .forEach(([v, l]) => fCat.appendChild(X.utils.h('option', { value: v }, [l])));
      const fPrice = X.utils.h('input', { class: 'input', type: 'number', placeholder: X.t('works.price'), value: '0', min: '0', step: '0.01' });
      const fFile = X.utils.h('input', { type: 'file' });
      body.appendChild(X.utils.h('label', { class: 'field' }, [X.utils.h('span', { class: 'label', text: X.t('works.name') }), fName]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [X.utils.h('span', { class: 'label', text: X.t('works.desc') }), fDesc]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [X.utils.h('span', { class: 'label', text: X.t('works.category') }), fCat]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [X.utils.h('span', { class: 'label', text: X.t('works.price') }), fPrice]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [X.utils.h('span', { class: 'label', text: X.t('works.file') }), fFile]));

      const submit = X.utils.h('button', { class: 'btn primary full', text: X.t('common.submit') });
      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel') });
      let inst;
      const doSubmit = async () => {
        const name = fName.value.trim();
        if (!name) { X.ui.toast(X.t('err.required'), 'err'); return; }
        if (!fFile.files[0]) { X.ui.toast('请选择文件', 'err'); return; }
        const file = fFile.files[0];
        if (file.size > 50 * 1024 * 1024) { X.ui.toast('文件 ≤ 50MB', 'err'); return; }
        submit.disabled = true; submit.textContent = '上传中…';
        try {
          const ext = file.name.split('.').pop().toLowerCase();
          const path = `${cur.id}/${Date.now()}_${file.name}`;
          await X.storage.upload(X.SUPABASE_CONFIG.STORAGE_BUCKET_WORKS, path, file, { upsert: false });
          await X.store.createWork({
            authorId: cur.id,
            name, desc: fDesc.value,
            category: fCat.value,
            price: fPrice.value,
            fileName: file.name,
            filePath: path,
            fileType: ext
          });
          X.ui.toast('已提交，等待审核', 'ok');
          inst.close();
          // 切到我的作品
          this.filter = 'mine';
          this.loaded = [];
          this.offset = 0;
          this.hasMore = true;
          await this.loadMore();
          X.utils.$$('#wk_tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'mine'));
        } catch (e) {
          X.ui.toast(X.t('err.uploadFail') + '：' + (e.message || ''), 'err');
        } finally {
          submit.disabled = false; submit.textContent = X.t('common.submit');
        }
      };
      submit.addEventListener('click', doSubmit);
      cancel.addEventListener('click', () => inst.close());

      inst = X.ui.modal({
        title: X.t('works.upload'), body,
        footer: [cancel, submit], size: 'lg'
      });
    }
  };

  X.modules = X.modules || {};
  X.modules.works = works;
  X.router.register('works', {
    render: () => works.render(),
    afterRender: () => works.afterRender(),
    onLeave: () => works.onLeave()
  });
})(window.Xiao = window.Xiao || {});
