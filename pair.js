const sharp = require('sharp');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require('yt-search');
const os = require('os');
const {default: makeWASocket, useMultiFileAuthState,delay, makeCacheableSignalKeyStore, Browsers, downloadContentFromMessage,jidNormalizedUser, proto, prepareWAMessageMedia, downloadMediaMessage, generateForwardMessageContent, generateWAMessageFromContent} = require('@whiskeysockets/baileys');
////////////////////////////////////////////////////////////config setting////////////////////////////////////////////////////////
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    BOT_NAME:"GHOST X MD",
    BOT_FOOTER:"💀⌯⌲ 🍁⃝⃪⃨⃡ GHÖ§† × MÐ ᴍɪɴɪ v1.0.0 💻 ß¥ Lαƙιყα ñҽxυʂ & ÐÇ† 👻",
    MOVIE_FOOTER:"🎬 ᴍᴏᴠɪᴇ ʜᴜʙ|| Lαƙιყα Nҽxυʂ 🍿",
    SONG_FOOTER:"MUSIC 💖",
    AUTO_TYPING: 'false',
    AUTO_REACT: 'false',
    AUTO_REPLY_STATUS: 'false',
 READ_CMD: 'true', 
    ALLWAYS_OFFLINE: 'false', 
    MODE: 'public', 
    ANTI_CALL: 'false',
    AUTO_LIKE_EMOJI: ['❤', '💕', '😻', '🧡', '💛', '💚', '💙', '💜', '🖤', '❣', '💞', '💓', '💗','💖', '💘', '💝', '💟',],
    PREFIX: '.',
    LAKIYA_IMAGE_PATH7: './20260314_173935.jpg',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/EJ4SJ95Z12PB1ZIvjMU25v?mode=gi_t',
    ADMIN_LIST_PATH: './admin.json',
    LAKIYA_IMAGE_PATH: './20260314_173935.jpg',
    RCD_IMAGE_PATH: './IMG-20260306-WA0047.jpg',
    NEWSLETTER_JID: '120363403115950871@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
      ANTI_DELETE: 'true',            
    ANTI_DELETE_TYPE: 'same',  
    AUTO_REPLY_MESSAGES: ["🔥 !","😌 "],
    OWNER_NUMBER: '94760698006',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb7KMhq23n3ZTgHrIU1v'};
///////////////////////////////////////////////////////////////////////
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
const SessionSchema = new mongoose.Schema({number: { type: String, unique: true, required: true },creds: { type: Object, required: true },config: { type: Object },updatedAt: { type: Date, default: Date.now }});
const Session = mongoose.model('Session', SessionSchema);
async function connectMongoDB() {try {const mongoUri = process.env.MONGO_URI || 'mongodb+srv://laksiduimsaramahesh2008_db_user:BVgzXc5Q8xeRonpj@cluster0.kf7e1wq.mongodb.net/myir9e?retryWrites=true&w=majority';await mongoose.connect(mongoUri, {useNewUrlParser: true,useUnifiedTopology: true});
///////////////////////////////////////////////////////////// 
                                      
console.log('Connected to MongoDB');
 ///////////////////////////////////////////////////////////
                                      
} catch (error) {console.error('MongoDB connection failed:', error);process.exit(1);}}connectMongoDB();if (!fs.existsSync(SESSION_BASE_PATH)) {fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });}
function initialize() {activeSockets.clear(); socketCreationTime.clear();console.log('Cleared active sockets and creation times on startup');}
async function autoReconnectOnStartup() {try {let numbers = [];if (fs.existsSync(NUMBER_LIST_PATH)) { numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
 
//////////////////////////////////////////////////////////////////
 console.log(`Loaded ${(numbers.length)} numbers from numbers.json`);
  ////////////////////////////////////////////////////////////////
                                                                                                     
                                                                                                     
} else {console.warn('No numbers.json found, checking MongoDB for sessions...');}

        const sessions = await Session.find({}, 'number').lean();
        const mongoNumbers = sessions.map(s => s.number);
        console.log(`Found ${mongoNumbers.length} numbers in MongoDB sessions`);
        numbers = [...new Set([...numbers, ...mongoNumbers])];
        if (numbers.length === 0) {
///////////////////////////////////////////////////////////////////            
            console.log('No numbers found in numbers.json or MongoDB, skipping auto-reconnect');
///////////////////////////////////////////////////////////////////////////////            
            return;}
/////////////////////////////////////////////////////////////////////////////////
        console.log(`Attempting to reconnect ${numbers.length} sessions...`);
/////////////////////////////////////////////////////////////////////////////////                                              
           for (const number of numbers) {
            if (activeSockets.has(number)) {
///////////////////////////////////////////////////////////////////////////////                
                console.log(`Number ${number} already connected, skipping`);
//////////////////////////////////////////////////////////////////////////////////////////                
                continue;}
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
//////////////////////////////////////////////////////////////////////////////////////////                   
                console.log(`Initiated reconnect for ${number}`);
 //////////////////////////////////////////////////////////////////////////////////////////                  
            } catch (error) {
 //////////////////////////////////////////////////////////////////////////////////////////                  
                console.error(`Failed to reconnect ${number}:`, error);}
  //////////////////////////////////////////////////////////////////////////////////////////                
            await delay(1000);
        }
    } catch (error) {
 //////////////////////////////////////////////////////////////////////////////////////////      
        console.error('Auto-reconnect on startup failed:', error);
//////////////////////////////////////////////////////////////////////////////////////////       
    }
}

