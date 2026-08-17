// ============================================================================
// Xiao 2.0 · i18n Русский словарь
// ============================================================================
(function (X) {
  X.i18n = X.i18n || {};
  X.i18n.ru = {
    app: { name: 'Xiao · Морская Лиса', tagline: 'Пингвин + Дельфин + Снежная Лиса · STEM сообщество' },
    nav: {
      home: 'Главная', chat: 'Чат', works: 'Работы', editor: 'Редактор',
      social: 'Соцсеть', admin: 'Админ', video: 'Научное видео',
      profile: 'Профиль', redeem: 'Код',
      leaderboard: 'Рейтинг', tasks: 'Задачи', polls: 'Опросы', announcements: 'Объявления'
    },
    common: {
      confirm: 'ОК', cancel: 'Отмена', submit: 'Отправить', save: 'Сохранить',
      delete: 'Удалить', edit: 'Изменить', back: 'Назад', loading: 'Загрузка…',
      empty: 'Нет данных', more: 'Ещё', all: 'Все', search: 'Поиск',
      yes: 'Да', no: 'Нет', open: 'Открыть', close: 'Закрыть'
    },
    auth: {
      login: 'Войти', register: 'Регистрация', logout: 'Выйти',
      username: 'Логин', password: 'Пароль', confirmPwd: 'Повтор пароля',
      phone: 'Телефон', avatar: 'Аватар', remember: 'Запомнить',
      pickAvatar: 'Выбрать аватар', uploadAvatar: 'Загрузить аватар',
      noAccount: 'Нет аккаунта? Регистрация', hasAccount: 'Есть аккаунт? Войти'
    },
    home: {
      hero: 'Добро пожаловать в Xiao',
      intro: 'Xiao — открытое сообщество для исследователей: чат, группы, обмен работами, онлайн-редактор кода.',
      features: 'Возможности',
      feat1: '🐧 Публичный чат + ЛС + группы (Realtime)',
      feat2: '📦 Загрузка работ: paper/folder/code, превью txt/python/js/html/css',
      feat3: '⚡ Встроенный редактор JS/HTML/CSS/Python с совместной работой',
      feat4: '🪙 Монеты Ttpx_A: 10 новых, +0.01 за лайк, -20 за группу',
      feat5: '🛡️ Админ-система: код для временного админа, журнал действий',
      feat6: '🌍 3 языка: 中文 / English / Русский',
      feat7: '🎨 3 темы: Тёмная / Светлая / Киберпанк (сохраняется)',
      feat8: '⌘ Командная палитра: Ctrl/Cmd+K для навигации и действий',
      feat9: '🏆 Рейтинг / 📋 Канбан задачи / 📊 Опросы / 📢 Объявления',
      feat10: '🏅 Уровни и медали / 💬 Био и статус / 🏷 Теги и комментарии',
      feat11: '📱 PWA: установка на рабочий стол, оффлайн-кэш',
      feat12: '🦴 Скелетоны + синхронизация присутствия (Supabase Presence)',
      start: 'Начать →'
    },
    chat: {
      title: 'Публичный чат', placeholder: 'Напишите что-нибудь… (@user ссылка автопереход)',
      send: 'Отправить', online: 'онлайн', msgs: 'сообщ.',
      emoji: 'Эмодзи', muted: 'Вы заглушены', empty: 'Сообщений нет, отправьте первое!',
      recall: 'Отозвать', edit: 'Изменить', reply: 'Ответить',
      pin: 'Закрепить', unpin: 'Открепить',
      recalled: 'Сообщение отозвано', edited: 'изменено',
      pinned: 'Закреплённое сообщение', replyTo: 'Ответ для'
    },
    social: {
      title: 'Соцсеть', myFriends: 'Друзья', addFriend: 'Добавить',
      friendReq: 'Заявки', blocked: 'В блоке', myGroups: 'Группы',
      createGroup: 'Создать группу (-{cost} Ttpx_A)', groupName: 'Название',
      groupMax: 'Лимит', joinReq: 'Вступить', members: 'Участники',
      kick: 'Исключить', muteInGroup: 'Заглушить', shareInGroup: 'Поделиться',
      dm: 'ЛС', block: 'Блок', unblock: 'Разблок', accept: 'Принять',
      reject: 'Отклонить', remove: 'Удалить'
    },
    works: {
      title: 'Работы', upload: 'Загрузить', my: 'Мои работы', all: 'Все',
      pending: 'На модерации', approved: 'Одобрено', name: 'Название',
      desc: 'Описание', category: 'Категория', cat_paper: 'Статья',
      cat_folder: 'Папка', cat_code: 'Код', price: 'Цена (0=бесплатно)',
      free: 'Бесплатно', file: 'Файл', preview: 'Превью', download: 'Скачать',
      like: 'Лайк', likes: 'лайков', requestDl: 'Запросить скачивание',
      approvedDl: 'Скачивание одобрено', needRealname: 'Игровая категория требует верификации',
      realname: 'Верификация', loadMore: 'Ещё', loadAll: 'Все загружены',
      comments: 'Комментарии', comment: 'Комментарий', addComment: 'Написать комментарий…',
      favorite: 'Избранное', favorited: 'В избранном',
      tags: 'Теги', addTag: 'Добавить тег', createTag: 'Создать тег',
      tagName: 'Название тега', tagColor: 'Цвет', myFavorites: 'Моё избранное'
    },
    editor: {
      title: 'Онлайн редактор', lang: 'Язык', run: 'Запустить', clear: 'Очистить',
      js: 'JavaScript', html: 'HTML', css: 'CSS', python: 'Python',
      collab: 'Совместная работа (Realtime)', output: 'Вывод', noOutput: 'Нет вывода',
      pyNotSupported: 'Python требует бэкенд; пока только локальный предпросмотр',
      files: 'Файлы', newFile: 'Новый файл', save: 'Сохранить',
      saveSnippet: 'Сохранить в облако', snippetName: 'Название сниппета', isPublic: 'Публичный',
      mySnippets: 'Мои сниппеты', publicSnippets: 'Публичные сниппеты',
      shareLink: 'Поделиться ссылкой', copied: 'Скопировано', loadSnippet: 'Загрузить сниппет'
    },
    profile: {
      title: 'Профиль', info: 'Информация', myWorks: 'Мои работы',
      myFriends: 'Друзья', myGroups: 'Группы', myBlocked: 'Блок-лист',
      friendReq: 'Заявки в друзья', balance: 'Баланс Ttpx_A', realname: 'Верификация',
      realnameDone: 'верифицирован', realnameNone: 'не верифицирован',
      memberSince: 'С нами с', editAvatar: 'Сменить аватар',
      level: 'Уровень', exp: 'Опыт', nextLevel: 'До следующего уровня',
      myMedals: 'Мои медали', noMedals: 'Медалей нет',
      editBio: 'Изменить описание', editStatus: 'Изменить статус', statusPlaceholder: 'Что нового…'
    },
    admin: {
      title: 'Админ-панель', users: 'Пользователи', works: 'Модерация работ',
      reports: 'Жалобы', logs: 'Журнал', coin: 'Монеты',
      balance: 'Баланс', role: 'Роль', banned: 'Бан', muted: 'Заглушен',
      realname: 'Верификация', banUser: 'Бан', unbanUser: 'Разбан',
      muteUser: 'Заглушить', unmuteUser: 'Вернуть голос', banPerm: 'Перманент',
      banTemp: 'Временный бан', banHours: 'Часы бана',
      adjustCoin: 'Изменить монеты', amount: 'Сумма (+/-)',
      approve: 'Одобрить', reject: 'Отклонить', resolve: 'Решить жалобу',
      reason: 'Причина (обязательно)', action: 'Действие',
      addAdmin: 'Сделать админом', removeAdmin: 'Снять админа',
      target: 'Цель', operator: 'Оператор', time: 'Время',
      dashboard: 'Панель', totalUsers: 'Всего пользователей', totalWorks: 'Всего работ',
      pendingWorks: 'На утверждении', totalMessages: 'Всего сообщений', totalReports: 'Всего жалоб',
      pendingReports: 'В ожидании', last7days: 'Новые за 7 дней',
      newAnnouncement: 'Новое объявление', annTitle: 'Заголовок', annBody: 'Текст', annPinned: 'Закреплено',
      medals: 'Медали', awardMedal: 'Наградить', exportCsv: 'Экспорт CSV',
      searchUser: 'Поиск пользователей…', filterRole: 'Фильтр по роли'
    },
    video: { title: 'Научное видео', dev: 'Функция в разработке', placeholder: '🎬 Скоро будет' },
    misc: { contact: 'Связаться с нами', contactUrl: 'Подписаться на Bilibili' },
    ok: {
      registered: 'Зарегистрированы, авто-вход', loggedIn: 'Вошли',
      loggedOut: 'Вышли', saved: 'Сохранено', deleted: 'Удалено',
      sent: 'Отправлено', approved: 'Одобрено', rejected: 'Отклонено',
      liked: 'Лайк поставлен', unliked: 'Лайк снят', friendAdded: 'Друг добавлен',
      blocked: 'В блоке', unblocked: 'Разблокирован', groupCreated: 'Группа создана',
      joined: 'Заявка отправлена', kicked: 'Исключён', muted: 'Заглушен',
      coinAdjusted: 'Монеты изменены', banSet: 'Бан установлен', muteSet: 'Заглушен'
    },
    err: {
      required: 'Обязательное поле', loginFail: 'Ошибка входа', registerFail: 'Ошибка регистрации',
      passwordMismatch: 'Пароли не совпадают', phoneFormat: 'Неверный телефон',
      userExists: 'Уже существует', noPerm: 'Нет прав', notLoggedIn: 'Войдите',
      notAdmin: 'Не админ', alreadyFriend: 'Уже друзья', alreadyBlocked: 'Уже в блоке',
      notFriend: 'Не друг', coinNotEnough: 'Недостаточно Ttpx_A',
      uploadFail: 'Ошибка загрузки', downloadFail: 'Ошибка скачивания', sendFail: 'Ошибка отправки',
      redeemFail: 'Неверный код', sessionExpired: 'Сессия истекла, войдите снова'
    },
    cmdk: {
      title: 'Палитра команд', placeholder: 'Введите команду или поиск…', empty: 'Нет результатов',
      group_nav: 'Навигация', group_action: 'Действия', group_theme: 'Тема', group_lang: 'Язык'
    },
    theme: { dark: 'Тёмная', light: 'Светлая', cyber: 'Киберпанк', cycled: 'Тема изменена' },
    presence: { online: 'Онлайн', offline: 'Офлайн', justNow: 'Активен только что' },
    tasks: {
      title: 'Задачи', todo: 'Сделать', doing: 'В работе', done: 'Готово',
      newTask: 'Новая задача', taskTitle: 'Заголовок', taskDesc: 'Описание',
      dueDate: 'Срок', assignee: 'Ответственный',
      noTasks: 'Нет задач', moveTask: 'Перетащите'
    },
    polls: {
      title: 'Опросы', newPoll: 'Новый опрос', question: 'Вопрос', options: 'Варианты',
      addOption: 'Добавить вариант', multiple: 'Множественный выбор', expiresAt: 'Истекает',
      vote: 'Голосовать', voted: 'Проголосовано', totalVotes: 'Всего голосов',
      closed: 'Закрыто', closePoll: 'Закрыть опрос', noPolls: 'Нет опросов'
    },
    ann: {
      title: 'Объявления', newAnn: 'Новое объявление', pinned: 'Закреплено',
      noAnn: 'Нет объявлений', newAnnToast: 'Новое объявление', viewAll: 'Смотреть все'
    },
    leaderboard: {
      title: 'Рейтинг', worksLikes: 'Топ работ по лайкам', topAuthors: 'Топ авторов',
      richest: 'Топ по балансу', topExp: 'Топ по опыту',
      rank: 'Место', author: 'Автор', likes: 'Лайки'
    }
  };
})(window.Xiao = window.Xiao || {});
