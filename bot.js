require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Конфигурация
const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  ownerID: process.env.OWNER_ID,
  bannedUsersFile: path.join(__dirname, 'banned_users.json'),
  spamThreshold: 5,
  spamTimeWindow: 10,
  maxMessageLength: 1000
};

// Проверка конфигурации
if (!config.token || !config.ownerID) {
  console.error('Ошибка: Требуются переменные окружения TELEGRAM_BOT_TOKEN и OWNER_ID');
  process.exit(1);
}

// Загрузка заблокированных пользователей из файла
function loadBannedUsers() {
  try {
    if (fs.existsSync(config.bannedUsersFile)) {
      const data = fs.readFileSync(config.bannedUsersFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Ошибка при загрузке заблокированных пользователей:', error);
  }
  return {};
}

// Сохранение заблокированных пользователей в файл
function saveBannedUsers(bannedUsers) {
  try {
    fs.writeFileSync(config.bannedUsersFile, JSON.stringify(bannedUsers, null, 2), 'utf-8');
  } catch (error) {
    console.error('Ошибка при сохранении заблокированных пользователей:', error);
  }
}

// Загрузка заблокированных пользователей при запуске
let bannedUsers = loadBannedUsers();

// Отслеживание состояний ответов — кому сейчас отвечает владелец
const replyStates = {};

// История сообщений пользователей для обнаружения спама
const userMessageHistory = {};
const SPAM_THRESHOLD = config.spamThreshold;
const SPAM_TIME_WINDOW = config.spamTimeWindow;
const MAX_MESSAGE_LENGTH = config.maxMessageLength;

// Создание экземпляра бота с опросом
const bot = new TelegramBot(config.token, { polling: true });

console.log('Бот запущен...');
console.log(`Заблокированные пользователи: ${Object.keys(bannedUsers).length}`);

// Вспомогательная функция для проверки спама
function isSpam(userId) {
  const now = Date.now();
  if (!userMessageHistory[userId]) {
    userMessageHistory[userId] = [];
  }

  // Удаление старых сообщений за пределами временного окна
  userMessageHistory[userId] = userMessageHistory[userId].filter(
    (timestamp) => now - timestamp < SPAM_TIME_WINDOW * 1000
  );

  // Добавление текущего сообщения
  userMessageHistory[userId].push(now);

  // Проверка превышения порога спама
  return userMessageHistory[userId].length > SPAM_THRESHOLD;
}

// Вспомогательная функция для определения, является ли сообщение командой
function isCommandMessage(msg) {
  try {
    if (!msg || !msg.text) return false;
    if (typeof msg.text === 'string' && msg.text.trim().startsWith('/')) return true;
    if (Array.isArray(msg.entities)) {
      return msg.entities.some((ent) => ent.type === 'bot_command');
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const startMessage = `
🚧 **Внимание!** 🚧

Это личный аккаунт. Не спамьте! 🚫  
Избыточные сообщения — блокировка.

📌 Соблюдайте правила и наслаждайтесь ботом! 💬
  `;
  bot.sendMessage(chatId, startMessage, { parse_mode: 'Markdown' });
});

// Обработка входящих сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.username || msg.from.first_name || 'Неизвестно';
  const messageText = msg.text || '';
  // Игнорировать команды — они обрабатываются отдельными обработчиками
  if (isCommandMessage(msg)) {
    return;
  }

  // Проверка, является ли это ответом владельца (только для не-командных сообщений)
  if (userId.toString() === config.ownerID.toString() && replyStates[userId]) {
    const targetUserId = replyStates[userId];
    delete replyStates[userId];

    // Отправка ответа пользователю
    bot.sendMessage(targetUserId, `📧 <b>Ответ от владельца бота:</b>\n\n${messageText}`, { parse_mode: 'HTML' })
      .then(() => {
        bot.sendMessage(chatId, `✅ Ответ отправлен пользователю ${targetUserId}`);
        console.log(`Владелец отправил ответ пользователю ${targetUserId}: ${messageText}`);
      })
      .catch((error) => {
        console.error('Ошибка при отправке ответа пользователю:', error);
        bot.sendMessage(chatId, `❌ Не удалось отправить ответ пользователю ${targetUserId}`);
        replyStates[userId] = targetUserId; // Восстановить состояние
      });
    return;
  }

  // Проверка, заблокирован ли пользователь
  if (bannedUsers[userId]) {
    bot.sendMessage(chatId, '🚫 Вы заблокированы и не можете использовать этого бота.');
    console.log(`Сообщение от заблокированного пользователя ${userName} (ID: ${userId})`);
    return;
  }

  // Проверка на спам
  if (isSpam(userId)) {
    // Автоматическая блокировка спамера
    bannedUsers[userId] = {
      userId: userId,
      username: userName,
      bannedAt: new Date().toISOString(),
      reason: 'Автоматическая блокировка за спам'
    };
    saveBannedUsers(bannedUsers);
    
    bot.sendMessage(chatId, '🚫 <b>Вы автоматически заблокированы за спам!</b>\n\nЕсли вы считаете, что это ошибка, свяжитесь с владельцем бота.', { parse_mode: 'HTML' });
    bot.sendMessage(config.ownerID, `🚨 <b>Обнаружен спам:</b>\n\nПользователь <code>${userName}</code> (ID: <code>${userId}</code>) автоматически заблокирован за отправку ${SPAM_THRESHOLD + 1} сообщений за ${SPAM_TIME_WINDOW} секунд.`, { parse_mode: 'HTML' });
    
    console.log(`Пользователь ${userName} (ID: ${userId}) автоматически заблокирован за спам`);
    delete userMessageHistory[userId];
    return;
  }

  console.log(`Сообщение от ${userName} (ID: ${userId}): ${messageText}`);

  // Пересылка сообщения владельцу бота с кнопкой ответа
  const forwardedText = `📨 <b>Новое сообщение от ${userName}</b>\n<code>ID: ${userId}</code>\n\n${messageText}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '💬 Ответить',
          callback_data: `reply_${userId}`
        }
      ]
    ]
  };

  bot.sendMessage(config.ownerID, forwardedText, { 
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  })
    .then(() => {
      // Подтверждение пользователю
      bot.sendMessage(chatId, '✅ Ваше сообщение отправлено владельцу бота!');
    })
    .catch((error) => {
      console.error('Ошибка при пересылке сообщения:', error);
      bot.sendMessage(chatId, '❌ Не удалось отправить ваше сообщение. Попробуйте позже.');
    });
});

// Обработка кнопок (нажатий на кнопку "Ответить")
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const callbackData = query.data;

  // Проверка, является ли пользователь владельцем
  if (userId.toString() !== config.ownerID.toString()) {
    bot.answerCallbackQuery(query.id, '❌ У вас нет прав для этого.', true);
    return;
  }

  if (callbackData.startsWith('reply_')) {
    const targetUserId = callbackData.replace('reply_', '');
    replyStates[userId] = targetUserId;

    bot.answerCallbackQuery(query.id, '✅ Теперь напишите ваш ответ', false);
    bot.sendMessage(chatId, `📝 Введите ваш ответ пользователю ${targetUserId}. Отправьте /cancel для отмены.`);
    console.log(`Владелец начал отвечать пользователю ${targetUserId}`);
  }
});

// Обработка команды /cancel для отмены ответа
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка, является ли пользователь владельцем
  if (userId.toString() !== config.ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет прав для этого.');
    return;
  }

  if (replyStates[userId]) {
    delete replyStates[userId];
    bot.sendMessage(chatId, '❌ Ответ отменен.');
    console.log(`Владелец отменил ответ`);
  } else {
    bot.sendMessage(chatId, 'ℹ️ Нет активного ответа.');
  }
});

// Обработка команды /ban (только для владельца)
bot.onText(/\/ban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Проверка, является ли пользователь владельцем
  if (userId.toString() !== config.ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет прав для этого.');
    return;
  }

  // Проверка, уже заблокирован ли пользователь
  if (bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ Пользователь ${targetUserId} уже заблокирован.`);
    return;
  }

  // Блокировка пользователя
  bannedUsers[targetUserId] = {
    userId: targetUserId,
    username: msg.text.split(' ')[2] || 'Неизвестно',
    bannedAt: new Date().toISOString()
  };

  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ Пользователь ${targetUserId} заблокирован.`);
  console.log(`Пользователь ${targetUserId} заблокирован владельцем`);
});

// Обработка команды /unban (разблокировка)
bot.onText(/\/unban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Проверка, является ли пользователь владельцем
  if (userId.toString() !== config.ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет прав для этого.');
    return;
  }

  // Проверка, заблокирован ли пользователь
  if (!bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ Пользователь ${targetUserId} не заблокирован.`);
    return;
  }

  // Разблокировка пользователя
  delete bannedUsers[targetUserId];
  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ Пользователь ${targetUserId} разблокирован.`);
  console.log(`Пользователь ${targetUserId} разблокирован владельцем`);
});

// Обработка команды /banned_list
bot.onText(/\/banned_list/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка, является ли пользователь владельцем
  if (userId.toString() !== config.ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет прав для этого.');
    return;
  }

  if (Object.keys(bannedUsers).length === 0) {
    bot.sendMessage(chatId, '📋 Заблокированных пользователей нет.');
    return;
  }

  let listText = '📋 <b>Заблокированные пользователи:</b>\n\n';
  for (const [userId, userInfo] of Object.entries(bannedUsers)) {
    listText += `<code>${userId}</code> - @${userInfo.username} (Заблокирован: ${new Date(userInfo.bannedAt).toLocaleString()})\n`;
  }

  bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
});

// Обработка команды /help
bot.onText(/^\/help(?:@[\w_]+)?(?:\s.*)?$/i, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isOwner = userId.toString() === config.ownerID.toString();

  let helpText = '🤖 <b>Команды бота:</b>\n\n';
  helpText += 'Отправьте любое сообщение, и оно будет переслано владельцу бота.\n';

  if (isOwner) {
    helpText += '\n<b>Команды владельца:</b>\n';
    helpText += '💬 Нажмите кнопку "Ответить" к любому сообщению, чтобы ответить пользователю\n';
    helpText += '/ban <user_id> - Заблокировать пользователя\n';
    helpText += '/unban <user_id> - Разблокировать пользователя\n';
    helpText += '/banned_list - Показать всех заблокированных пользователей\n';
    helpText += '/cancel - Отменить текущий ответ\n';
    helpText += '/help - Показать это сообщение\n';
  }

  bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка опроса:', error);
});

process.on('SIGINT', () => {
  console.log('Бот остановлен');
  process.exit(0);
});
