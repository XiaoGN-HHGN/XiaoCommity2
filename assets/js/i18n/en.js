// ============================================================================
// Xiao 2.0 · i18n English dictionary
// ============================================================================
(function (X) {
  X.i18n = X.i18n || {};
  X.i18n.en = {
    app: { name: 'Xiao · SeaFox Society', tagline: 'Penguin + Dolphin + Snow Fox · STEM community' },
    nav: {
      home: 'Home', chat: 'Chat', works: 'Works', editor: 'Editor',
      social: 'Social', admin: 'Admin', video: 'Research Video',
      profile: 'Profile', redeem: 'Redeem',
      leaderboard: 'Leaderboard', tasks: 'Tasks', polls: 'Polls', announcements: 'Announcements'
    },
    common: {
      confirm: 'OK', cancel: 'Cancel', submit: 'Submit', save: 'Save',
      delete: 'Delete', edit: 'Edit', back: 'Back', loading: 'Loading…',
      empty: 'No data', more: 'Load more', all: 'All', search: 'Search',
      yes: 'Yes', no: 'No', open: 'Open', close: 'Close'
    },
    auth: {
      login: 'Login', register: 'Register', logout: 'Logout',
      username: 'Username', password: 'Password', confirmPwd: 'Confirm password',
      phone: 'Phone', avatar: 'Avatar', remember: 'Remember me',
      pickAvatar: 'Pick avatar', uploadAvatar: 'Upload avatar',
      noAccount: 'No account? Register', hasAccount: 'Have account? Login'
    },
    home: {
      hero: 'Welcome to Xiao',
      intro: 'Xiao is an open community for STEM researchers: chat, DM, groups, work sharing, online code editor.',
      features: 'Core features',
      feat1: '🐧 Public chat + DM + groups (Realtime push)',
      feat2: '📦 Upload papers / folders / code, preview txt/python/js/html/css',
      feat3: '⚡ Built-in JS/HTML/CSS/Python editor with collaboration',
      feat4: '🪙 Ttpx_A coin: 10 for new users, +0.01 per like, -20 to create group',
      feat5: '🛡️ Admin system: redeem code for temp admin, logged rewards/punishments',
      feat6: '🌍 3 languages: 中文 / English / Русский',
      feat7: '🎨 3 themes: Dark / Light / Cyber (persisted)',
      feat8: '⌘ Command palette: Ctrl/Cmd+K for quick nav & actions',
      feat9: '🏆 Leaderboard / 📋 Kanban tasks / 📊 Polls / 📢 Announcements',
      feat10: '🏅 Levels & medals / 💬 Bio & status / 🏷 Tags & comments',
      feat11: '📱 PWA installable, offline cache for static assets',
      feat12: '🦴 Skeletons + presence sync (Supabase Presence)',
      start: 'Get started →'
    },
    chat: {
      title: 'Public Chat', placeholder: 'Say something… (@user space link auto-jump)',
      send: 'Send', online: 'online', msgs: 'msgs',
      emoji: 'Emoji', muted: 'You are muted', empty: 'No messages yet, send the first!',
      recall: 'Recall', edit: 'Edit', reply: 'Reply',
      pin: 'Pin', unpin: 'Unpin',
      recalled: 'This message was recalled', edited: 'edited',
      pinned: 'Pinned message', replyTo: 'Replying to'
    },
    social: {
      title: 'Social', myFriends: 'My friends', addFriend: 'Add friend',
      friendReq: 'Friend requests', blocked: 'Blocked', myGroups: 'My groups',
      createGroup: 'Create group (-{cost} Ttpx_A)', groupName: 'Group name',
      groupMax: 'Max members', joinReq: 'Request to join', members: 'Members',
      kick: 'Kick', muteInGroup: 'Mute in group', shareInGroup: 'Share resource',
      dm: 'DM', block: 'Block', unblock: 'Unblock', accept: 'Accept',
      reject: 'Reject', remove: 'Remove friend'
    },
    works: {
      title: 'Works', upload: 'Upload', my: 'My works', all: 'All works',
      pending: 'Pending', approved: 'Approved', name: 'Name', desc: 'Description',
      category: 'Category', cat_paper: 'Paper', cat_folder: 'Folder', cat_code: 'Code',
      price: 'Price (0=free)', free: 'Free', file: 'File', preview: 'Preview',
      download: 'Download', like: 'Like', likes: 'likes', requestDl: 'Request download',
      approvedDl: 'Download approved', needRealname: 'Game category requires real-name verification',
      realname: 'Real-name', loadMore: 'Load more', loadAll: 'All loaded',
      comments: 'Comments', comment: 'Comment', addComment: 'Write a comment…',
      favorite: 'Favorite', favorited: 'Favorited',
      tags: 'Tags', addTag: 'Add tag', createTag: 'Create new tag',
      tagName: 'Tag name', tagColor: 'Color', myFavorites: 'My favorites'
    },
    editor: {
      title: 'Online Editor', lang: 'Language', run: 'Run', clear: 'Clear',
      js: 'JavaScript', html: 'HTML', css: 'CSS', python: 'Python',
      collab: 'Collaboration (Realtime)', output: 'Output', noOutput: 'No output',
      pyNotSupported: 'Python online execution requires backend; only local preview now'
    },
    profile: {
      title: 'Profile', info: 'Basic info', myWorks: 'My works',
      myFriends: 'My friends', myGroups: 'My groups', myBlocked: 'Blocked',
      friendReq: 'Friend requests', balance: 'Ttpx_A balance', realname: 'Real-name',
      realnameDone: 'verified', realnameNone: 'unverified',
      memberSince: 'Member since', editAvatar: 'Change avatar',
      level: 'Level', exp: 'Exp', nextLevel: 'To next level',
      myMedals: 'My medals', noMedals: 'No medals yet',
      editBio: 'Edit bio', editStatus: 'Edit status', statusPlaceholder: 'Say something…'
    },
    admin: {
      title: 'Admin', users: 'Users', works: 'Work review',
      reports: 'Reports', logs: 'Logs', coin: 'Coin',
      balance: 'Balance', role: 'Role', banned: 'Banned', muted: 'Muted',
      realname: 'Real-name', banUser: 'Ban', unbanUser: 'Unban',
      muteUser: 'Mute', unmuteUser: 'Unmute', banPerm: 'Perm ban',
      banTemp: 'Temp ban', banHours: 'Ban hours',
      adjustCoin: 'Adjust coin', amount: 'Amount (+/-)',
      approve: 'Approve', reject: 'Reject', resolve: 'Resolve report',
      reason: 'Reason (required)', action: 'Action',
      addAdmin: 'Promote to admin', removeAdmin: 'Demote admin',
      target: 'Target', operator: 'Operator', time: 'Time',
      dashboard: 'Dashboard', totalUsers: 'Total users', totalWorks: 'Total works',
      pendingWorks: 'Pending review', totalMessages: 'Total messages', totalReports: 'Total reports',
      pendingReports: 'Pending', last7days: 'New users (7d)',
      newAnnouncement: 'New announcement', annTitle: 'Title', annBody: 'Body', annPinned: 'Pinned',
      medals: 'Medals', awardMedal: 'Award medal', exportCsv: 'Export CSV',
      searchUser: 'Search users…', filterRole: 'Filter by role'
    },
    video: { title: 'Research Video', dev: 'Feature under development', placeholder: '🎬 Coming soon' },
    misc: { contact: 'Contact us', contactUrl: 'Follow us on Bilibili' },
    ok: {
      registered: 'Registered, auto logged in', loggedIn: 'Logged in',
      loggedOut: 'Logged out', saved: 'Saved', deleted: 'Deleted',
      sent: 'Sent', approved: 'Approved', rejected: 'Rejected',
      liked: 'Liked', unliked: 'Unliked', friendAdded: 'Friend added',
      blocked: 'Blocked', unblocked: 'Unblocked', groupCreated: 'Group created',
      joined: 'Join requested', kicked: 'Kicked', muted: 'Muted',
      coinAdjusted: 'Coin adjusted', banSet: 'Ban set', muteSet: 'Mute set'
    },
    err: {
      required: 'This field is required', loginFail: 'Login failed', registerFail: 'Register failed',
      passwordMismatch: 'Passwords do not match', phoneFormat: 'Invalid phone',
      userExists: 'User already exists', noPerm: 'No permission', notLoggedIn: 'Please login first',
      notAdmin: 'Not admin', alreadyFriend: 'Already friends', alreadyBlocked: 'Already blocked',
      notFriend: 'Not friend', coinNotEnough: 'Insufficient Ttpx_A',
      uploadFail: 'Upload failed', downloadFail: 'Download failed', sendFail: 'Send failed',
      redeemFail: 'Invalid redeem code', sessionExpired: 'Session expired, please login again'
    },
    cmdk: {
      title: 'Command palette', placeholder: 'Type a command or search…', empty: 'No matches',
      group_nav: 'Navigate', group_action: 'Actions', group_theme: 'Theme', group_lang: 'Language'
    },
    theme: { dark: 'Dark', light: 'Light', cyber: 'Cyber', cycled: 'Theme cycled' },
    presence: { online: 'Online', offline: 'Offline', justNow: 'Active just now' },
    tasks: {
      title: 'Tasks', todo: 'To do', doing: 'In progress', done: 'Done',
      newTask: 'New task', taskTitle: 'Title', taskDesc: 'Description',
      dueDate: 'Due date', assignee: 'Assignee',
      noTasks: 'No tasks', moveTask: 'Drag to move'
    },
    polls: {
      title: 'Polls', newPoll: 'New poll', question: 'Question', options: 'Options',
      addOption: 'Add option', multiple: 'Multiple choice', expiresAt: 'Expires at',
      vote: 'Vote', voted: 'Voted', totalVotes: 'Total votes',
      closed: 'Closed', closePoll: 'Close poll', noPolls: 'No polls'
    },
    ann: {
      title: 'Announcements', newAnn: 'New announcement', pinned: 'Pinned',
      noAnn: 'No announcements', newAnnToast: 'New announcement', viewAll: 'View all'
    },
    leaderboard: {
      title: 'Leaderboard', worksLikes: 'Top liked works', topAuthors: 'Top authors',
      richest: 'Wealthiest', topExp: 'Top exp',
      rank: 'Rank', author: 'Author', likes: 'Likes'
    }
  };
})(window.Xiao = window.Xiao || {});