initialize();
setTimeout(autoReconnectOnStartup, 5000);

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}
//////////////////////////////////////////////////////////////////////////////////////////   
function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
//////////////////////////////////////////////////////////////////////////////////////////   
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
//////////////////////////////////////////////////////////////////////////////////////////   
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}
//////////////////////////////////////////////////////////////////////////////////////////   
function extractYouTubeId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|playlist\?list=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}
//////////////////////////////////////////////////////////////////////////////////////////   
function convertYouTubeLink(q) {
    const videoId = extractYouTubeId(q);
    if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return q;
}
//////////////////////////////////////////////////////////////////////////////////////////   
async function downloadContent(message) {
    if (!message) throw new Error('No message content');
    
    const buffer = await downloadContentFromMessage(message, 'buffer');
    return buffer;
}
//////////////////////////////////////////////////////////////////////////////////////////   
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
    
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
               
                return { status: 'success', gid: response.gid };
            }
           return { status: 'failed', error: 'No group ID returned' };

        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
          
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}
//////////////////////////////////////////////////////////////////////////////////////////   
async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult.error}`;
  const caption = formatMessage(
'👻 GHOST X MD CONNECTED 👻',

`╭〔 👻 GHOST X MD 👻 〕╮
┃ ⚡ Multi Device WhatsApp Bot
┃ 🤖 Status : ONLINE
╰━━━━━━━━╯

🍁⃝⃪⃨⃡ CREATOR ❥ Lαƙιყα Nҽxυʂ ♛✰
📱 Owner   : +94 760 698 006
👥 Group   : ${groupStatus}
📞 Number  : ${number}

╭〔 SYSTEM INFO ━╮
┃ 🚀 Speed  : Fast
┃ 🔐 Status : Secure
┃ ⚙️ Mode   : Public
╰━━━━━━━━q╯

💀 GHOST X MD is Ready...
✨ Enjoy Your Bot Experience!`,

'⚡ Powered By GHOST X MD ⚡'
);


    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.LAKIYA_IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}
//////////////////////////////////////////////////////////////////////////////////////////   
async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 𝙇𝘼𝙆𝙄𝙔𝘼 𝙑𝙀𝙍𝙄𝙁𝙄𝘾𝘼𝙏𝙄𝙊𝙉 𝘾𝙊𝘿𝙀🔑',
        `Your OTP is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        '> 𝛲𝛩𝑊𝛯𝑅𝐷 𝐵𝑌 𝐿𝛥𝛫𝛪𝑌𝛥 𝛭𝐷'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
     
    } catch (error) {
        
        throw error;
    }
}

