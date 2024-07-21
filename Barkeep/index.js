// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const mysql = require('mysql2');

dotenv.config({path: './Barkeep/.env'});

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// List of activities to display
const activities = ['Going on an adventure', 'Listening to the bard', 'Taking orders in the Tavern', 'Serving drinks at the bar'];

// Function to set a random activity
function setRandomActivity() {
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    client.user.setActivity(randomActivity, { type: 'WATCHING' });
}

// Set an initial random activity when the bot is ready
client.on('ready', () => {
    setRandomActivity();

    // Update the activity every 5 hours
    setInterval(() => {
        setRandomActivity();
    }, 5 * 60 * 60 * 1000); // 5 hours in milliseconds
});

// Map to track which bot created which thread
const threadBotMap = new Map();

client.on('messageCreate', async (message) => {
    const threadID = message.channel.id;

    // Ignore messages from bots
    if (message.author.bot) return;

    const thread = message.channel.name;

    if (threadBotMap.has(threadID) && threadBotMap.get(threadID) !== client.user.id) {
        // If the thread is created by another bot, ignore the message
        return;
    }

    if (
        thread.includes(message.author.displayName)
        && message.content.toLowerCase() !== "!summary"
        && !message.content.toLowerCase().startsWith(process.env.DISCORD_PREFIX)
        && message.content.toLowerCase() !== "!github"
    ) {
        // A reply to a bot message 
        try {
            const openai = new OpenAI({
                apiKey: process.env.AI_API_KEY,
                baseURL: process.env.AI_URL
            });

            let aiMessage = [
                {
                    'role': 'system',
                    'content': process.env.AI_PERSONALITY
                }
            ];

            let summary = await fetchHistoryByConv(message.author.id);
            aiMessage.push({
                'role': 'assistant',
                'content': 'Summary so far: ' + summary.newSummary
            });

            aiMessage.push({
                "role": "assistant",
                "content": summary.history
            });

            aiMessage.push({
                'role': 'user',
                'content': message.content
            });

            insertMessage(message.id, message.author.id, message.content);

            doSummarize(summary.history, message.author.id);

            const reply = await openai.chat.completions.create({
                model: process.env.AI_MODEL,
                messages: aiMessage,
                max_tokens: parseInt(process.env.AI_TOKENS, 10)
            });

            let out = reply.choices[0]?.message?.content;
            const messageChunks = out.match(/[\s\S]{1,2000}/g);

            for (const chunk of messageChunks) {
                await message.reply(chunk).then(sent => {
                    insertReply(sent.id, sent.author.id, message.author.id, chunk);
                });
            }
        } catch (error) {
            console.error("Error " + error.message);
        }
    } else if (message.content.toLowerCase().startsWith(process.env.DISCORD_PREFIX)) {
        try {
            purgeUser(message.author.id);

            const openai = new OpenAI({
                apiKey: process.env.AI_API_KEY,
                baseURL: process.env.AI_URL
            });

            insertMessage(message.id, message.author.id, message.content);

            let aiMessage = [
                {
                    'role': 'system',
                    'content': process.env.AI_PERSONALITY
                },
                {
                    'role': 'user',
                    'content': message.content
                }
            ];

            const reply = await openai.chat.completions.create({
                model: process.env.AI_MODEL,
                messages: aiMessage,
                max_tokens: parseInt(process.env.AI_TOKENS, 10)
            });

            const thread = await message.startThread({
                name: message.author.displayName + " Adventure",
                reason: "Solo Adventure"
            });

            await thread.members.add(message.author.id);
            await thread.members.add(process.env.DISCORD_BOT_ID);

            // Store the thread ID and bot ID
            threadBotMap.set(thread.id, client.user.id);

            const messageChunks = reply.choices[0]?.message?.content.match(/[\s\S]{1,2000}/g);

            for (const chunk of messageChunks) {
                await thread.send(chunk).then(sent => {
                    insertReply(sent.id, sent.author.id, message.author.id, chunk);
                });
            }
        } catch (error) {
            console.error("Error " + error.message);
        }
    } else if (message.content.toLowerCase().startsWith("!summary")) {
        try {
            const summation = await fetchSummary(message.author.id);
            const messageChunks = summation.match(/[\s\S]{1,2000}/g);

            for (const chunk of messageChunks) {
                message.channel.send(chunk);
            }
        } catch (error) {
            console.error(error);
        }
    } else if (message.content.toLowerCase().startsWith("!github")) {
        try {
            message.channel.send("Get your own bot here: https://github.com/arshem/discord-istory");
        } catch (error) {
            console.error(error);
        }
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function fetchHistoryByConv(userId) {
    let newSummary = '';
    try {
        const [rows] = await pool.promise().query('SELECT * FROM messages WHERE (userId=? OR reply_to=?) AND deleted=0 ORDER BY created_on ASC', [userId, userId]);

        let summary = '';
        for (const row of rows) {
            let message = JSON.parse(JSON.stringify(row));
            if (message.userId === process.env.DISCORD_BOT_ID) {
                summary += 'Assistant: ' + message.content + '\n';
            } else {
                summary += 'User: ' + message.content + '\n';
            }
        }

        if (rows.length > 5) {
            newSummary = await doSummarize(summary, userId);
        } else {
            newSummary = await fetchSummary(userId);
        }

        return { "newSummary": newSummary, "history": summary };
    } catch (error) {
        console.error('Error fetching history:', error);
    }
}

// Function to insert a new message
async function insertMessage(messageId, userId, content) {
    const [result] = await pool
        .promise()
        .query('INSERT INTO messages (messageId, userId, content) VALUES (?, ?, ?)', [messageId, userId, content]);

    return true;
}

// Function to insert a new message
async function insertReply(messageId, userId, replyTo, content) {
    if (content === null || content === undefined) {
        console.error("Content cannot be null or undefined");
        return false;
    }
    const [result] = await pool
        .promise()
        .query('INSERT INTO messages (messageId, userId, reply_to, content) VALUES (?, ?, ?, ?)', [messageId, userId, replyTo, content]);

    return true;
}

function purgeUser(userId) {
    try {
        pool
            .query('UPDATE messages SET deleted=1 WHERE userId = ? OR reply_to=?', [userId, userId]);
    } catch (e) {
        console.error(e);
    }
    try {
        pool
            .query("INSERT INTO summary (userId, summary) VALUES (?, ?)", [userId, "N/A"]);
    } catch (e) {
        console.error(e);
    }
    try {
        pool.query("UPDATE summary SET summary = ? WHERE userId = ?", ["N/A", userId]);
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function doSummarize(messages, userId) {
    try {
        let row = await fetchSummary(userId);

        if (row) {
            const summary = row;
            let message = "";
            if (summary !== null && summary !== "") {
                message = "Here is the old story summary: \n\n" + summary + "\n\n Here is additional pieces to the story: " + messages + " Be sure to include all important information, like names, places, achievements, quests, etc.";
            } else if (row.length === 0) {
                messages = fetchHistoryByConv(userId);
                message = "Summarize:\n " + messages;
            } else {
                console.error('Unexpected result: Multiple summaries found for userId:', userId);
            }
            const openai = new OpenAI({
                apiKey: process.env.AI_API_KEY,
                baseURL: process.env.AI_URL
            });

            let aiMessage = [
                {
                    'role': 'system',
                    'content': process.env.AI_SUMMARY_PREFIX
                },
                {
                    'role': 'user',
                    'content': message
                }
            ];

            const reply = await openai.chat.completions.create({
                model: process.env.AI_SUMMARY_MODEL,
                messages: aiMessage,
                max_tokens: parseInt(process.env.AI_TOKENS, 10)
            });

            const newSummary = reply.choices[0]?.message?.content;

            await pool.promise().query("UPDATE summary SET summary=? WHERE userId=?", [newSummary, userId]);
            await pool.promise().query('UPDATE messages SET deleted=1 WHERE userId = ? OR reply_to=?', [userId, userId]);

            return newSummary;
        } else {
            console.error('No Summary Record Found');
        }
    } catch (error) {
        console.error('Error fetching summary:', error);
    }
}

async function fetchSummary(userId) {
    try {
        let summary = '';
        await pool.promise().query("SELECT summary FROM summary WHERE userId=?", [userId])
            .then(row => {
                summary = JSON.parse(JSON.stringify(row));
            });
        return summary[0][0].summary;
    } catch (e) {
        console.error(e);
        pool.query("INSERT INTO summary (userId, summary) VALUES (?, ?)", [userId, "N/A"]);
        fetchSummary(userId);
    }
}
