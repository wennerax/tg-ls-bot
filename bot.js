require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Get bot token and owner ID from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerID = process.env.OWNER_ID;

if (!token || !ownerID) {
  console.error('Error: TELEGRAM_BOT_TOKEN and OWNER_ID environment variables are required');
  process.exit(1);
}

// Banned users database file
const bannedUsersFile = path.join(__dirname, 'banned_users.json');

// Load banned users from file
function loadBannedUsers() {
  try {
    if (fs.existsSync(bannedUsersFile)) {
      const data = fs.readFileSync(bannedUsersFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading banned users:', error);
  }
  return {};
}

// Save banned users to file
function saveBannedUsers(bannedUsers) {
  try {
    fs.writeFileSync(bannedUsersFile, JSON.stringify(bannedUsers, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving banned users:', error);
  }
}

// Load banned users at startup
let bannedUsers = loadBannedUsers();

// Track reply states - which user is the owner currently replying to
const replyStates = {};

// Create bot instance with polling
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');
console.log(`Banned users loaded: ${Object.keys(bannedUsers).length}`);

// Handle incoming messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.username || msg.from.first_name || 'Unknown';
  const messageText = msg.text || '';

  // Check if this is a reply from the owner
  if (userId.toString() === ownerID.toString() && replyStates[userId]) {
    const targetUserId = replyStates[userId];
    delete replyStates[userId];

    // Send reply to the user
    bot.sendMessage(targetUserId, `📧 <b>Ответ от владельца:</b>\n\n${messageText}`, { parse_mode: 'HTML' })
      .then(() => {
        bot.sendMessage(chatId, `✅ Ответ отправлен пользователю ${targetUserId}`);
        console.log(`Owner sent reply to user ${targetUserId}: ${messageText}`);
      })
      .catch((error) => {
        console.error('Ошибка при отправке ответа пользователю:', error);
        bot.sendMessage(chatId, `❌ Не удалось отправить ответ пользователю ${targetUserId}`);
        replyStates[userId] = targetUserId; // Restore state
      });
    return;
  }

  // Check if user is banned
  if (bannedUsers[userId]) {
    bot.sendMessage(chatId, '🚫 Вам забанили использование этого бота.');
    console.log(`Blocked message from banned user ${userName} (ID: ${userId})`);
    return;
  }

  console.log(`Message from ${userName} (ID: ${userId}): ${messageText}`);

  // Forward message to bot owner with reply button
  const forwardedText = `📨 <b>Новое сообщение от ${userName}</b>\n<code>ID: ${userId}</code>\n\n${messageText}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '💬 Ответ',
          callback_data: `reply_${userId}`
        }
      ]
    ]
  };

  bot.sendMessage(ownerID, forwardedText, { 
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  })
    .then(() => {
      // Send confirmation to user
      bot.sendMessage(chatId, '✅ Ваше сообщение отправлено!');
    })
    .catch((error) => {
      console.error('Error forwarding message:', error);
      bot.sendMessage(chatId, '❌ Не смог отправить сообщение. Пожалуйста, попробуйте позже.');
    });
});

// Handle callback queries (reply button clicks)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const callbackData = query.data;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.answerCallbackQuery(query.id, '❌ У тебя нет разрешения использовать это.', true);
    return;
  }

  if (callbackData.startsWith('reply_')) {
    const targetUserId = callbackData.replace('reply_', '');
    replyStates[userId] = targetUserId;

    bot.answerCallbackQuery(query.id, '✅ Пожалуйста, отправьте ответ прямо сейчас', false);
    bot.sendMessage(chatId, `📝 Пожалуйста, напишите свой ответ пользователю ${targetUserId}. Отправить /cancel для отмены.`);
    console.log(`Владелец начал отвечать пользователю ${targetUserId}`);
  }
});

// Handle /cancel command to cancel reply
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет разрешения использовать эту команду.');
    return;
  }

  if (replyStates[userId]) {
    delete replyStates[userId];
    bot.sendMessage(chatId, '❌ Ответ отменён.');
    console.log(`Владелец отменил ответ`);
  } else {
    bot.sendMessage(chatId, 'ℹ️ Активного ответа нет.');
  }
});

// Handle /ban command (owner only)
bot.onText(/\/ban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет разрешения использовать эту команду
    return;
  }

  // Check if user is already banned
  if (bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ Пользователю ${targetUserId} уже запрещено.`);
    return;
  }

  // Ban the user
  bannedUsers[targetUserId] = {
    userId: targetUserId,
    username: msg.text.split(' ')[2] || 'Unknown',
    bannedAt: new Date().toISOString()
  };

  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ Пользователю ${targetUserId} успешно запрещено писать.`);
  console.log(`Пользователь ${targetUserId} был забанен владельцем`);
});

// Handle /unban command (owner only)
bot.onText(/\/unban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет разрешения использовать эту команду.');
    return;
  }

  // Check if user is banned
  if (!bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ Пользователь ${targetUserId} не забанен.`);
    return;
  }

  // Unban the user
  delete bannedUsers[targetUserId];
  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ Пользователь ${targetUserId} был разблокирован.`);
  console.log(`Пользователь ${targetUserId} был снят с блокировки владельцем`);
});

// Handle /banned_list command (owner only)
bot.onText(/\/banned_list/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ У вас нет разрешения использовать эту команду.');
    return;
  }

  if (Object.keys(bannedUsers).length === 0) {
    bot.sendMessage(chatId, '📋 Забаненных пользователей нет.');
    return;
  }

  let listText = '📋 <b>Заблокированные пользователи:</b>\n\n';
  for (const [userId, userInfo] of Object.entries(bannedUsers)) {
    listText += `<code>${userId}</code> - @${userInfo.username} (Забаненые: ${new Date(userInfo.bannedAt).toLocaleString()})\n`;
  }

  bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isOwner = userId.toString() === ownerID.toString();

  let helpText = '🤖 <bКоманды бота:</b>\n\n';
  helpText += 'Отправьте любое сообщение, и оно будет переадресовано владельцу бота.\n';

  if (isOwner) {
    helpText += '\n<b>Owner Commands:</b>\n';
    helpText += '💬 Click "Reply" button on any message to reply to that user\n';
    helpText += '/ban <user_id> - Ban a user\n';
    helpText += '/unban <user_id> - Unban a user\n';
    helpText += '/banned_list - Show all banned users\n';
    helpText += '/cancel - Cancel current reply\n';
    helpText += '/help - Show this message\n';
  }

  bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

process.on('SIGINT', () => {
  console.log('Bot stopped');
  process.exit(0);
});
