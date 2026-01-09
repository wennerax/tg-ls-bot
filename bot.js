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
    bot.sendMessage(targetUserId, `📧 <b>Reply from bot owner:</b>\n\n${messageText}`, { parse_mode: 'HTML' })
      .then(() => {
        bot.sendMessage(chatId, `✅ Reply sent to user ${targetUserId}`);
        console.log(`Owner sent reply to user ${targetUserId}: ${messageText}`);
      })
      .catch((error) => {
        console.error('Error sending reply to user:', error);
        bot.sendMessage(chatId, `❌ Failed to send reply to user ${targetUserId}`);
        replyStates[userId] = targetUserId; // Restore state
      });
    return;
  }

  // Check if user is banned
  if (bannedUsers[userId]) {
    bot.sendMessage(chatId, '🚫 You have been banned from using this bot.');
    console.log(`Blocked message from banned user ${userName} (ID: ${userId})`);
    return;
  }

  console.log(`Message from ${userName} (ID: ${userId}): ${messageText}`);

  // Forward message to bot owner with reply button
  const forwardedText = `📨 <b>New message from ${userName}</b>\n<code>ID: ${userId}</code>\n\n${messageText}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '💬 Reply',
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
      bot.sendMessage(chatId, '✅ Your message has been sent to the bot owner!');
    })
    .catch((error) => {
      console.error('Error forwarding message:', error);
      bot.sendMessage(chatId, '❌ Failed to send your message. Please try again later.');
    });
});

// Handle callback queries (reply button clicks)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const callbackData = query.data;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.answerCallbackQuery(query.id, '❌ You do not have permission to use this.', true);
    return;
  }

  if (callbackData.startsWith('reply_')) {
    const targetUserId = callbackData.replace('reply_', '');
    replyStates[userId] = targetUserId;

    bot.answerCallbackQuery(query.id, '✅ Please send your reply message now', false);
    bot.sendMessage(chatId, `📝 Please type your reply to user ${targetUserId}. Send /cancel to cancel.`);
    console.log(`Owner started replying to user ${targetUserId}`);
  }
});

// Handle /cancel command to cancel reply
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ You do not have permission to use this command.');
    return;
  }

  if (replyStates[userId]) {
    delete replyStates[userId];
    bot.sendMessage(chatId, '❌ Reply cancelled.');
    console.log(`Owner cancelled reply`);
  } else {
    bot.sendMessage(chatId, 'ℹ️ No active reply.');
  }
});

// Handle /ban command (owner only)
bot.onText(/\/ban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ You do not have permission to use this command.');
    return;
  }

  // Check if user is already banned
  if (bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ User ${targetUserId} is already banned.`);
    return;
  }

  // Ban the user
  bannedUsers[targetUserId] = {
    userId: targetUserId,
    username: msg.text.split(' ')[2] || 'Unknown',
    bannedAt: new Date().toISOString()
  };

  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ User ${targetUserId} has been banned.`);
  console.log(`User ${targetUserId} has been banned by owner`);
});

// Handle /unban command (owner only)
bot.onText(/\/unban (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const targetUserId = match[1];

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ You do not have permission to use this command.');
    return;
  }

  // Check if user is banned
  if (!bannedUsers[targetUserId]) {
    bot.sendMessage(chatId, `ℹ️ User ${targetUserId} is not banned.`);
    return;
  }

  // Unban the user
  delete bannedUsers[targetUserId];
  saveBannedUsers(bannedUsers);

  bot.sendMessage(chatId, `✅ User ${targetUserId} has been unbanned.`);
  console.log(`User ${targetUserId} has been unbanned by owner`);
});

// Handle /banned_list command (owner only)
bot.onText(/\/banned_list/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Check if user is owner
  if (userId.toString() !== ownerID.toString()) {
    bot.sendMessage(chatId, '❌ You do not have permission to use this command.');
    return;
  }

  if (Object.keys(bannedUsers).length === 0) {
    bot.sendMessage(chatId, '📋 No banned users.');
    return;
  }

  let listText = '📋 <b>Banned Users:</b>\n\n';
  for (const [userId, userInfo] of Object.entries(bannedUsers)) {
    listText += `<code>${userId}</code> - @${userInfo.username} (Banned: ${new Date(userInfo.bannedAt).toLocaleString()})\n`;
  }

  bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isOwner = userId.toString() === ownerID.toString();

  let helpText = '🤖 <b>Bot Commands:</b>\n\n';
  helpText += 'Send any message and it will be forwarded to the bot owner.\n';

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
