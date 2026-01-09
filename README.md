# Telegram Bot - Message Forwarder

A simple Telegram bot that receives messages from users and forwards them to the bot owner. The owner can manage banned users to prevent unwanted messages.

## Features

- Receives messages from any user
- Forwards messages to the bot owner with user information
- Sends confirmation to user after message is sent
- **Ban/Unban users** - Owner can ban users to prevent them from messaging
- Maintains a list of banned users with their IDs and usernames
- Error handling and logging

## Setup

### Prerequisites

- Node.js (v14 or higher)
- A Telegram bot token (get it from [@BotFather](https://t.me/botfather))
- Your Telegram user ID (get it from [@userinfobot](https://t.me/userinfobot))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/tg-ls-bot.git
cd tg-ls-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
OWNER_ID=your_user_id_here
```

Replace:
- `your_bot_token_here` with your actual bot token from BotFather
- `your_user_id_here` with your actual user ID

### Running the Bot

**Production mode:**
```bash
npm start
```

**Development mode (with auto-restart on file changes):**
```bash
npm run dev
```

## How It Works

1. User sends a message to the bot
2. Bot checks if user is banned
3. If not banned, bot forwards the message to the owner with user details
4. User receives a confirmation that their message was sent
5. Owner can ban users to prevent future messages

## User Commands

- Send any message - Your message will be forwarded to the bot owner
- `/help` - Show available commands

## Owner Commands

- `/ban <user_id>` - Ban a user from using the bot
- `/unban <user_id>` - Unban a user
- `/banned_list` - Show all banned users with their IDs and usernames
- `/help` - Show all available commands

## Message Format

Messages forwarded to the owner include:
- User's name/username
- User's ID
- The message content

Example:
```
📨 New message from john_doe
ID: 123456789

Hello, I need help with something!
```

## Banned Users Storage

Banned users are stored in `banned_users.json` with the following information:
- User ID
- Username
- Ban timestamp

Example:
```json
{
  "123456789": {
    "userId": "123456789",
    "username": "banned_user",
    "bannedAt": "2026-01-09T10:30:45.123Z"
  }
}
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN`: Your bot token from BotFather
- `OWNER_ID`: Your Telegram user ID (numeric)

## Troubleshooting

- **Bot not responding**: Check that your bot token is correct in the `.env` file
- **Messages not forwarding**: Verify that the OWNER_ID is correct and the owner has started a conversation with the bot
- **Ban command not working**: Make sure you're using the correct user ID format (numeric only)
- **Polling errors**: These are usually temporary and the bot will continue running