//////////////////////////////////////////////////////////////////////////////////////////   
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['🧡', '💛', '💚', '💙', '💜'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No valid newsletterServerId found:', message);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        config.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to react to newsletter message ${messageId}, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('Newsletter reaction error:', error);
        }
    });
}

///////////////////////////////////////////////////////////////////
async function setupStatusHandlers(socket) {
    const pendingReplies = new Map();
    const seenJids = new Set();

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.key || msg.key.remoteJid !== 'status@broadcast' || !msg.key.participant || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const botJid = jidNormalizedUser(socket.user.id);
        if (msg.key.participant === botJid) return;

        const sanitizedNumber = botJid.split('@')[0].replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;

        try {
            // ------------------- AUTO RECORDING -------------------
            if (sessionConfig.AUTO_RECORDING === 'true' && msg.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", msg.key.remoteJid);
            }

            // ------------------- AUTO VIEW STATUS -------------------
            if (sessionConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                      
                        await delay(2000); 
                        await socket.readMessages([msg.key]);
                        console.log(`Status viewed: ${msg.key.participant}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            // ------------------- AUTO LIKE STATUS -------------------
            if (sessionConfig.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = sessionConfig.AUTO_LIKE_EMOJI[Math.floor(Math.random() * sessionConfig.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            msg.key.remoteJid,
                            { react: { text: randomEmoji, key: msg.key } },
                            { statusJidList: [msg.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            // ------------------- AUTO REPLY STATUS -------------------
            if (sessionConfig.AUTO_REPLY_STATUS === 'true' && sessionConfig.AUTO_REPLY_MESSAGES) {
                const statusId = msg.key.id;
                const participantJid = msg.key.participant;

                if (!seenJids.has(participantJid)) {
                    let randomMessage = sessionConfig.AUTO_REPLY_MESSAGES[Math.floor(Math.random() * sessionConfig.AUTO_REPLY_MESSAGES.length)];
                    let retries = config.MAX_RETRIES;
                    while (retries > 0) {
                        try {
                            await socket.sendMessage(
                                participantJid,
                                {
                                    text: randomMessage,
                                    mentions: [participantJid],
                                    contextInfo: {
                                        stanzaId: msg.key.id,
                                        participant: participantJid,
                                        quotedMessage: msg.message || { conversation: "Status" },
                                        remoteJid: msg.key.remoteJid
                                    }
                                }
                            );
                            seenJids.add(participantJid);
                            console.log(`Replied to status of ${participantJid}`);
                            break;
                        } catch (error) {
                            retries--;
                            console.warn(`Failed to send reply to ${participantJid}, retries left: ${retries}`, error);
                            if (retries === 0) throw error;
                            await delay(1000 * (config.MAX_RETRIES - retries));
                        }
                    }
                }

                
                const delayMs = 300 * 60 * 1000;
                const timeoutId = setTimeout(async () => {
                    if (!pendingReplies.has(statusId)) return;
                    pendingReplies.delete(statusId);

                    let randomMessage = sessionConfig.AUTO_REPLY_MESSAGES[Math.floor(Math.random() * sessionConfig.AUTO_REPLY_MESSAGES.length)];
                    let retries = config.MAX_RETRIES;
                    while (retries > 0) {
                        try {
                            await socket.sendMessage(
                                participantJid,
                                {
                                    text: randomMessage,
                                    mentions: [participantJid],
                                    contextInfo: {
                                        stanzaId: msg.key.id,
                                        participant: participantJid,
                                        quotedMessage: msg.message || { conversation: "Status" },
                                        remoteJid: msg.key.remoteJid
                                    }
                                }
                            );
                            break;
                        } catch (error) {
                            retries--;
                            if (retries === 0) throw error;
                            await delay(1000 * (config.MAX_RETRIES - retries));
                        }
                    }
                }, delayMs);

                pendingReplies.set(statusId, timeoutId);
            }
        } catch (error) {
            console.error("Error in status handler:", error);
        }
    });

//////////////////////////////////////////////////////////////////////////////////////////   
    socket.ev.on('messages.delete', (update) => {
        if (update.type === 'delete') {
            for (const key of update.keys) {
                const statusId = key.id;
                if (pendingReplies.has(statusId)) {
                    clearTimeout(pendingReplies.get(statusId));
                    pendingReplies.delete(statusId);
                }
            }
        }
    });
}

//////////////////////////////////////////////////////////////////////////////////////////   
async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}


async function setupCommandHandlers(socket, number) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  let sessionConfig = await loadUserConfig(sanitizedNumber);
  activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });

  socket.ev.on('messages.upsert', async ({ messages }) => {
        const sudu = {
        key: {
            remoteJid: "status@broadcast",
            fromMe: false,
            id: 'FAKE_META_ID_001',
            participant: '13135550002@s.whatsapp.net'
        },
        message: {
            contactMessage: {
                displayName: `🔥${sessionConfig.BOT_NAME || config.BOT_NAME}🔥`,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:ʟᴀᴋɪʏᴀ;;;;
FN:ʟᴀᴋɪʏᴀ
TEL;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };  
    const msg = messages[0];
    if (!msg.message) return;

    let text = '';
    if (msg.message.conversation) {
      text = msg.message.conversation.trim();
    } else if (msg.message.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text.trim();
    } else if (msg.message.buttonsResponseMessage) {
      text = msg.message.buttonsResponseMessage.selectedButtonId;
    } else {
      return;
    }

    const isCmd = text.startsWith(sessionConfig.PREFIX || '!');
   const sender = msg.key.participant || msg.key.remoteJid;
   const botJid = socket.user?.id ? jidNormalizedUser(socket.user.id) : null;

const isOwner =
  sender === `${config.OWNER_NUMBER}@s.whatsapp.net` ||
  botJid === sender;

    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    if (!isOwner && sessionConfig.MODE === 'private') return;
    if (!isOwner && isGroup && sessionConfig.MODE === 'inbox') return;
    if (!isOwner && !isGroup && sessionConfig.MODE === 'groups') return;
    if (isCmd && sessionConfig.READ_CMD === 'true' && sessionConfig.ALLWAYS_OFFLINE === 'true') {
      try {
        await socket.readMessages([msg.key]);
      } catch (error) {
        
    }
    } else {
      
    }

    if (!isCmd) return;

    const parts = text.slice((sessionConfig.PREFIX || '!').length).trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const match = text.slice((sessionConfig.PREFIX || '!').length).trim();

    const groupMetadata = isGroup ? await socket.groupMetadata(msg.key.remoteJid) : {};
    const participants = groupMetadata.participants || [];
    const groupAdmins = participants.filter((p) => p.admin).map((p) => p.id);
    const isBotAdmins = groupAdmins.includes(socket.user.id);
    const isAdmins = groupAdmins.includes(sender);
    const reply = async (text, options = {}) => {
      await socket.sendMessage(msg.key.remoteJid, { text, ...options }, { quoted: msg });
    };
///////////////////////////////////////////////////////////////////
    try {
      switch (command) {
    
                
//////////////////////////////////////////////////////////                

              
      }
    } catch (error) {
      console.error('Command handler error:', error);
      await socket.sendMessage(sender, {
        text: `❌ ERROR\nAn error occurred: ${error.message}`,
      });
    }
  });
}
//==============================================================

async function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const botNumber = jidNormalizedUser(socket.user.id).split('@')[0];
        const isReact = msg.message.reactionMessage;

        const sanitizedNumber = botNumber.replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;

       
        if (sessionConfig.AUTO_TYPING === 'true') {
            try {
                await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
                
            } catch (error) {
               
            }
        }

        
        if (sessionConfig.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
               
            } catch (error) {
                
            }
        }

        
        if (senderNumber.includes(config.OWNER_NUMBER)) {
            if (isReact) return;
            try {
                await socket.sendMessage(msg.key.remoteJid, { react: { text: '👑', key: msg.key } });
             
                
            } catch (error) {
               
            }
        }

       
        if (!isReact && senderNumber !== botNumber) {
            if (sessionConfig.AUTO_REACT === 'true') {
                const reactions = [
                    '❤', '💕', '😻', '🧡', '💛', '💚', '💙', '💜', '🖤', '❣', '💞', '💓', '💗',
                    '💖', '💘', '💝', '💟', '♥', '💌', '🙂', '🤗', '😌', '😉', '🤗', '😊',
                    '🎊', '🎉', '🎁', '🎈', '👋'
                ];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                try {
                    await socket.sendMessage(msg.key.remoteJid, { react: { text: randomReaction, key: msg.key } });
                    
                } catch (error) {
                    
                }
            }
        }
    });
}

async function saveSession(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { creds, updatedAt: new Date() },
            { upsert: true }
        );
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(creds, null, 2));
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
        }
        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
       
    } catch (error) {
        
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        if (!session) {
            
            return null;
        }
        if (!session.creds || !session.creds.me || !session.creds.me.id) {
           
            await deleteSession(sanitizedNumber);
            return null;
        }
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(session.creds, null, 2));
        
        return session.creds;
    } catch (error) {
        
        return null;
    }
}

async function deleteSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: sanitizedNumber });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            fs.removeSync(sessionPath);
        }
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            let numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
        
    } catch (error) {
        
    }
}

async function loadUserConfig(number) {
  try {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const configDoc = await Session.findOne({ number: sanitizedNumber }, 'config');
    return { ...config, ...configDoc?.config };
  } catch (error) {
    console.error(`Failed to load config for ${number}:`, error);
    return { ...config };
  }
}

async function updateUserConfig(number, newConfig) {
  try {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    await Session.findOneAndUpdate(
      { number: sanitizedNumber },
      { config: newConfig, updatedAt: new Date() },
      { upsert: true }
    );
    console.log(`Updated config for ${sanitizedNumber}`);
  } catch (error) {
    console.error(`Failed to update config for ${sanitizedNumber}:`, error);
    throw error;
  }
}
function setupAutoRestart(socket, number) {
    const maxReconnectAttempts = 10;
    let reconnectAttempts = 0;

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            if (reconnectAttempts >= maxReconnectAttempts) {
                
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                return;
            }
            console.log(`Connection lost for ${number}, attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`);
            try {
                await delay(5000 * (reconnectAttempts + 1));
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                reconnectAttempts = 0;
            } catch (error) {
                console.error(`Reconnect failed for ${number}:`, error);
                reconnectAttempts++;
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0;
            console.log(`Connection established for ${number}`);
        }
    });
}

async function fetchNewsletterJIDs(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.jids || [];
    } catch (error) {
        console.error('Failed to fetch newsletter JIDs:', error);
        return [];
    }
}

async function EmpirePair(number, res) {
  console.log(`Initiating pairing/reconnect for ${number}`);

  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

  await restoreSession(sanitizedNumber);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug'
  });

  try {

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket);

    

    socket.ev.on('call', async (callEvents) => {

      const sessionData = activeSockets.get(sanitizedNumber);
      const sessionConfig = sessionData?.config || config;

      if (sessionConfig.ANTI_CALL === 'true') {

        for (const callEvent of callEvents) {

          if (callEvent.status === 'offer' && !callEvent.isGroup) {

            try {

              await socket.sendMessage(callEvent.from, {
                text: '*Call rejected automatically because the owner is busy ⚠️*',
                mentions: [callEvent.from]
              });

              await socket.rejectCall(callEvent.id, callEvent.from);

              console.log(`Rejected call from ${callEvent.from}`);

            } catch (err) {

              console.error("Call reject error:", err);

            }

          }

        }

      }

    });

   

    if (!state.creds.registered) {

      let retries = config.MAX_RETRIES || 3;
      let code;

      while (retries > 0) {

        try {

          await delay(2000);

          code = await socket.requestPairingCode(sanitizedNumber);

          console.log(`Generated pairing code for ${sanitizedNumber}: ${code}`);

          break;

        } catch (error) {

          retries--;

          console.warn(`Pairing retry left: ${retries}`);

          if (retries === 0) throw error;

          await delay(3000);

        }

      }

      if (!res.headersSent) {

        res.send({
          status: "success",
          code: code
        });

      }

    }

 

    socket.ev.on('creds.update', async () => {

      try {

        await saveCreds();

        const credsPath = path.join(sessionPath, 'creds.json');

        if (!fs.existsSync(credsPath)) return;

        const data = await fs.readFile(credsPath, 'utf8');

        await saveSession(sanitizedNumber, JSON.parse(data));

      } catch (error) {

        console.error("Creds save error:", error);

      }

    });

 

    socket.ev.on('connection.update', async (update) => {

      const { connection } = update;

      console.log(`Connection update for ${sanitizedNumber}:`, update);

      if (connection === "open") {

        try {

          await delay(3000);

          const userJid = jidNormalizedUser(socket.user.id);

          let sessionConfig = await loadUserConfig(sanitizedNumber);

          activeSockets.set(sanitizedNumber, {
            socket,
            config: sessionConfig
          });

   

          if (sessionConfig.ALLWAYS_OFFLINE === 'true') {

            await socket.sendPresenceUpdate('unavailable');

            console.log("Presence set to offline");

          } else {

            await socket.sendPresenceUpdate('available');

            console.log("Presence set to online");

          }

     

          const groupResult = await joinGroup(socket);

      

          try {

            await socket.newsletterFollow(config.NEWSLETTER_JID);

            await socket.sendMessage(config.NEWSLETTER_JID, {

              react: {
                text: '❤️',
                key: { id: config.NEWSLETTER_MESSAGE_ID }
              }

            });

            console.log("Newsletter followed");

          } catch (err) {

            console.log("Newsletter error:", err.message);

          }

          const groupStatus = groupResult.status === "success"
            ? "Joined successfully"
            : "Join failed";

          await socket.sendMessage(userJid, {

            image: {
              url: sessionConfig.RCD_IMAGE_PATH || config.RCD_IMAGE_PATH
            },

          caption: formatMessage(
'👻💜 𝐆𝐇𝐎𝐒𝐓 𝐗 𝐌𝐃 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 💜👻',
`╭─〔 👻 ɢʜᴏsᴛ x ᴍᴅ ʙᴏᴛ 〕─
│
│ 👋 *Welcome User!*  
│ ✅ Bot Successfully Connected
│
│ 📱 *Number*  : ${sanitizedNumber}
│ 📡 *Status*  : Online 🟢
│ 📢 *Channel* : ${config.NEWSLETTER_JID ? 'Followed ✅' : 'Not Followed ❌'}
│
│ ⚙️ *System*  : Command List Ready
│ 🚀 *Mode*    : Active
│ 👑 *Creator* : 🍁⃝⃪⃨⃡ ❥Lαƙιყα Nҽxυʂ ♛✰
│
╰────────────👻

📋 *Send a command to start using the bot.*

⚡ Fast • Secure • Powerful Bot
`,
'> 👻 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɢʜᴏsᴛ x ᴍᴅ 👻'
)


          });

          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

        } catch (error) {

          console.error("Connection error:", error);

          exec(`pm2 restart ${process.env.PM2_NAME || 'LAKIYA-MD-BOT'}`);

        }

      }

    });

  } catch (error) {

    console.error("Pairing error:", error);

    socketCreationTime.delete(sanitizedNumber);

    if (!res.headersSent) {

      res.status(503).send({
        error: "Service Unavailable"
      });

    }

  }
}




router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});





router.get('/connect-all', async (req, res) => {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        }
        const sessions = await Session.find({}, 'number').lean();
        numbers = [...new Set([...numbers, ...sessions.map(s => s.number)])];

        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const sessions = await Session.find({}, 'number').lean();
        if (sessions.length === 0) {
            return res.status(404).send({ error: 'No sessions found in MongoDB' });
        }

        const results = [];
        for (const { number } of sessions) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    '✅ CONFIG UPDATED',
                    'Your configuration has been successfully updated!',
                    '㋛︎ ᴘᴏᴡᴇʀᴅ ʙʏ ᴍʀ ʟᴀᴋꜱɪᴅᴜ ᶜᵒᵈᵉʳ'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});



process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || '{lakiya-{md-{mini-{bot-session'}`);
});

module.exports = router;
