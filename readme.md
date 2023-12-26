# Discord iStory Bot

## Introduction
<img src="https://repository-images.githubusercontent.com/735084119/61349758-9c88-4065-8634-4f7b469a1331" alt="Discord iStory">
Discord iStory Bot is a chatbot implemented in Node.js using the Discord.js library. The bot leverages OpenAI Compatible APIs for natural language processing and MySQL for data storage. The primary purpose of this bot is to generate stories that users can interact with. This is specifically meant for solo play, though with a few adjustments, it could be used as a group play. 

## Features

- **Chat Interaction**: Engage in conversations with users and generate responses using OpenAI's language model.
- **Message History**: Store and retrieve user messages to maintain conversation history.
- **Summarization**: Summarize chat transcripts into a coherent story.
- **Database Integration**: Utilize MySQL to persistently store messages and summaries.

## Installation

1. Clone the repository: `git clone https://github.com/arshem/discord-istory.git`
2. Install dependencies: `npm install`
3. Create a `.env` file in the project root and configure the following variables:

   ```env
   DISCORD_TOKEN="your_discord_bot_token"
   DISCORD_PREFIX="your_bot_command_prefix"
   DISCORD_BOTNAME="your_bot_name"
   DISCORD_BOT_ID="your_bot_id"

   AI_API_KEY="your_openai_api_key"
   AI_MODEL="your_openai_model"
   AI_URL="your_openai_base_url"
   AI_PERSONALITY="your_openai_personality"
   AI_TEMP="your_openai_temperature"
   AI_TOKENS="your_openai_max_tokens"
   AI_SUMMARY_PREFIX="your_prefix_for_summaries"

   DB_HOST="your_database_host"
   DB_USER="your_database_username"
   DB_NAME="your_database_name"
   DB_PASS="your_database_password"  
   ```

   Replace the placeholders with your actual values.

4. Set up a MySQL database and update the `.env` file with the database connection details.

```
CREATE TABLE `messages` (
  `messageId` varchar(254) COLLATE utf8mb4_general_ci NOT NULL,
  `summaryId` bigint DEFAULT NULL,
  `content` text COLLATE utf8mb4_general_ci NOT NULL,
  `userId` varchar(254) COLLATE utf8mb4_general_ci NOT NULL,
  `reply_to` varchar(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_on` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `summary` (
  `summaryId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `summary` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_on` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_on` timestamp NOT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `messages`
  ADD PRIMARY KEY (`messageId`),
  ADD KEY `created_on` (`created_on`),
  ADD KEY `userId` (`userId`),
  ADD KEY `reply_to` (`reply_to`);


ALTER TABLE `summary`
  ADD PRIMARY KEY (`summaryId`),
  ADD UNIQUE KEY `userId` (`userId`),
  ADD KEY `created_on` (`created_on`);
ALTER TABLE `summary` ADD FULLTEXT KEY `summary` (`summary`);

ALTER TABLE `summary`
  MODIFY `summaryId` bigint NOT NULL AUTO_INCREMENT;
```

## Usage

Run the bot using the following command:

```bash
node Barkeep/index.js
```

The bot will then connect to Discord and respond to messages based on the implemented logic.

## Commands

- **Barkeep**: Start a conversation with the bot by mentioning its name, it will create a thread for you to continue your adventure.
- **!summary**: Fetch a summary of your chat history. This is to allow you to see your own summary progress, and see what the bot sees as your story so far.

## Database Schema

The bot uses MySQL to store messages and summaries. The database schema includes tables for messages and summaries.

## Contributors

- [Arshem Web Solutions](https://github.com/arshem) - I created this bot to play in my discord roleplaying channels. 

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- The Discord.js library
- OpenAI for their powerful language model & libraries
- MySQL for database storage