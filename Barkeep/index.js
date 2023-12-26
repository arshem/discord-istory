// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, ThreadManager } = require('discord.js');
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
//const thread = new ThreadsAPI;

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});


client.on('messageCreate', async (message) => {

    const threadID = message.channel.id;
    // threadID = the channel ID, not necessarily just a thread message. Need to be careful here

    // Ignore messages from bots
    if (message.author.bot) return;
    const thread = message.channel.name
    if (

        // check to see if the message.author.displayName is in the thread variable. This only works because we're using the displayName as part of the thread name
        thread.includes(message.author.displayName)
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
            }]

            let summary = await fetchHistoryByConv(message.author.id);
            //("FetchHistory Summary: ", JSON.stringify(summary))
            aiMessage.push({
                'role' : 'assistant',
                'content' : 'Summary so far: '+summary.newSummary
            });

            aiMessage.push({
                "role" : "assistant",
                "content" : summary.history
            })

            aiMessage.push({
                'role': 'user',
                'content': message.content
            })

            //("AI Message Array: ", aiMessage);
            insertMessage(message.id, message.author.id, message.content) 

            //console.log("Reach to AI");

            const reply = await openai.chat.completions.create({
                model: process.env.AI_MODEL,
                messages: aiMessage,
                temperature: process.env.AI_TEMP,
                max_tokens: process.env.AI_TOKENS
            });
            //console.log("AI responded");
            let out = reply.choices[0]?.message?.content
         
            const messageChunks = out.match(/[\s\S]{1,2000}/g);

            // Send each chunk as a separate message
            for (const chunk of messageChunks) {
                await message.reply(chunk).then(sent => {
                    insertReply(sent.id, sent.author.id, message.author.id, chunk ) 
                });
            }
            
        } catch (error) {
            console.error("Error " + error.message);
        }
    } else if (message.content.toLowerCase().startsWith(process.env.DISCORD_PREFIX)) {
        // a message that begins with Barkeep
        try {
            
            purgeUser(message.author.id);

            const openai = new OpenAI({
                apiKey: process.env.AI_API_KEY,
                baseURL: process.env.AI_URL
            });
            insertMessage(message.id, message.author.id, message.content) 

            let aiMessage = [
                {
                    'role' : 'system',
                    'content' : process.env.AI_PERSONALITY
                },
                {
                    'role' : 'user',
                    'content': message.content
                }
            ]   
            const reply = await openai.chat.completions.create({
                model: process.env.AI_MODEL,
                messages: aiMessage,
                temperature: process.env.AI_TEMP,
                max_tokens: process.env.AI_TOKENS
            });

            const thread = await message.startThread({
                name: message.author.displayName+" Adventure",
                reason: "Solo Adventure"
            });
            await thread.members.add(message.author.id);
            await thread.members.add(process.env.DISCORD_BOT_ID);

            const messageChunks = reply.choices[0]?.message?.content.match(/[\s\S]{1,2000}/g);

            // Send each chunk as a separate message
            for (const chunk of messageChunks) {
                await thread.send(chunk).attachments(sent => {
                    insertReply(sent.id, sent.author.id, message.author.id, chunk ) 
                });
            }
            
        } catch(error) {
            console.error("Error "+error.message);
        }

    } else if (message.content.toLowerCase().startsWith("!summary")) {
        try {
            const summation = await fetchSummary(message.author.id);
            // Split the long message into chunks of 2000 characters
            const messageChunks = summation.match(/[\s\S]{1,2000}/g);

            // Send each chunk as a separate message
            for (const chunk of messageChunks) {
                message.channel.send(chunk);
            }
        } catch(error) {
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
        //console.log("fetchhistorybyconvo");
        let newSummary = '';
        try {
            const [rows] = await pool.promise().query('SELECT * FROM messages WHERE (userId=? OR reply_to=?) AND deleted=0 ORDER BY created_on ASC LIMIT 10', [userId, userId]);
        
            let summary = '';
            //console.log("COUNT: "+rows.length)
            for (const row of rows) {
                let message = JSON.parse(JSON.stringify(row));
                //console.log("USER ID: ", message.userId)
                if (message.userId === process.env.DISCORD_BOT_ID) {
                    summary += 'Assistant: ' + message.content + '\n';
                } else {
                    summary += 'User: ' + message.content + '\n';
                }
            }

            if(rows.length === 10){
                newSummary = await doSummarize(summary, userId);
            } else {
                console.log("Rows Length Less than 10");
                newSummary = await fetchSummary(userId);
            }

            return {"newSummary": newSummary, "history": summary};
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    }

    // Function to insert a new message
    async function insertMessage(messageId, userId, content) {
        const [result] = await pool
            .promise()
            .query('INSERT INTO messages (messageId, userId, content) VALUES (?, ?, ?)', [messageId, userId, content]);

        return true; // Return the ID of the inserted message
    }

    // Function to insert a new message
    async function insertReply(messageId, userId, replyTo, content) {
        //console.log("insertreply");
        if (content === null || content === undefined) {
            console.error("Content cannot be null or undefined");
            return false; // or handle the error in a way that makes sense for your application
        }
        const [result] = await pool
            .promise()
            .query('INSERT INTO messages (messageId, userId, reply_to, content) VALUES (?, ?, ?, ?)', [messageId, userId, replyTo, content]);
        
        return true; // Return the ID of the inserted message
    }

    function purgeUser(userId)
    {
        //console.log('purge');
        try {
            pool
            .query('UPDATE messages SET deleted=1 WHERE userId = ? OR reply_to=?', [userId, userId]);
        } catch(e) {
            console.error(e);
        }
        try{
            pool
            .query("INSERT INTO summary (userId, summary) VALUES (?, ?)", [userId, "N/A"])
        } catch(e) {
            console.error(e);
        }
        try{
            pool.query("UPDATE summary SET summary = ? WHERE userId = ?", ["N/A",userId]);
            return true;
        } catch(e) {
            console.error(e);
        }

    }

    async function doSummarize(messages, userId)
    {
        //console.log("dosummarize");
        try {
            let row = await fetchSummary(userId);
            //console.log("Row Summary:", row);

            if (row) {
                const summary = row;
                //console.log("Row Summary",summary)
                let message = "";
                if (summary !== null && summary !== "") {    
                    //console.log("Summary found");    
                    message = "Here is the current summary: \n\n" + summary + "\n\n Here are the new messages: "+messages+" Only output the new summary. Nothing else.";
                } else if (row.length === 0) {
                    //console.log("No Summary Found");
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
        
                //console.log("summarie aiMessage:", aiMessage);
        
                const reply = await openai.chat.completions.create({
                    model: process.env.AI_MODEL,
                    messages: aiMessage,
                    temperature: process.env.AI_TEMP,
                    max_tokens: process.env.AI_TOKENS
                });
        
                const newSummary = reply.choices[0]?.message?.content;
                //console.log("New Summary1111: ", newSummary);
        
                await pool.promise().query("UPDATE summary SET summary=? WHERE userId=?", [newSummary, userId ]);
                // clear messages //
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
        //console.log("fetchsummary");
        try {
            let summary = '';
            await pool.promise().query("SELECT summary FROM summary WHERE userId=?", [userId])
            .then(row => {
                summary = JSON.parse(JSON.stringify(row));
            //console.log("Rowwwwwww",summary[0][0].summary);
           });
            return summary[0][0].summary;
        } catch(e) {
            console.error(e);
            pool.query("INSERT INTO summary (userId, summary) VALUES (?, ?)", [userId, "N/A"]);
            fetchSummary(userId);
        }
    }