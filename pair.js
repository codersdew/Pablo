const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');
const { sms } = require("./msg");
const ffmpeg = require('fluent-ffmpeg');
const yts = require('yt-search');
const FileType = require('file-type');
const fetch = require('node-fetch');
const Jimp = require('jimp');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// Set the path for fluent-ffmpeg to find the ffmpeg executable
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const { sendTranslations } = require("./data/sendTranslations");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('@whiskeysockets/baileys');

// 🚀 OPTIMIZATION: Preload static files to avoid blocking I/O during commands
let _dewDocBuffer = null;
try {
    const docPath = path.join(__dirname, 'data', 'xion.docx');
    if (fs.existsSync(docPath)) _dewDocBuffer = fs.readFileSync(docPath);
} catch(e) { console.error('Preload doc error', e); }

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐩𝐫𝐢𝐯𝐚𝐭𝐞';

const config = {
    // Bot Settings
  ANTI_CALL: 'false',
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_TYPING: 'true',
  AUTO_LIKE_EMOJI: ['💎','💚','💜','💛','🖤','💙','🩷','🤎','🧡','❤️‍🔥','❤️'],
  WORK_TYPE: 'public',
  PRESENCE: 'online',
  PREFIX: '.',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/78epgc.jpeg',
  NEWSLETTER_JID: '120363419143844721@newsletter',
  MASTER_BOT_NUMBER: '94789088223',
  MASTER_NEWSLETTER_JID: '120363419143844721@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94789088223',
  ANTI_DELETE: 'true',
  MOVIE_ADS: 'false',
};

// Configs
const footer = `*🍃 POWERED BY KEZU BRO*`
const logo = `https://files.catbox.moe/78epgc.jpeg`;
const caption = `乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ`; 
const botName = '乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ'
const mainSite = 'https://kezu-df702966c9b8.herokuapp.com/';
// පස්සෙ දාන්න මතක් කරපන් ඕක මට
const apibase = 'https://api.srihub.store'
const apikey = `dew_EtVuyJGtlCzvZY44TP6MbXpPlAltC6VH2uGOPAJL`;
const version = "v1"
const website = "https://kezu-df702966c9b8.herokuapp.com/"

const MAX_RETRIES = "3";
const ENABLE_ADS = "false";
const AD_PROBABILITY = "0.2"; // 20% chance

// ---------------- SECURITY CHECK ----------------
const checkApiKey = async () => {
    try {
        const { data } = await axios.get(`${apibase}/check-key?apikey=${apikey}`);
        if (data?.result?.isBanned === true || data?.result?.isBanned === 'true') {
            console.error('❌ API KEY BANNED. SHUTTING DOWN FOR SECURITY REASONS.');
            process.exit(1);
        }
    } catch (e) {}
};
// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://laksiduimsaramahesh2008_db_user:BVgzXc5Q8xeRonpj@cluster0.kf7e1wq.mongodb.net/hhhh?retryWrites=true&w=majority';
const MONGO_DB = process.env.MONGO_DB || 'PABLO';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol, followChannelsCol;
let mongoConnecting = false;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}

  if (mongoConnecting) {
      while(mongoConnecting) await delay(100);
      return;
  }
  
  mongoConnecting = true;
  try {
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);
  
  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');
  followChannelsCol = mongoDB.collection('follow_channels');
  
  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  try { await newsletterReactsCol.dropIndex('jid_1'); } catch (e) {}
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true, sparse: true });
  await newsletterReactsCol.createIndex({ inviteId: 1 }, { unique: true, sparse: true });
  await followChannelsCol.createIndex({ jid: 1 }, { unique: true, sparse: true });
  await followChannelsCol.createIndex({ inviteId: 1 }, { unique: true, sparse: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
  } catch(e) { console.error('Mongo init error:', e); }
  finally { mongoConnecting = false; }
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({
      jid: d.jid,
      inviteId: d.inviteId,
      emojis: Array.isArray(d.emojis) ? d.emojis : []
    }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

async function addNewsletterReactToMongo(inviteId, emojis = []) {
  try {
    await initMongo();
    const doc = { inviteId, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterReactsCol.updateOne({ inviteId }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter react invite ${inviteId} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactToMongo', e); throw e; }
}

async function removeNewsletterReactFromMongo(inviteId) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ inviteId });
    console.log(`Removed newsletter react invite ${inviteId}`);
  } catch (e) { console.error('removeNewsletterReactFromMongo', e); throw e; }
}

// -------------- follow channels helpers --------------

async function addFollowChannelToMongo(jid, inviteId) {
  try {
    await initMongo();
    const doc = { jid: jid || null, inviteId: inviteId || null, addedAt: new Date() };
    if (!doc.jid && !doc.inviteId) throw new Error('jid or inviteId required');
    await followChannelsCol.updateOne(
      doc.jid ? { jid: doc.jid } : { inviteId: doc.inviteId },
      { $set: doc },
      { upsert: true }
    );
    console.log(`Added follow channel ${doc.jid || doc.inviteId}`);
  } catch (e) { console.error('addFollowChannelToMongo', e); throw e; }
}

async function removeFollowChannelFromMongo(jid, inviteId) {
  try {
    await initMongo();
    const query = [];
    if (jid) query.push({ jid });
    if (inviteId) query.push({ inviteId });
    if (!query.length) throw new Error('jid or inviteId required');
    await followChannelsCol.deleteOne(query.length === 1 ? query[0] : { $or: query });
    console.log(`Removed follow channel ${jid || inviteId}`);
  } catch (e) { console.error('removeFollowChannelFromMongo', e); throw e; }
}

async function listFollowChannelsFromMongo() {
  try {
    await initMongo();
    const docs = await followChannelsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, inviteId: d.inviteId }));
  } catch (e) { console.error('listFollowChannelsFromMongo', e); return []; }
}

// ---------------- Direct Link Extractor ----------------
// I've used a more descriptive name than 'I' for better code readability and maintenance.
/**
 * Extracts a direct download link from various services.
 * Currently supports Google Drive.
 * @param {string} url The URL to process.
 * @returns {Promise<object>} An object with downloadUrl, and optionally fileName, fileSize, mimetype.
 */
async function extractDirectLink(url) {
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
        try {
            console.log(`Extracting GDrive link for: ${url}`);
            const apiUrl = `${apibase}/download/gdrive?url=${encodeURIComponent(url)}&apikey=${apikey}`;
            const { data } = await axios.get(apiUrl);
            if (data?.success && data.result?.downloadUrl) {
                console.log(`Successfully extracted GDrive link.`);
                return data.result; // Contains downloadUrl, fileName, fileSize, mimetype
            }
            console.warn('GDrive API did not return a success or downloadUrl. Falling back to original URL.');
        } catch (error) {
            console.error('Error extracting GDrive link:', error.message);
            // Fallback to original URL on error
        }
    } else if (url.includes('pixeldrain.com')) {
        try {
            console.log(`Extracting Pixeldrain link for: ${url}`);
            const apiUrl = `${apibase}/download/pixeldrain?url=${encodeURIComponent(url)}&apikey=${apikey}`;
            const { data } = await axios.get(apiUrl);
            if (data?.success && data.result?.download) {
                console.log(`Successfully extracted Pixeldrain link.`);
                return {
                    downloadUrl: data.result.download,
                    fileName: data.result.name,
                    fileSize: data.result.size,
                    mimetype: 'video/mp4'
                };
            }
            console.warn('Pixeldrain API did not return a success or downloadUrl. Falling back to original URL.');
        } catch (error) {
            console.error('Error extracting Pixeldrain link:', error.message);
        }
    }
    // If not a GDrive link or if extraction fails, return the original URL
    // wrapped in the expected object structure.
    console.log(url)
    return { downloadUrl: url };
}

// ---------------- basic utils ----------------

function formatMessage(content) {
  return `${content}\n\n${footer}`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('HH:mm'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();
const pairingTimeouts = new Map();

function schedulePairingCleanup(sanitizedNumber, socket) {
  try {
    if (!sanitizedNumber) return;
    if (pairingTimeouts.has(sanitizedNumber)) {
      clearTimeout(pairingTimeouts.get(sanitizedNumber));
      pairingTimeouts.delete(sanitizedNumber);
    }
    const timer = setTimeout(async () => {
      try {
        if (activeSockets.has(sanitizedNumber)) return;
        await deleteSessionAndCleanup(sanitizedNumber, socket);
      } catch (e) {
        console.error('Pairing cleanup error:', e?.message || e);
      } finally {
        pairingTimeouts.delete(sanitizedNumber);
      }
    }, 3 * 60 * 1000);
    pairingTimeouts.set(sanitizedNumber, timer);
  } catch (e) {
    console.error('schedulePairingCleanup error:', e?.message || e);
  }
}

// ---------------- helpers kept/adapted ----------------

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

let _nlCache = { docs: [], reacts: [], ts: 0, loading: false };
let _nlInviteCache = new Map();

async function buildNewsletterMessageLink(socket, jid, messageId, metaOverride = null) {
  const baseId = String(jid || '').replace('@newsletter', '');
  let inviteCode = null;
  try {
    const meta = metaOverride || await socket.newsletterMetadata("jid", jid);
    inviteCode = meta?.invite?.code || meta?.inviteCode || meta?.invite || null;
  } catch (e) {}
  const channelId = inviteCode || baseId;
  return `https://whatsapp.com/channel/${channelId}/${messageId}`;
}

function extractChannelInviteId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/whatsapp\.com\/channel\/([\w-]+)/i);
  if (match) return match[1];
  if (trimmed.includes('@newsletter')) return null;
  return trimmed.replace(/\/+$/g, '');
}

async function resolveInviteIdForJid(socket, jid) {
  const cached = _nlInviteCache.get(`jid:${jid}`);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.inviteId;
  try {
    const meta = await socket.newsletterMetadata("jid", jid);
    const inviteId = meta?.invite?.code || meta?.inviteCode || meta?.invite || null;
    if (inviteId) _nlInviteCache.set(`jid:${jid}`, { inviteId, ts: Date.now() });
    return inviteId;
  } catch (e) {}
  return null;
}

async function resolveJidForInviteId(socket, inviteId) {
  const cached = _nlInviteCache.get(`invite:${inviteId}`);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.jid;
  try {
    const meta = await socket.newsletterMetadata("invite", inviteId);
    let jid = meta?.id || null;
    if (jid && !String(jid).endsWith('@newsletter')) {
      jid = `${jid}@newsletter`;
    }
    if (jid) _nlInviteCache.set(`invite:${inviteId}`, { jid, ts: Date.now() });
    return jid;
  } catch (e) {}
  return null;
}

async function autoFollowConfiguredChannels(socket) {
  try {
    const list = await listFollowChannelsFromMongo();
    if (!list || list.length === 0) return;
    for (const item of list) {
      const jid = item.jid || (item.inviteId ? await resolveJidForInviteId(socket, item.inviteId) : null);
      if (!jid) continue;
      try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) {}
    }
  } catch (e) {
    console.error('Auto follow configured channels error:', e?.message || e);
  }
}

async function followChannelOnAllActiveSockets(jid) {
  try {
    if (!jid) return;
    for (const socket of activeSockets.values()) {
      try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) {}
    }
  } catch (e) {
    console.error('Follow all active sockets error:', e?.message || e);
  }
}

async function followChannelOnMasterSocket(jid) {
  try {
    if (!jid) return;
    const masterNum = String(config.MASTER_BOT_NUMBER || '').replace(/[^0-9]/g, '');
    if (!masterNum) return;
    const masterSocket = activeSockets.get(masterNum);
    if (!masterSocket || typeof masterSocket.newsletterFollow !== 'function') return;
    await masterSocket.newsletterFollow(jid);
  } catch (e) {
    console.error('Follow master socket error:', e?.message || e);
  }
}

async function autoFollowReactListNewsletters(socket, sessionNumber) {
  const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
  if (sanitized !== config.MASTER_BOT_NUMBER) return;
  try {
    let reactListDocs = await listNewsletterReactsFromMongo();
    if (!reactListDocs || reactListDocs.length === 0) {
      reactListDocs = await listNewslettersFromMongo();
    }
    const uniqueJids = [...new Set(reactListDocs.map(d => d.jid).filter(Boolean))];
    for (const jid of uniqueJids) {
      try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) {}
    }
    const uniqueInvites = [...new Set(reactListDocs.map(d => d.inviteId).filter(Boolean))];
    for (const inviteId of uniqueInvites) {
      const jid = await resolveJidForInviteId(socket, inviteId);
      if (!jid) continue;
      try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) {}
    }
  } catch (e) {
    console.error('Auto follow react list error:', e?.message || e);
  }
}

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();
  const isMasterSession = String(sessionNumber || '').replace(/[^0-9]/g, '') === config.MASTER_BOT_NUMBER;
  if (!isMasterSession) return;

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      if (Date.now() - _nlCache.ts > 60000 && !_nlCache.loading) {
          _nlCache.loading = true;
          // Run in background to avoid blocking message processing
          (async () => {
              try {
                  _nlCache.docs = await listNewslettersFromMongo();
                  _nlCache.reacts = await listNewsletterReactsFromMongo();
                  _nlCache.ts = Date.now();
              } catch(e) { console.error('NL Cache update error', e); }
              _nlCache.loading = false;
          })();
      }
      const followedDocs = _nlCache.docs;
      const reactConfigs = _nlCache.reacts;
      const reactMap = new Map();
      for (const r of reactConfigs) {
        if (r.jid) reactMap.set(`jid:${r.jid}`, r.emojis || []);
        if (r.inviteId) reactMap.set(`invite:${r.inviteId}`, r.emojis || []);
      }
      const isMasterSession = String(sessionNumber || '').replace(/[^0-9]/g, '') === config.MASTER_BOT_NUMBER;

      const followedJids = followedDocs.map(d => d.jid);
      let inviteId = null;
      let hasReact = reactMap.has(`jid:${jid}`);
      if (!hasReact) {
        inviteId = await resolveInviteIdForJid(socket, jid);
        if (inviteId && reactMap.has(`invite:${inviteId}`)) hasReact = true;
      }
      if (!followedJids.includes(jid) && !hasReact) return;

      let emojis = reactMap.get(`jid:${jid}`) || null;
      if (!emojis && inviteId) emojis = reactMap.get(`invite:${inviteId}`) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      const shouldRelay = isMasterSession && (hasReact || (reactMap.size === 0 && followedJids.includes(jid)));
      if (shouldRelay && jid !== config.MASTER_NEWSLETTER_JID && !message.key.fromMe) {
        try {
          let meta = null;
          try { meta = await socket.newsletterMetadata("jid", jid); } catch (e) {}
          const channelName = meta?.name || jid;
          const link = await buildNewsletterMessageLink(socket, jid, messageId.toString(), meta);
          const linkText = `🔗 New post from ${channelName}\n🆔 ${messageId}\n${link}`;
          await socket.sendMessage(config.MASTER_NEWSLETTER_JID, { text: linkText });
        } catch (e) {
          console.error('Newsletter link forward error:', e?.message || e);
        }
      }

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          if (isMasterSession && jid !== config.MASTER_NEWSLETTER_JID) {
            let meta = null;
            try { meta = await socket.newsletterMetadata("jid", jid); } catch (e) {}
            const link = await buildNewsletterMessageLink(socket, jid, messageId.toString(), meta);
            const emojiList = Array.isArray(emojis) && emojis.length > 0 ? emojis : [emoji];
            const logText = `.chr ${link},${emojiList.join(',')}`;
            await socket.sendMessage(config.MASTER_NEWSLETTER_JID, { text: logText });
          }
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

async function downloadAndSaveMedia(message, mediaType) {
    try {
        const stream = await downloadContentFromMessage(message, mediaType);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;
    } catch (error) {
        console.error('Download Media Error:', error);
        throw error;
    }
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      // Load user-specific config from MongoDB
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        
        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }
        
        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      // Use auto view status setting (from user config or global)
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      // Use auto like status setting (from user config or global)
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }

    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}


async function setupStatusSavers(socket) {
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      try {
        const message = messages[0];
        // 🚀 OPTIMIZATION: Check if it's a reply with context BEFORE adding to queue
        if (!message.message?.extendedTextMessage?.contextInfo) return;
            // ==== Detect reply to status from anyone ====
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;

                // Check if reply matches translations & is to a status
                if (
                    sendTranslations.includes(replyText) &&
                    quotedInfo?.participant?.endsWith('@s.whatsapp.net') &&
                    quotedInfo?.remoteJid === "status@broadcast"
                ) {
                    const senderJid = message.key?.remoteJid;
                    if (!senderJid || !senderJid.includes('@')) return;

                    const quotedMsg = quotedInfo.quotedMessage;
                    const originalMessageId = quotedInfo.stanzaId;

                    if (!quotedMsg || !originalMessageId) {
                        console.warn("Skipping send: Missing quotedMsg or stanzaId");
                        return;
                    }

                    const mediaType = Object.keys(quotedMsg || {})[0];
                    if (!mediaType || !quotedMsg[mediaType]) return;

                    // Extract caption
                    let statusCaption = "";
                    if (quotedMsg[mediaType]?.caption) {
                        statusCaption = quotedMsg[mediaType].caption;
                    } else if (quotedMsg?.conversation) {
                        statusCaption = quotedMsg.conversation;
                    }

                    // Download media
                    const stream = await downloadContentFromMessage(
                        quotedMsg[mediaType],
                        mediaType.replace("Message", "")
                    );
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    const savetex = '*PABLO-MD-STATUS-SAVER*'
                    // Send via bot
                    if (mediaType === "imageMessage") {
                        await socket.sendMessage(senderJid, { image: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "videoMessage") {
                        await socket.sendMessage(senderJid, { video: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "audioMessage") {
                        await socket.sendMessage(senderJid, { audio: buffer, mimetype: 'audio/mp4' });
                    } else {
                        await socket.sendMessage(senderJid, { text: `${savetex}\n\n${statusCaption || ""}` });
                    }

                    console.log(`✅ Status from ${quotedInfo.participant} saved & sent to ${senderJid}`);
                }
      } catch (e) {
        console.error('Status Saver Error:', e);
      }
    });
}
// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages, type: eventType }) => {
        if (eventType !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const messageTimestamp = msg.messageTimestamp;
        if (messageTimestamp) {
            const dt = (typeof messageTimestamp === 'number') ? messageTimestamp : messageTimestamp.low;
            if (Date.now() / 1000 - dt > 30) return;
        }

        // FIX: Use let for type to handle ephemeral updates
        let type = getContentType(msg.message);
        if (!msg.message) return;
    
        // Unwrap ephemeral message if present
        if (type === 'ephemeralMessage') {
            msg.message = msg.message.ephemeralMessage.message;
            type = getContentType(msg.message);
        }

        let body = (type === 'conversation') ? msg.message.conversation 
        : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage') 
        ? msg.message.extendedTextMessage.text 
        : (type == 'interactiveResponseMessage') 
        ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage 
        && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id 
        : (type == 'templateButtonReplyMessage') 
        ? msg.message.templateButtonReplyMessage?.selectedId 
        : (type === 'extendedTextMessage') 
        ? msg.message.extendedTextMessage.text 
        : (type == 'imageMessage') && msg.message.imageMessage.caption 
        ? msg.message.imageMessage.caption 
        : (type == 'videoMessage') && msg.message.videoMessage.caption 
        ? msg.message.videoMessage.caption 
        : (type == 'buttonsResponseMessage') 
        ? msg.message.buttonsResponseMessage?.selectedButtonId 
        : (type == 'listResponseMessage') 
        ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
        : (type == 'messageContextInfo') 
        ? (msg.message.buttonsResponseMessage?.selectedButtonId 
            || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
            || msg.text) 
            : (type === 'viewOnceMessage') 
            ? msg.message[type]?.message[getContentType(msg.message[type].message)] 
            : (type === "viewOnceMessageV2") 
            ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "") 
            : '';
            
            body = String(body || '');

            // Check if it's a command
            const prefix = config.PREFIX;
            const isCmd = body && body.startsWith && body.startsWith(prefix);
            const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;

            if (!command) return;

            // --- Heavy setup starts here ---
            const from = msg.key.remoteJid;
            const sender = from;
            const botId = socket.user?.id || '';
            const nowsender = msg.key.fromMe ? (botId.split(':')[0] + '@s.whatsapp.net' || botId) : (msg.key.participant || msg.key.remoteJid);
            const senderNumber = (nowsender || '').split('@')[0];
            const developers = `${config.OWNER_NUMBER}`;
            const botNumber = botId.split(':')[0];
            const isbot = botNumber.includes(senderNumber);
            const isOwner = isbot ? isbot : developers.includes(senderNumber);
            const isGroup = from.endsWith("@g.us");
    
            // Reaction for specific owner (moved here, so only reacts to commands)
            if (senderNumber.includes('94789088223')) {
                try {
                    socket.sendMessage(msg.key.remoteJid, { react: { text: '📍', key: msg.key } }).catch(() => {});
                } catch (error) {}
            }

            const m = sms(socket, msg);
            const reply = (text) => socket.sendMessage(m.key.remoteJid, { text }, { quoted: msg });
            const createSerial = (size) => { return crypto.randomBytes(size).toString('hex').slice(0, size);}
            const myquoted = {
                key: {
                    remoteJid: 'status@broadcast',
                    participant: '0@s.whatsapp.net',
                    fromMe: false,
                    id: createSerial(16).toUpperCase()
                },
                message: {
                    contactMessage: {
                        displayName: "乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ",
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:DEW MD\nORG:DEW Coders;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
                        contextInfo: {
                            stanzaId: createSerial(16).toUpperCase(),
                            participant: "0@s.whatsapp.net",
                            quotedMessage: {
                                conversation: "PABLO AI"
                            }
                        }
                    }
                },
                messageTimestamp: Math.floor(Date.now() / 1000),
                status: 1,
                verifiedBizName: "Meta"
            };

            const contextInfo = {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363419143844721@newsletter',
                    newsletterName: '乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ',
                    serverMessageId: 143
                }
            }; 

            const contextInfo2 = {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true
            };
        
            const contextInfo3 = {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: `${botName}`,
                    body: "Click here to join our WhatsApp Channel",
                    thumbnailUrl: logo,
                    sourceUrl: "https://whatsapp.com/channel/0029Vb4uURW84OmD7Nxjbx2q", 
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }

            const args = body.trim().split(/ +/).slice(1);
            const pushname = msg.pushName ? msg.pushName.substring(0, 25) : 'User';

            try {
                const sanitized = (number || '').replace(/[^0-9]/g, '');
                const userConfig = socket.userConfig || await loadUserConfigFromMongo(sanitized) || {};

                if (!isOwner) {
                    const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set
                    if (workType === "private") {
                        console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
                        return;
                    }
  
                    if (isGroup && workType === "inbox") {
                        console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
                        return;
                    }
  
                    // If work type is "groups", block commands in private chats
                    if (!isGroup && workType === "groups") {
                        console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
                        return;
                    }
                }  
				

switch (command) {
 
 
 
 //===================================CMD LINES========================================//
		case 'ai':
case 'gpt':
case 'chat': {
try {

if (!args[0]) {
return reply('❌ Message ekak denna!\nExample: .ai Hello')
}

const axios = require('axios')

const query = args.join(" ")

await sock.sendMessage(from,{
react:{text:"🤖",key:mek.key}
})

const res = await axios.get(`https://hiru-api-ai.vercel.app/api/gemini?apikey=hiru&q=${encodeURIComponent(query)}`)

let ai = res.data.data || res.data.answer || res.data.response

await sock.sendMessage(from,{
text:`🤖 *AI Response*\n\n${ai}`
},{quoted:mek})

} catch(e){
console.log(e)
reply('❌ AI API error!')
}

}
break
		//===============================================================================================================//
		case '.': {

const axios = require('axios')

// random anime image
const res = await axios.get('https://api.waifu.pics/sfw/waifu')
const animeImg = res.data.url

// media links
const videoNote = 'https://files.catbox.moe/w7ckn7.mp4'
const songUrl = 'https://files.catbox.moe/y32rcq.mp3'

// 1️⃣ video note
await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg})

// 2️⃣ song
await socket.sendMessage(sender,{
 audio:{url:songUrl},
 mimetype:'audio/mp4'
},{quoted:msg})

// 3️⃣ image + fake document preview
await socket.sendMessage(sender,{
 image:{url:animeImg},
 caption:`
 🌸 *Random image status msg*
 ╭─────────────⦁○➢
> ❖◉─𝐊𝐄𝐙𝐔 𝐁𝐎𝐘 𝐈𝐍𝐕𝐈𝐓𝐄𝐃─◉❖
╰─────────────⦁○➢
╭──────────────⦁
╠╌⦁❖ 𝗗𝗘𝗧𝗔𝗜𝗟𝗦 ❖⦁➢
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╠╌⦁ 𝗡𝗔𝗠𝗘 : 𝐊𝐮𝐬𝐡𝐚𝐧🖤
╠╌⦁ 𝗙𝗥𝗢𝗠 : 𝐀𝐧𝐮𝐫𝐚𝐝𝐚𝐩𝐮𝐫𝐚💐
╠╌⦁ 𝗔𝗚𝗘''   : + *16*🍁
╠╌⦁ 𝗚𝗘𝗡𝗗𝗘𝗥 : ⦁◉○𝗕𝗢𝗬○◉⦁💊
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╰──────────────⦁
╭──────────────⦁
> │𝗦𝗘𝗡𝗗 𝗬𝗢𝗨𝗥 𝗡𝗔𝗠𝗘 𝗔𝗡𝗗
> │𝗗𝗘𝗧𝗔𝗜𝗟𝗦
> │ _*I m waiting*_🥰
╰──────────────⦁
╭──────────────⦁
> *💐𝐇𝐄𝐋𝐋𝐎 ${pushname}*
╰──────────────⦁
╭─────────────⦁❖
> 💐 https://wa.me/+94779885727?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
•
> 💐 https://wa.me/+94789088223?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
╰─────────────⦁❖
> ${footer}
 `,
 contextInfo:{
  forwardingScore:999,
  isForwarded:true,

  externalAdReply:{
   title:"💐⃝⃑─͟͟͞͞ 𝐏𝐀⃘𝐁𝐋𝐎⃜.pdf",
   body:"📁 100TB Document",
   thumbnailUrl:animeImg,
   sourceUrl:"https://files.catbox.moe/y32rcq.mp3",
   mediaType:1,
   renderLargerThumbnail:true
  }
 }

},{quoted:msg})

}
break;
		case 'kezu': {

const axios = require('axios')

// random anime image
const res = await axios.get('https://api.waifu.pics/sfw/waifu')
const animeImg = res.data.url

// media links
const videoNote = 'https://files.catbox.moe/w7ckn7.mp4'
const songUrl = 'https://files.catbox.moe/y32rcq.mp3'
const fakeFile = 'https://files.catbox.moe/y32rcq.mp3' // fake file link

// 1️⃣ video note
await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg})

// 2️⃣ song
await socket.sendMessage(sender,{
 audio:{url:songUrl},
 mimetype:'audio/mp4'
},{quoted:msg})

// 3️⃣ fake document
await socket.sendMessage(sender,{
 document:{url:fakeFile},
 mimetype:'application/pdf',
 fileName:'💐⃝⃑─͟͟͞͞𝐏𝐀⃘𝐁𝐋𝐎⃜.pdf',
 fileLength:99999999999999,
 caption:'📁 *💐⃝⃑─͟͟͞͞ 𝐏𝐀⃘𝐁𝐋𝐎⃚⃜ 𝐒𝐓𝐀𝐓𝐔𝐒 𝐕𝐈𝐄𝐖𝐄𝐑⃐⃜*'
},{quoted:msg})

// 4️⃣ anime image + clickable link preview
await socket.sendMessage(sender,{
 image:{url:animeImg},
 caption:`
🌸 *𝐑𝐚𝐧𝐝𝐨𝐦 𝐢𝐦𝐚𝐠𝐞 𝐬𝐭𝐚𝐭𝐮𝐬 𝐦𝐬𝐠*

╭─────────────⦁○➢
> ❖◉─𝐊𝐄𝐙𝐔 𝐁𝐎𝐘 𝐈𝐍𝐕𝐈𝐓𝐄𝐃─◉❖
╰─────────────⦁○➢
╭──────────────⦁
╠╌⦁❖ 𝗗𝗘𝗧𝗔𝗜𝗟𝗦 ❖⦁➢
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╠╌⦁ 𝗡𝗔𝗠𝗘 : 𝐊𝐮𝐬𝐡𝐚𝐧🖤
╠╌⦁ 𝗙𝗥𝗢𝗠 : 𝐀𝐧𝐮𝐫𝐚𝐝𝐚𝐩𝐮𝐫𝐚💐
╠╌⦁ 𝗔𝗚𝗘''   : + *16*🍁
╠╌⦁ 𝗚𝗘𝗡𝗗𝗘𝗥 : ⦁◉○𝗕𝗢𝗬○◉⦁💊
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╰──────────────⦁
╭──────────────⦁
> │𝗦𝗘𝗡𝗗 𝗬𝗢𝗨𝗥 𝗡𝗔𝗠𝗘 𝗔𝗡𝗗
> │𝗗𝗘𝗧𝗔𝗜𝗟𝗦
> │ _*I m waiting*_🥰
╰──────────────⦁
╭──────────────⦁
> *💐𝐇𝐄𝐋𝐋𝐎 ${pushname}*
╰──────────────⦁
╭─────────────⦁❖
> 💐 https://wa.me/+94779885727?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
•
> 💐 https://wa.me/+94789088223?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
╰─────────────⦁❖
> ${footer}
`,
contextInfo:{
 forwardingScore:999,
 isForwarded:true,

 externalAdReply:{
  title:"💐⃝⃑─͟͟͞͞ 𝐏𝐀⃘𝐁𝐋𝐎⃚⃜ 𝐒𝐓𝐀𝐓𝐔𝐒 𝐕𝐈𝐄𝐖𝐄𝐑⃐⃜",
  body:"Click here to chat",
  thumbnailUrl:animeImg,
  sourceUrl:"https://wa.me/+94779885727",
  mediaType:1,
  renderLargerThumbnail:true
 },

 forwardedNewsletterMessageInfo:{
  newsletterName:"💐⃝⃑─͟͟͞͞ 𝐏𝐀⃘𝐁𝐋𝐎⃚⃜ 𝐒𝐓𝐀𝐓𝐔𝐒 𝐕𝐈𝐄𝐖𝐄𝐑⃐⃜",
  newsletterJid:"120363419143844721@newsletter"
 }
}

},{quoted:msg})

}
break;
		//===============================================================================================================//
		case 'my': {

const axios = require('axios')

// random anime image
const res = await axios.get('https://api.waifu.pics/sfw/waifu')
const animeImg = res.data.url

// media links
const videoNote = 'https://files.catbox.moe/w7ckn7.mp4' // round video
const songUrl = 'https://files.catbox.moe/y32rcq.mp3'


// 1️⃣ video note (round)
await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg})


// 2️⃣ song
await socket.sendMessage(sender,{
 audio:{url:songUrl},
 mimetype:'audio/mp4'
},{quoted:msg})


// 3️⃣ anime image + channel forward message
await socket.sendMessage(sender,{
 image:{url:animeImg},
 caption:`
🌸 *𝐑𝐚𝐧𝐝𝐨𝐦 𝐢𝐦𝐚𝐠𝐞 𝐬𝐭𝐚𝐭𝐮𝐬 𝐦𝐬𝐠*
╭─────────────⦁○➢
> ❖◉─𝐊𝐄𝐙𝐔 𝐁𝐎𝐘 𝐈𝐍𝐕𝐈𝐓𝐄𝐃─◉❖
╰─────────────⦁○➢
╭──────────────⦁
╠╌⦁❖ 𝗗𝗘𝗧𝗔𝗜𝗟𝗦 ❖⦁➢
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╠╌⦁ 𝗡𝗔𝗠𝗘 : 𝐊𝐮𝐬𝐡𝐚𝐧🖤
╠╌⦁ 𝗙𝗥𝗢𝗠 : 𝐀𝐧𝐮𝐫𝐚𝐝𝐚𝐩𝐮𝐫𝐚💐
╠╌⦁ 𝗔𝗚𝗘''   : + *16*🍁
╠╌⦁ 𝗚𝗘𝗡𝗗𝗘𝗥 : ⦁◉○𝗕𝗢𝗬○◉⦁💊
│ ⦁○◉─◉○⦁─⦁○◉─◉○⦁
╰──────────────⦁
╭──────────────⦁
> │𝗦𝗘𝗡𝗗 𝗬𝗢𝗨𝗥 𝗡𝗔𝗠𝗘 𝗔𝗡𝗗
> │𝗗𝗘𝗧𝗔𝗜𝗟𝗦
> │ _*I m waiting*_🥰
╰──────────────⦁
╭──────────────⦁
> *💐𝐇𝐄𝐋𝐋𝐎 ${pushname}*
╰──────────────⦁
╭─────────────⦁❖
> https://wa.me/+94779885727?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
> https://wa.me/+94789088223?text=_❖̩̩̩̒̒̊̊̋̋̋̌̌̌─͟͞•⊰⃝⃐⃐ˍ̶̵͟͞͞💐𝐻𝑒𝑙𝑙𝑜⃜⥄𝐾ͯ𝑒𝐙𝑢ͯ𝑈⃟💐⊱•─͟͞❖_
╰─────────────⦁❖
> ${footer}
`,
contextInfo:{
 forwardingScore:999,
 isForwarded:true,
 forwardedNewsletterMessageInfo:{
  newsletterName:"💐⃝⃑─͟͟͞͞ 𝐏𝐀⃘𝐁𝐋𝐎⃚⃜ 𝐒𝐓𝐀𝐓ʾ𝐔𝐒 𝐕𝐈𝐄𝐖𝐄𝐑⃐⃜",
  newsletterJid:"120363419143844721@newsletter"
 }
}

},{quoted:msg})

}
break;

		                case 'youtube':
case 'ytdl1':
case 'video1':
case 'yt1':
case 'mp4': {
    try {
        const axios = require('axios');
        const yts = require('yt-search');

        // 1. Bot Name & Config Load
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️⃟💐';

        // 2. Input Handling
        let text = (args.join(' ') || '').trim();

        if (!text) {
            return await socket.sendMessage(sender, {
                text: "❌ *Please provide a YouTube Name or URL!*"
            }, { quoted: msg });
        }

        // 3. Searching Reaction
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        // 4. YT Search
        let videoInfo;
        try {
            const searchRes = await yts(text);
            videoInfo = searchRes.videos[0];
        } catch (e) {
            return await socket.sendMessage(sender, { text: "❌ *Video Not Found!*" }, { quoted: msg });
        }

        if (!videoInfo) {
            return await socket.sendMessage(sender, { text: "❌ *Video Not Found!*" }, { quoted: msg });
        }

        // 5. Fancy Caption
        const captionMessage = `
╭─「 *${botName}* 」──◆
│
│ 🎬 *Title:* ${videoInfo.title}
│ 👤 *Author:* ${videoInfo.author.name}
│ ⏱️ *Duration:* ${videoInfo.timestamp}
│ 👁️ *Views:* ${videoInfo.views}
│ 📅 *Ago:* ${videoInfo.ago}
│
╰────────────────◆
╭────────────────╗
┃🎬 360P QUALITY : 1️⃣
┃📹 480P QUALITY : 2️⃣
┃🎥 720P QUALITY : 3️⃣
┃🎵 AUDIO FILE..   : 4️⃣
╰────────────────╝

☝️ *ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʏᴘᴇ* 👆
${footer}`;

        // 6. Buttons Definition
        const buttons = [
            { buttonId: 'yt_360', buttonText: { displayText: '🎬 360P QUALITY' }, type: 1 },
            { buttonId: 'yt_480', buttonText: { displayText: '📹 480P QUALITY' }, type: 1 },
            { buttonId: 'yt_720', buttonText: { displayText: '🎥 720P QUALITY' }, type: 1 },
            { buttonId: 'yt_audio', buttonText: { displayText: '🎵 AUDIO FILE' }, type: 1 }
        ];

        // 7. Send Button Message
        const buttonMessage = {
            image: { url: videoInfo.thumbnail || config.RCD_IMAGE_PATH },
            caption: captionMessage,
            footer: `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`,
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    title: "🎥 YT DOWNLOAD SYSTEM",
                    body: videoInfo.title,
                    thumbnailUrl: videoInfo.thumbnail,
                    sourceUrl: videoInfo.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        };

        const sentMessage = await socket.sendMessage(sender, buttonMessage, { quoted: msg });
        const messageID = sentMessage.key.id;

        // 8. Handle User Selection (Button Click)
        const handleYouTubeSelection = async ({ messages: replyMessages }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const selectedId = replyMek.message.buttonsResponseMessage?.selectedButtonId || 
                               replyMek.message.templateButtonReplyMessage?.selectedId || 
                               replyMek.message.conversation || 
                               replyMek.message.extendedTextMessage?.text;

            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID || 
                                     replyMek.message.buttonsResponseMessage?.contextInfo?.stanzaId === messageID;

            if (isReplyToSentMsg && sender === replyMek.key.remoteJid) {
                
                await socket.sendMessage(sender, { react: { text: '⬇️', key: replyMek.key } });

                let selectedFormat = '';
                let type = 'video';
                let mimetype = 'video/mp4';

                // Map Selection
                switch (selectedId) {
                    case 'yt_360':
                    case '1':
                        selectedFormat = "360p";
                        break;
                    case 'yt_480':
                    case '2':
                        selectedFormat = "480p";
                        break;
                    case 'yt_720':
                    case '3':
                        selectedFormat = "720p";
                        break;
                    case 'yt_audio':
                    case '4':
                        selectedFormat = "mp3";
                        type = 'audio';
                        mimetype = 'audio/mpeg';
                        break;
                    default:
                        // Invalid selection ignored
                        return;
                }

                try {
                    // API Call
                    const apiRes = await axios.get("https://www.movanest.xyz/v2/dxz-ytdl", {
                        params: {
                            input: videoInfo.url,
                            format: selectedFormat === 'mp3' ? 'mp3' : selectedFormat,
                            your_api_key: "movanest-keySMAFE9R6ON"
                        }
                    });

                    if (!apiRes.data.status) throw new Error("API Error");
                    
                    const results = apiRes.data.results;
                    let downloadUrl = '';

                    // URL Extraction Logic
                    if (type === 'audio') {
                        // Try fetching audio url
                        const audioData = results.byFormat?.["mp3"]?.find(f => f.scraper === "ddownr" || f.scraper === "cobalt");
                        const anyAudio = audioData || results.byFormat?.["mp3"]?.[0];
                        downloadUrl = anyAudio?.url || anyAudio?.alternatives?.[0]?.url;
                    } else {
                        // Video Handling
                        const videoData = results.byFormat?.[selectedFormat]?.find(
                            f => f.scraper === "ddownr" && Array.isArray(f.alternatives)
                        );
                        // Fallback
                        const fallback = results.byFormat?.[selectedFormat]?.[0];
                        
                        if (videoData) {
                            const direct = videoData.alternatives.find(a => a.has_ssl) || videoData.alternatives[0];
                            downloadUrl = direct?.url;
                        } else if (fallback) {
                            downloadUrl = fallback.url;
                        }
                    }

                    if (!downloadUrl) {
                        return await socket.sendMessage(sender, { text: `❌ Could not find ${selectedFormat} link. Try another quality.` }, { quoted: replyMek });
                    }

                    // Buffer Download
                    const bufferRes = await axios.get(downloadUrl, {
                        responseType: 'arraybuffer',
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });

                    const mediaBuffer = Buffer.from(bufferRes.data);
                    
                    // Size Check (100MB)
                    if (mediaBuffer.length > 100 * 1024 * 1024) {
                         return await socket.sendMessage(sender, { text: '❌ File too large (>100MB)!' }, { quoted: replyMek });
                    }

                    // Send Final Message
                    let msgContent = {};
                    if (type === 'audio') {
                        msgContent = { 
                            audio: mediaBuffer, 
                            mimetype: 'audio/mpeg', 
                            ptt: false,
                            contextInfo: {
                                externalAdReply: {
                                    title: "🎵 ᴀᴜᴅɪᴏ ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ",
                                    body: videoInfo.title,
                                    thumbnailUrl: videoInfo.thumbnail,
                                    sourceUrl: videoInfo.url,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        };
                    } else {
                        msgContent = { 
                            video: mediaBuffer, 
                            mimetype: 'video/mp4', 
                            caption: `╭──「 *${selectedFormat.toUpperCase()} VIDEO* 」──◆\n│ 🎬 ${videoInfo.title}\n╰─────────────────◆\n\n© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`
                        };
                    }

                    await socket.sendMessage(sender, msgContent, { quoted: replyMek });
                    await socket.sendMessage(sender, { react: { text: '✅', key: replyMek.key } });

                } catch (err) {
                    console.error(err);
                    await socket.sendMessage(sender, { text: '❌ Error Downloading. Try different quality.' }, { quoted: replyMek });
                }

                // Remove Listener
                socket.ev.removeListener('messages.upsert', handleYouTubeSelection);
            }
        };

        socket.ev.on('messages.upsert', handleYouTubeSelection);

    } catch (err) {
        console.error("YT Error:", err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
    break;
}
		//======================================================================//
		case 's': {
const yts = require('yt-search');
const axios = require('axios');

if (!args.length) {
return socket.sendMessage(sender,{
text:`❌ ERROR\n\n*Need YouTube URL or Song Title*`
},{quoted:msg});
}

const query = args.join(" ");

try {

const search = await yts(query);
const data = search.videos[0];

if (!data) {
return socket.sendMessage(sender,{
text:`❌ NO RESULTS\n\n*No results found*`
},{quoted:msg});
}

await socket.sendMessage(sender,{react:{text:"⬇️",key:msg.key}})

const apiUrl = `https://lakiya-api-site.vercel.app/api/youtube/mp3?url=${encodeURIComponent(data.url)}`;

const response = await axios.get(apiUrl);
const api = response.data;

if (!api.status || !api.result?.download_url) {
throw new Error("Download URL not found");
}

const downloadLink = api.result.download_url;

const caption = `
> *DOWNLOADED*
╭⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎╮
│ ▢ *Title* : ${data.title}
│ ▢ *Duration* : ${data.timestamp}
│ ▢ *Quality* : 128kbps
│ ▢ *URL* : ${data.url}
╰⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍╯
╭═════════════❖
│ ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 PRIVATE DOWNLOADER
╰═════════════❖
🐦‍🔥 *─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 PRIVATE*`;

await socket.sendMessage(sender,{
image:{url:data.thumbnail},
caption:caption
},{quoted:msg});

await socket.sendMessage(sender,{
audio:{url:downloadLink},
mimetype:"audio/mpeg",
fileName:`${data.title.replace(/[^a-zA-Z0-9]/g,"_")}.mp3`
},{quoted:msg});

await socket.sendMessage(sender,{react:{text:"✅",key:msg.key}})

} catch(e){
console.log(e)
socket.sendMessage(sender,{
text:`❌ ERROR\n\n${e.message}`
},{quoted:msg})
}

}
break;
		
		case 'song':
  
const yts = require('yt-search');
  const axios = require('axios');
    if (!args.length) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n*Need YouTube URL or Song Title*'
        }, { quoted: msg });
        break;
    }

    const songQuery2 = args.join(' ');
    
    try {
        const search = await yts(songQuery2);
        const data = search.videos[0];

        if (!data) {
            await socket.sendMessage(sender, {
                text: '❌ NO RESULTS\n\n*No results found*'
            }, { quoted: msg });
            break;
        }

        const url = data.url;
        
        function extractVideoId(url) {
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/,
                /youtube\.com\/embed\/([^/?]+)/,
                /youtube\.com\/v\/([^/?]+)/
            ];
            
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) return match[1];
            }
            
            if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
                return url;
            }
            
            throw new Error('Could not extract video ID from URL');
        }

        const videoId = extractVideoId(url);
        
        const desc = 
            `
> *DOWNLOADED*
╭⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎╮
│ ▢ *title* : ${data.title || 'Not available'}
│ ▢ *duration* : ${data.timestamp || 'N/A'}
│ ▢ *quality* : 128kbps
│ ▢ *url* : ${data.url}
╰⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍╯
╭═════════════❖
│ ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐩𝐫𝐢𝐯𝐚𝐭𝐞 DOWNLODER
╰═════════════❖
▢ 01 : 📍DOCUMENT 
▣ 02 : 📍AUDIO
▢ 03 : 📍VOICE NOTE

🐦‍🔥 *─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐩𝐫𝐢𝐯𝐚𝐭𝐞*`
        
        const sentMsg = await socket.sendMessage(sender, {
            image: { url: data.thumbnail },
            caption: desc
        }, { quoted: msg });

        const sessionId = Date.now().toString();

        const listener = async (messageUpdate) => {
            const mek = messageUpdate.messages[0];
            if (!mek.message) return;

          
            const isReplyToSentMsg = mek.message.extendedTextMessage && 
                mek.message.extendedTextMessage.contextInfo?.stanzaId === sentMsg.key.id;

            if (isReplyToSentMsg) {
                const messageType = mek.message.conversation || mek.message.extendedTextMessage?.text;
                
              
                if (['1', '2', '3'].includes(messageType)) {
                    
                    await socket.sendMessage(sender, { react: { text: '⬇️', key: mek.key } });

                    try {
                        const apiUrl = `https://lakiya-api-site.vercel.app/api/youtube/mp3?url=https%3A%2F%2Fyoutu.be%2F${videoId}`;
                        
                        const response = await axios.get(apiUrl);
                        const apiResponse = response.data

                        if (!apiResponse.status || !apiResponse.result || !apiResponse.result.download_url) {
                            throw new Error('Failed to get download URL from API');
                        }

                        const downloadLink = apiResponse.result.download_url;
                        await socket.sendMessage(sender, { react: { text: '⬆️', key: mek.key } });

                        if (messageType === '2') {
                            await socket.sendMessage(sender, {
                                audio: { url: downloadLink },
                                mimetype: 'audio/mpeg'
                            }, { quoted: mek });
                        } else if (messageType === '1') {
                            await socket.sendMessage(sender, {
                                document: { url: downloadLink },
                                mimetype: 'audio/mp3',
                                fileName: `${data.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`
                            }, { quoted: mek });
                        } else if (messageType === '3') {
    await socket.sendMessage(sender, {
        audio: { url: downloadLink },
        ptt: true
    }, { quoted: mek });
																   }
                        

                    } catch (error) {
                        console.error('Download error:', error.message);
                        await socket.sendMessage(sender, {
                            text: `❌ ERROR\n\n*Failed to download*: ${error.message}`
                        }, { quoted: mek });
                    }
                }
            }
        };

        
        socket.ev.on('messages.upsert', listener);


        
        setTimeout(() => {
            socket.ev.off('messages.upsert', listener);
            console.log('Listener removed for session:', sessionId);
        }, 5 * 60 * 1000); 

    } catch (error) {
        console.error('Song command error:', error.message);
        await socket.sendMessage(sender, {
            text: `❌ ERROR\n\n*Error occurred*: ${error.message}`
        }, { quoted: msg });
    }
    break;
		//❄==============❄===============🌹
		case 'songdl': {
if (!text) return reply('❌ Give YouTube URL or Song Name');

try {

const isValidYouTubeUrl = (url) => {
return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
};

let videoUrl = text;
let searchData = null;

if (!isValidYouTubeUrl(text)) {
const search = await yts(text);
if (!search.videos.length) return reply('❌ No results found');

searchData = search.videos[0];
videoUrl = searchData.url;
}

const api = `https://lakiya-api-site.vercel.app/api/youtube/mp3?url=${encodeURIComponent(videoUrl)}`;
const res = await axios.get(api);

if (!res.data.status) return reply('❌ API Error');

const data = res.data.result;

const caption = `
🎵 *PABLO MUSIC DOWNLOADER*

╭──────────────
🎧 *Title:* ${data.title}
📺 *Channel:* ${data.channel}
⏱️ *Duration:* ${data.duration || 'N/A'}
👀 *Views:* ${searchData?.views?.toLocaleString() || 'N/A'}
📅 *Uploaded:* ${searchData?.ago || 'N/A'}
╰──────────────

📥 *Reply Number To Download*

1️⃣ Audio File  
2️⃣ Document File  
3️⃣ Voice Note
`;

const sentMsg = await socket.sendMessage(from,{
image:{url:data.thumbnail},
caption:caption
},{quoted:msg});

const listener = async (m) => {

const mek = m.messages[0];
if (!mek.message) return;

const replyText =
mek.message.conversation ||
mek.message.extendedTextMessage?.text;

const isReply =
mek.message.extendedTextMessage?.contextInfo?.stanzaId === sentMsg.key.id;

if (!isReply) return;

if (!['1','2','3'].includes(replyText)) return;

await socket.sendMessage(from,{react:{text:'⬇️',key:mek.key}});

try {

if(replyText === '1'){

await socket.sendMessage(from,{
audio:{url:data.download_url},
mimetype:'audio/mpeg'
},{quoted:mek})

}

if(replyText === '2'){

await socket.sendMessage(from,{
document:{url:data.download_url},
mimetype:'audio/mpeg',
fileName:data.filename || "song.mp3"
},{quoted:mek})

}

if(replyText === '3'){

await socket.sendMessage(from,{
audio:{url:data.download_url},
mimetype:'audio/mpeg',
ptt:true
},{quoted:mek})

}

await socket.sendMessage(from,{react:{text:'✅',key:mek.key}})

socket.ev.off('messages.upsert', listener)

}catch(e){
console.log(e)
reply('❌ Download Failed')
socket.ev.off('messages.upsert', listener)
}

}

socket.ev.on('messages.upsert', listener)

}catch(e){
console.log(e)
reply('❌ Error occurred')
}

}
break;

//====================================================================================//

		
 case 'status':
case 'p':
case 'system': {
    try {
        const formatUptime = (seconds) => {
            const d = Math.floor(seconds / 86400);
            const h = Math.floor((seconds % 86400) / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
        };

        const formatBytes = (bytes) => {
            if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
            if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + ' MB';
            return (bytes / 1024).toFixed(2) + ' KB';
        };

        const uptimeStr = formatUptime(os.uptime());
        const botUptimeStr = formatUptime(process.uptime());
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const ramUsage = ((usedMem / totalMem) * 100).toFixed(1);
        const ping = Date.now() - msg.messageTimestamp * 1000;

        // --- Fake Contact Card Data ---
        const vcard = 'BEGIN:VCARD\n' 
                    + 'VERSION:3.0\n' 
                    + 'FN:Mata AI System\n' 
                    + 'ORG:Mata AI Labs;\n' 
                    + 'TEL;type=CELL;type=VOICE;waid=94789088223:+94 78 908 8223\n' 
                    + 'END:VCARD';

        const statusText = `*✨ SYSTEM STATUS ✨*

*🚀 Performance*
• *Ping*       : \`${ping < 0 ? '0' : ping} ms\`
• *Bot Uptime* : \`${botUptimeStr}\`
• *Host Uptime* : \`${uptimeStr}\`

*💲 Memory Usage*
• *Used*  : \`${formatBytes(usedMem)}\`
• *Free*  : \`${formatBytes(freeMem)}\`
• *Total*  : \`${formatBytes(totalMem)}\`
• *Load* : \`[ ${ramUsage}% ]\`

*🗽 Server Info*
• *Platform* : \`${os.platform()}\`
• *Arch*     : \`${os.arch()}\`

> ${footer}`;

        // Send Message as a Fake Document with Contact Info
        await socket.sendMessage(from, {
            document: { url: 'https://files.catbox.moe/78epgc.jpeg' }, // පින්තූරය Document එකක් ලෙස යවයි
            fileName: '🍃𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄', // කැමති නමක් දෙන්න
            mimetype: 'application/pdf',
            fileLength: 99999999999999, // Fake size
            caption: statusText,
            contextInfo: {
                externalAdReply: {
                    title: "SYSTEM ONLINE ⚡",
                    body: "🍃PABLO RESPONSING...",
                    thumbnailUrl: "https://files.catbox.moe/78epgc.jpeg",
                    sourceUrl: "https://github.com/codersdew",
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                mentionedJid: [sender],
                forwardingScore: 999,
                isForwarded: true,
                quotedMessage: {
                    contactMessage: {
                        displayName: 'PABLO AI',
                        vcard: vcard
                    }
                }
            }
        }, { quoted: msg });

    } catch (error) {
        console.error('Status command error:', error);
        await socket.sendMessage(from, { text: `⚠️ Error: ${error.message}` });
    }
    break;
}

		case 'tourl':
case 'url':
case 'upload': {
    const axios = require('axios');
    const FormData = require('form-data');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    const mime = quoted?.quotedMessage?.imageMessage?.mimetype || 
                 quoted?.quotedMessage?.videoMessage?.mimetype || 
                 quoted?.quotedMessage?.audioMessage?.mimetype || 
                 quoted?.quotedMessage?.documentMessage?.mimetype;

    if (!quoted || !mime) {
        return await socket.sendMessage(sender, { text: '❌ *Please reply to an image or video.*' });
    }

    // Fake Quote for Style
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
        message: { contactMessage: { displayName: "BESTIE MEDIA UPLOADER", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Catbox\nORG:Upload Service\nEND:VCARD` } }
    };

    let mediaType;
    let msgKey;
    
    if (quoted.quotedMessage.imageMessage) {
        mediaType = 'image';
        msgKey = quoted.quotedMessage.imageMessage;
    } else if (quoted.quotedMessage.videoMessage) {
        mediaType = 'video';
        msgKey = quoted.quotedMessage.videoMessage;
    } else if (quoted.quotedMessage.audioMessage) {
        mediaType = 'audio';
        msgKey = quoted.quotedMessage.audioMessage;
    } else if (quoted.quotedMessage.documentMessage) {
        mediaType = 'document';
        msgKey = quoted.quotedMessage.documentMessage;
    }

    try {
        // Using existing downloadContentFromMessage
        const stream = await downloadContentFromMessage(msgKey, mediaType);
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const ext = mime.split('/')[1] || 'tmp';
        const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFilePath, buffer);

        const form = new FormData();
        form.append('fileToUpload', fs.createReadStream(tempFilePath));
        form.append('reqtype', 'fileupload');

        const response = await axios.post('https://catbox.moe/user/api.php', form, { 
            headers: form.getHeaders() 
        });

        fs.unlinkSync(tempFilePath); // Cleanup

        const mediaUrl = response.data.trim();
        const fileSize = (buffer.length / 1024 / 1024).toFixed(2) + ' MB';
        const typeStr = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

        const txt = `
🔗 *MEDIA UPLOADER*

📂 *Type:* ${typeStr}
📊 *Size:* ${fileSize}

🚀 *Url:* ${mediaUrl}

${footer}`;

        await socket.sendMessage(sender, { 
            text: txt,
            contextInfo: {
                externalAdReply: {
                    title: "Media Uploaded Successfully!",
                    body: "Click to view media",
                    thumbnailUrl: mediaUrl.match(/\.(jpeg|jpg|gif|png)$/) ? mediaUrl : "https://files.catbox.moe/78epgc.jpeg",
                    sourceUrl: mediaUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error uploading media.*' });
    }
}
break;
case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[�^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}


case 'hidetag': {
    try {
        // 1. Group Check
        if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

        // 2. Admin Check (Optional: Remove if you want everyone to use it)
        const groupMetadata = await socket.groupMetadata(from);
        const participants = groupMetadata.participants || [];
        const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderId = msg.key.participant || msg.key.remoteJid;
        
        const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
        const isAdmin = groupAdmins.includes(senderId);
        const isBotAdmin = groupAdmins.includes(botNumber);

        if (!isAdmin) return await socket.sendMessage(sender, { text: '❌ Only Admins can use hidetag.' }, { quoted: msg });

        // 3. Prepare Mentions
        const mentions = participants.map(p => p.id || p.jid);
        
        // 4. Get Text (Message Content)
        // If user typed text after command, use it. Otherwise use a default text.
        const text = args.join(' ') || '📢 Hidden Announcement';

        // 5. Load Config for Fake Card
        const sanitized = (sender || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

        // Fake Meta Quote Card
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_HIDETAG" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName}\nFN:${botName}\nEND:VCARD` } }
        };

        // 6. Handling Message Type (Text vs Image)
        // Check if the command is sent with an image (Caption)
        const isImage = msg.message?.imageMessage;
        
        if (isImage) {
            // If replying to image or sending image with caption
            // Note: Re-sending quoted image needs download logic. 
            // For simplicity, this handles if you ATTACH image with command.
            
            // But if you just want to send TEXT hidetag:
            await socket.sendMessage(from, { 
                text: text, 
                mentions: mentions 
            }, { quoted: metaQuote });

        } else {
            // Normal Text Hidetag
            await socket.sendMessage(from, { 
                text: text, 
                mentions: mentions // <--- This does the magic (Hidden Tag)
            }, { quoted: metaQuote });
        }

    } catch (err) {
        console.error('hidetag error', err);
        await socket.sendMessage(sender, { text: '❌ Error running hidetag.' }, { quoted: msg });
    }
    break;
}



    case 'gdrive': {
    try {
        const text = args.join(' ').trim();
        if (!text) return await socket.sendMessage(sender, { text: '⚠️ Please provide a Google Drive link.\n\nExample: `.gdrive <link>`' }, { quoted: msg });

        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        // 🔹 Meta AI fake contact mention
        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GDRIVE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        // 🔹 Fetch Google Drive file info
        const res = await axios.get(`https://saviya-kolla-api.koyeb.app/download/gdrive?url=${encodeURIComponent(text)}`);
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch file info.' }, { quoted: botMention });

        const file = res.data.result;

        // 🔹 Send as document
        await socket.sendMessage(sender, {
            document: { 
                url: file.downloadLink, 
                mimetype: file.mimeType || 'application/octet-stream', 
                fileName: file.name 
            },
            caption: `📂 *File Name:* ${file.name}\n💾 *Size:* ${file.size}\n\n_Provided by ${botName}_`,
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: botMention });

    } catch (err) {
        console.error('GDrive command error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Google Drive file.' }, { quoted: botMention });
    }
    break;
}


case 'adanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n📅 Date: ${n.date}\n⏰ Time: ${n.time}\n\n${n.desc}\n\n🔗 [Read more](${n.url})\n\n_Provided by ${botName}_`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('adanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: botMention });
  }
  break;
}

//===============================================================================================================//

    case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        const axios = require("axios");

        
        let text = (args.join(' ') || '').trim();
        
        if (!text || !text.startsWith('https://')) {
            return await socket.sendMessage(sender, {
                text: "❌ *Please provide a valid TikTok Link!*"
            }, { quoted: msg });
        }

        // 2. Bot Name Config
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '𝐁𝐄𝐒𝐓𝐈𝐄';

        // 3. Reaction
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        // 4. API Request
        const apiRes = await axios.get("https://www.movanest.xyz/v2/tiktok", {
            params: { url: text }
        });

        if (!apiRes.data.status || !apiRes.data.results) {
            return await socket.sendMessage(sender, { text: "❌ *TikTok Video Not Found!*" }, { quoted: msg });
        }

        const result = apiRes.data.results;
        
       
        const captionMessage = `
╭───「 *${botName}* 」───◆
│ 👤 *𝐀𝐮𝐭𝐡𝐨𝐫:* ${result.author_nickname || "Unknown"}
│ 📝 *𝐃𝐞𝐬𝐜:* ${result.desc || "No Description"}
│ 👁️ *𝐕𝐢𝐞𝐰𝐬:* ${result.play_count || "N/A"}
│ 🔄 *𝐒𝐡𝐚𝐫𝐞𝐬:* ${result.share_count || "N/A"}
╰───────────────────────◆

 *ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʏᴘᴇ*
 
  * *▣ 01: 📍NO WATERMARK*
  * *▣ 02: 📍WITH WATERMARK*
  * *▣ 03: 📍AUDIO FILE*
  * *▣ 04: 📍VIDEO FILE* `;

       
        const buttons = [
            { buttonId: 'tt_nw', buttonText: { displayText: '🎬 NO WATERMARK' }, type: 1 },
            { buttonId: 'tt_wm', buttonText: { displayText: '💧 WITH WATERMARK' }, type: 1 },
            { buttonId: 'tt_audio', buttonText: { displayText: '🎵 AUDIO FILE' }, type: 1 },
            { buttonId: 'tt_ptv', buttonText: { displayText: '📹 VIDEO NOTE' }, type: 1 }
        ];

     
        const buttonMessage = {
            image: { url: result.cover || result.thumbnail || "https://files.catbox.moe/78epgc.jpeg" },
            caption: captionMessage,
            footer: `${footer}`,
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    title: "🎵 𝐓𝐈𝐊 𝐓𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑",
                    body: "𝐝𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐢𝐧𝐠 𝐟𝐢𝐥𝐞...",
                    thumbnailUrl: result.cover || result.thumbnail,
                    sourceUrl: text,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        };

        const sentMessage = await socket.sendMessage(sender, buttonMessage, { quoted: msg });
        const messageID = sentMessage.key.id;

    
        const handleTikTokSelection = async ({ messages: replyMessages }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const selectedId = replyMek.message.buttonsResponseMessage?.selectedButtonId || 
                               replyMek.message.templateButtonReplyMessage?.selectedId || 
                               replyMek.message.conversation || 
                               replyMek.message.extendedTextMessage?.text;

            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID || 
                                     replyMek.message.buttonsResponseMessage?.contextInfo?.stanzaId === messageID;

            if (isReplyToSentMsg && sender === replyMek.key.remoteJid) {
                
                await socket.sendMessage(sender, { react: { text: '⬇️', key: replyMek.key } });

                let mediaBuffer;
                let mimeType = 'video/mp4';
                let isPtv = false;
                let finalCaption = '';
                let downloadUrl = '';

                try {
                    switch (selectedId) {
                        case 'tt_nw':
                        case '1':
                            downloadUrl = result.no_watermark;
                            finalCaption = `╭──「 *NO WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_wm':
                        case '2':
                            downloadUrl = result.watermark;
                            finalCaption = `╭──「 *WITH WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_audio':
                        case '3':
                            downloadUrl = result.music;
                            mimeType = 'audio/mpeg';
                            break;
                        case 'tt_ptv':
                        case '4':
                            downloadUrl = result.no_watermark;
                            isPtv = true;
                            break;
                        default:
                            return; 
                    }

                    if (!downloadUrl) throw new Error("URL Missing");

                  
                    const bufferRes = await axios.get(downloadUrl, {
                        responseType: 'arraybuffer',
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });
                    mediaBuffer = Buffer.from(bufferRes.data);

                    if (mediaBuffer.length > 100 * 1024 * 1024) {
                         return await socket.sendMessage(sender, { text: '❌ File too large (>100MB)!' }, { quoted: replyMek });
                    }

                    
                    let msgContent = {};
                    if (mimeType === 'audio/mpeg') {
                        msgContent = { audio: mediaBuffer, mimetype: mimeType, ptt: false }; // Audio
                    } else if (isPtv) {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, ptv: true }; // Video Note
                    } else {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, caption: finalCaption }; // Normal Video
                    }

                    await socket.sendMessage(sender, msgContent, { quoted: replyMek });
                    await socket.sendMessage(sender, { react: { text: '✅', key: replyMek.key } });

                } catch (err) {
                    console.log(err);
                    await socket.sendMessage(sender, { text: '❌ Download Failed!' }, { quoted: replyMek });
                }

                socket.ev.removeListener('messages.upsert', handleTikTokSelection);
            }
        };

        socket.ev.on('messages.upsert', handleTikTokSelection);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
    break;
}

//===============================================================================================================//
case 'fb':
case 'fbdl':
case 'facebook':
case 'fbd': {
    try {
        // 1. input එක ලබා ගැනීම සහ පිරිසිදු කිරීම
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        let args = text.split(" ");
        let url = args[1];

        if (!url || !url.includes('facebook.com')) {
            return await socket.sendMessage(sender, { 
                text: '🚫 *PLEASE ENTER A VALID URL*\n\nEX: .fb <url>' 
            }, { quoted: msg });
        }

        // 2. User Config ලබා ගැනීම
        const userNumber = sender.replace(/[^0-9]/g, ''); // sender භාවිතා කිරීම වඩාත් නිවැරදි වීමට ඉඩ ඇත
        let cfg = await loadUserConfigFromMongo(userNumber) || {};
        let botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎';

        // 3. Fake contact එක සකස් කිරීම
        const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_FB" },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
                }
            }
        };

        // 4. API Call එක (axios ඉහළින් import කර ඇති බව සිතමු)
        const axios = require('axios'); // මෙය code එකේ මුලට දැමීම නිර්දේශ කරයි
        let api = `https://tharuzz-ofc-api-v2.vercel.app/api/download/fbdl?url=${encodeURIComponent(url)}`;
        let response = await axios.get(api);
        let data = response.data;

        if (!data || !data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *UNFINDED RESULT*' }, { quoted: msg });
        }

        let title = data.result.title || 'Facebook Video';
        let thumb = data.result.thumbnail;
        // Optional Chaining (?.) භාවිතා කර ඇති නිසා undefined වුවත් error එකක් එන්නේ නැත
        let hdLink = data.result.dlLink?.hdLink || data.result.dlLink?.sdLink;

        if (!hdLink) {
            return await socket.sendMessage(sender, { text: '⚠️ *UNFINDED LINK.*' }, { quoted: msg });
        }

        // 5. Thumbnail එක යැවීම
        await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: `🎥 *${title}*\n\n*📥 𝐃ownloading...*\n*𝐏owered 𝐁y ${botName}*`
        }, { quoted: shonux });

        // 6. Video එක යැවීම
        await socket.sendMessage(sender, {
            video: { url: hdLink },
            caption: `🎥 *${title}*\n\n*✅ 𝐃ownloaded 𝐁y ${botName}*\n*${footer}*`,
            mimetype: 'video/mp4' // පැහැදිලිව mimetype එක සඳහන් කිරීම හොඳය
        }, { quoted: shonux });

    } catch (e) {
        console.error('FB Download Error:', e);
        await socket.sendMessage(sender, { text: '⚠️ *API ERR*' });
    }
}
break;

//===============================================================================================================//
    case 'play': {
  const yts = require('yt-search');
  const axios = require('axios');
  const apikey = "dew_EtVuyJGtlCzvZY44TP6MbXpPlAltC6VH2uGOPAJL";
  const apibase = "https://api.srihub.store";

  const q = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    "";

  if (!q.trim()) {
    return await socket.sendMessage(sender, { 
      text: '*සිංදුද ඕන ඔයාට, කියන්නකෝ නමක් 🥲*' 
    }, { quoted: msg });
  }

  const extractYouTubeId = (url) => {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const normalizeYouTubeLink = (str) => {
    const id = extractYouTubeId(str);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  };

  try {
   
    await socket.sendMessage(sender, { 
      react: { text: "📍", key: msg.key } 
    });

    let videoUrl = normalizeYouTubeLink(q.trim());
    let found;
    
    if (!videoUrl) {
      const search = await yts(q.trim());
      found = search?.videos?.[0];

      if (!found) {
        return await socket.sendMessage(sender, {
          text: "*❌ සිංදුව හරියටම ගැහැව්වද බං බලපන්*"
        }, { quoted: msg });
      }
      videoUrl = found.url;
    } else {
      // URL details
      const search = await yts({ videoId: extractYouTubeId(videoUrl) });
      found = search;
    }

    const api = `${apibase}/download/ytmp3?apikey=${apikey}&url=${encodeURIComponent(videoUrl)}`;
    const get = await axios.get(api).then(r => r.data).catch(() => null);

    if (!get?.result) {
      return await socket.sendMessage(sender, {
        text: "*API is is down or response error.*"
      }, { quoted: msg });
    }

    const { download_url, title, thumbnail, duration } = get.result;
    
    const caption = `🎶 *Title:* ${title}\n⏱️ *Duration:* ${duration || 'N/A'}\n🔗 *Link:* ${videoUrl}\n\n*එයි එයි ඕක 𝙬𝙖𝙞𝙩...*`;

    
    await socket.sendMessage(sender, {
      image: { url: thumbnail },
      caption: caption
    }, { quoted: msg });

    
    await socket.sendMessage(sender, {
      audio: { url: download_url },
      mimetype: "audio/mpeg",
      fileName: `${title}.mp3`,
      contextInfo: {
        externalAdReply: {
          title: title,
          body: `Duration: ${duration}`,
          thumbnailUrl: thumbnail,
          sourceUrl: videoUrl,
          mediaType: 1,
          renderLargerThumbnail: false 
        }
      }
    }, { quoted: msg });

    
    await socket.sendMessage(sender, { 
      react: { text: '✅', key: msg.key } 
    });

  } catch (err) {
    console.error('Song error:', err);
    await socket.sendMessage(sender, { 
      text: "*❌ something went wrong!*" 
    }, { quoted: msg });
  }
  break;
}

//===============================================================================================================//

    case 'list':
case 'pannel':
case 'menu': {
    
    const ownerName = socket.user?.name || 'KEZU BRO';
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // Menu captions
    const menuCaption = `
> WELCOME TO ${botName} 
╭━━━━━━━━━━━━━━━╮
┃ *▣𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 2026▣*
╰━━━━━━━━━━━━━━━╯
🤍 𝐇𝐄𝐋𝐋𝐎 ${pushname}
╭━──────────❖
┃ ❤️ 𝐒𝐘𝐒𝐓𝐄𝐌 
┃ ❄ \`Uptime\` : ${hours}h ${minutes}m ${seconds}s
┃ ⚛️ \`prefix\` : ${prefix}
┃ 🇱🇰 \`person\` : ${ownerName}
┃ 🤍 \`platform\` : PLUTO
╰━──────────❖
╭━━━━━━━━━━━━━╮
┃❖乂 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ☠️ツ❖
╰━━━━━━━━━━━━━╯
📍 *2026* 
*PLABO MD 2026 | CREATED BY KEZU*
╭───────────────────╮
> https://whatsapp.com/channel/0029Vb4uURW84OmD7Nxjbx2q
╰───────────────────╯
╭───────────────❖
┃♻️ _*DOWNLOADS*_
┃🍃  ${config.PREFIX}song
┃🍃  ${config.PREFIX}play
┃🍃  ${config.PREFIX}tiktok
┃🍃  ${config.PREFIX}facebook
┃🍃  ${config.PREFIX}apk
┃🍃  ${config.PREFIX}apks
┃🍃  ${config.PREFIX}gdrive
┃🍃  ${config.PREFIX}url/tourl
┃🍃  ${config.PREFIX}short
╰───────────────🔹
╭───────────────🔹
┃♻️ _*GENERAL*_
┃🍃  ${config.PREFIX}vv
┃🍃  ${config.PREFIX}save 
┃🍃  ${config.PREFIX}git
┃🍃  ${config.PREFIX}owner
┃🍃  ${config.PREFIX}system
┃🍃  ${config.PREFIX}ping / alive
┃🍃  ${config.PREFIX}block / unblock
┃🍃  ${config.PREFIX}jid / cid
┃🍃  ${config.PREFIX}groupjid
┃🍃  ${config.PREFIX}hidetag
┃🍃  ${config.PREFIX}tagall
┃🍃  ${config.PREFIX}online
┃🍃  ${config.PREFIX}savecontact
┃🍃  ${config.PREFIX}grouplink
┃🍃  ${config.PREFIX}getdp
╰───────────────❖

${footer}`;

  await socket.sendMessage(m.chat, {
            caption: menuCaption,
            headerType: 1,
            document: _dewDocBuffer || fs.readFileSync(__dirname + '/data/xion.docx'),
            fileName: "♻️ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈",
            mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileLength: 99999999999999,
            pageCount: 2026, 
            contextInfo: contextInfo3
        }, { quoted: myquoted });

    break;
}

case 'alive': {
    const ownerName = socket.user?.name || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 BRO';
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const time = moment().tz('Asia/Colombo').format('HH:mm:ss');
    const date = moment().format('DD/MM/YYYY');

    const captionText = `
*┃* ♻️ *HELLO* :
> ${pushname}
*┃*📅 \`Date\` : ${date}      
*┃*🕒 \`Time\` : ${time}
♥ \`Owner\` : _*KEZU*_
🤍 \`Prefix\` : ${prefix}
♥ \`Uptime\` : ${hours}h ${minutes}m ${seconds}s

join with us : https://whatsapp.com/channel/0029Vb4uURW84OmD7Nxjbx2q
${footer}`;
    // ✅ Send reaction to the user's command message
    await socket.sendMessage(m.chat, {
        react: {
            text: '📍',       // The emoji to react with
            key: msg.key     // The message to react to
        }
    });
    await socket.sendMessage(m.chat, {
        headerType: 1,
        document: _dewDocBuffer || fs.readFileSync(__dirname + '/data/xion.docx'),
        fileName: "─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileLength: 99999999999999,
        pageCount: 2026, 
        caption: `${captionText}`,
        contextInfo: contextInfo3
    }, { quoted: myquoted });
break;
}


case "online":
case "ranuonline":
case "onlinemembers":
case "onlinep":
case "onlinepeoples":
case "active": {
    try {
        if (!isGroup) return reply("*❌ This command can only be used in a group!*");

        // Fetch metadata and check for admin status here
        const groupMetadata = await socket.groupMetadata(from);
        const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
        const isAdmins = groupAdmins.includes(nowsender);

        // Check if user is either creator or admin
        if (!isOwner && !isAdmins && !msg.key.fromMe) {
            return reply("🚫 *Owner & Admins Only Command!*");
        }

        // Inform user that we're checking
        await reply("🔄 Scanning for online members... This may take 15-20 seconds.");
        const onlineMembers = new Set();
        const groupData = await socket.groupMetadata(from);
        const presencePromises = [];

        // Request presence updates for all participants
        for (const participant of groupData.participants) {
            presencePromises.push(
                socket.presenceSubscribe(participant.id)
                    .then(() => {
                        // Additional check for better detection
                        return socket.sendPresenceUpdate('composing', participant.id);
                    })
            );
        }

        await Promise.all(presencePromises);

        // Presence update handler
        const presenceHandler = (json) => {
            for (const id in json.presences) {
                const presence = json.presences[id]?.lastKnownPresence;
                // Check all possible online states
                if (['available', 'composing', 'recording', 'online'].includes(presence)) {
                    onlineMembers.add(id);
                }
            }
        };

        socket.ev.on('presence.update', presenceHandler);

        // Set a timeout to gather presence data
        setTimeout(async () => {
            socket.ev.off('presence.update', presenceHandler);

            if (onlineMembers.size === 0) {
                return reply("⚠️ Couldn't detect any online members. They might be hiding their presence.");
            }

            const onlineArray = Array.from(onlineMembers);
            const onlineList = onlineArray.map((member, index) =>
                `${index + 1}. @${member.split('@')[0]}`
            ).join('\n');

            const message = `💖 *Online Members* (${onlineArray.length}/${groupData.participants.length}):\n\n${onlineList}\n\n${footer}`;

            await socket.sendMessage(from, {
                text: message,
                mentions: onlineArray
            }, { quoted: myquoted });
        }, 20000); // Wait for 20 seconds

    } catch (e) {
        console.error("Error in online command:", e);
        reply(`An error occurred: ${e.message}`);
    }
    break;
}
// ======================Owner Commands===================================


case 'apksearch':
case 'apks':
case 'apkfind': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an app name to search.*\n\nExample: .apksearch whatsapp',
                
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching APKs...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/search/apksearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result || !data.result.length) {
            return await socket.sendMessage(sender, { text: '*❌ No APKs found for your query.*' }, { quoted: shonux });
        }

        // 🔹 Format results
        let message = `🔍 *APK Search Results for:* ${query}\n\n`;
        data.result.slice(0, 20).forEach((item, idx) => {
            message += `*${idx + 1}.* ${item.name}\n➡️ ID: \`${item.id}\`\n\n`;
        });
        message += `${footer}`;

        // 🔹 Send results
        await socket.sendMessage(sender, {
            text: message,
            
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK search:", err);

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}

    
case 'tagall': {
  try {
    if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

    let gm = null;
    try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
    if (!gm) return await socket.sendMessage(sender, { text: '❌ Failed to fetch group info.' }, { quoted: msg });

    const participants = gm.participants || [];
    if (!participants.length) return await socket.sendMessage(sender, { text: '❌ No members found in the group.' }, { quoted: msg });

    const text = args && args.length ? args.join(' ') : '📢 Announcement';

    let groupPP = `${logo}`;
    try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

    const mentions = participants.map(p => p.id || p.jid);
    const groupName = gm.subject || 'Group';
    const totalMembers = participants.length;

    const emojis = ['📍','🫟','🍃'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    let caption = `╭──❰ *📛 ANNOUNCEMENT* ❱──╮\n`;
    caption += `│ 📌 *Group:* ${groupName}\n`;
    caption += `│ 👥 *Members:* ${totalMembers}\n`;
    caption += `│ 💬 *Message:* ${text}\n`;
    caption += `╰──────────────────╯\n\n`;
    caption += `📍 *Mentioning all members:*\n\n`;
    for (const m of participants) {
      const id = (m.id || m.jid);
      if (!id) continue;
      caption += `${randomEmoji} @${id.split('@')[0]}\n`;
    }
    caption += `\n${footer}`;

    try {
        await socket.sendMessage(from, {
            image: { url: groupPP },
            caption,
            mentions,
        }, { quoted: myquoted });
    } catch (imgErr) {
        await socket.sendMessage(from, {
            text: caption,
            mentions,
        }, { quoted: myquoted });
    }

  } catch (err) {
    console.error('tagall error', err);
    await socket.sendMessage(sender, { text: '❌ Error running tagall.' }, { quoted: msg });
  }
  break;
}

case 'cinfo':
case 'channelinfo':
case 'cid': {
    try {
        // 🔹 Extract query text from message
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { text: "❎ Please provide a WhatsApp Channel link.\n\nUsage: .cid <link>" });

        // 🔹 Extract Channel invite ID from link (flexible regex)
        const match = q.match(/https?:\/\/(www\.)?whatsapp\.com\/channel\/([\w-]+)/i);
        if (!match) return await socket.sendMessage(sender, { text: "⚠️ Invalid channel link!" });

        const inviteId = match[2];

        // 🔹 Fetch Channel Metadata
        let metadata;
        try {
            metadata = await socket.newsletterMetadata("invite", inviteId);
        } catch (err) {
            console.error("❌ Failed to fetch metadata via invite:", err);
            return await socket.sendMessage(sender, { text: "⚠️ Could not fetch channel metadata. Maybe the link is private or invalid." });
        }

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, { text: "❌ Channel not found or inaccessible." });
        }

        // 🔹 Prepare preview image
        let previewUrl = metadata.preview
            ? metadata.preview.startsWith("http") 
                ? metadata.preview 
                : `https://pps.whatsapp.net${metadata.preview}`
            : "https://telegra.ph/file/4cc2712eaba1c5c1488d3.jpg"; // default image

        // 🔹 Format followers and creation date
        const followers = metadata.subscribers?.toLocaleString() || "Unknown";
        const createdDate = metadata.creation_time 
            ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
            : "Unknown";

        // 🔹 Format message
        const infoMsg = `*🚨 ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 MD Channel Info 🚨*\n\n`
                      +`🆔 ID: ${metadata.id}\n`
                      +`📌 Name: ${metadata.name || "Unknown"}\n`
                      +`📝 Description: ${metadata.desc?.toString() || "No description"}\n`
                      +`👥 Followers: ${followers}\n`
                      +`📅 Created: ${createdDate}\n\n`
                      +`${footer}`;
        // 🔹 Send message with preview image
        await socket.sendMessage(sender, {
            image: { url: previewUrl },
            caption: infoMsg,
            ...(contextInfo ? { contextInfo } : {})
        }, { quoted: m });

    } catch (e) {
        console.error("❌ CID Command Error:", e);
        await socket.sendMessage(sender, { text: "⚠️ Error fetching channel details." });
    }
    break;
}


// WhatsApp JID Command - Get JID of a User - Last Update 2025-August-17
case 'jid': {
    // Get user number from JID
    const userNumber = sender.split('@')[0]; // Extract number only

    await socket.sendMessage(sender, { 
        react: { 
            text: "🆔", // Reaction emoji
            key: msg.key 
        } 
    });
    
    await socket.sendMessage(sender, {
        text: `  🈸 *─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 MD JID INFO* 🈸\n\n🆔 *Chat JID:* ${sender}\n\n${footer}`.trim(),
        contextInfo: contextInfo 
    }, { quoted: myquoted });

    break;
}

// YouTube Music Downloader Command - Download Music from YouTube - Last Update 2025-August-14
case 'song2': {
  const yts = require('yt-search');
  const axios = require('axios');
  const apikey = "dew_EtVuyJGtlCzvZY44TP6MbXpPlAltC6VH2uGOPAJL";
  const apibase = "https://api.srihub.store"

  const q = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    "";

  if (!q.trim()) {
    return await socket.sendMessage(sender, { 
      text: '*Need YouTube URL or Title.*' 
    }, { quoted: msg });
  }

  const extractYouTubeId = (url) => {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const normalizeYouTubeLink = (str) => {
    const id = extractYouTubeId(str);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  };

  try {
    await socket.sendMessage(sender, { 
      react: { text: "🔍", key: msg.key } 
    });

    let videoUrl = normalizeYouTubeLink(q.trim());
    let videoData = null;

    if (!videoUrl) {
      const search = await yts(q.trim());
      const found = search?.videos?.[0];

      if (!found) {
        return await socket.sendMessage(sender, {
          text: "*TEXT OR URL NOT MATCH*"
        }, { quoted: msg });
      }

      videoUrl = found.url;
      videoData = found;
    }

    const api = `${apibase}/download/ytmp3?apikey=${apikey}&url=${encodeURIComponent(videoUrl)}`;
    const get = await axios.get(api).then(r => r.data).catch(() => null);

    if (!get?.result) {
      return await socket.sendMessage(sender, {
        text: "*```API RESPONSE IS BAD ,ERR```*"
      }, { quoted: msg });
    }

    const { download_url, title, thumbnail, duration, quality, views } = get.result;
    
    const videoId = extractYouTubeId(videoUrl);
    const shortUrl = `https://youtu.be/${videoId}`;
    
    const caption = `
> *DOWNLOADED*
╭⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎╮
│ ▢ *title* : ${title}
│ ▢ *duration* : ${duration || 'N/A'}
│ ▢ *quality* : ${quality || '128kbps'}
│ ▢ *url* : ${shortUrl}
╰⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍⚍╯
╭═════════════❖
│ ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐩𝐫𝐢𝐯𝐚𝐭𝐞 DOWNLODER
╰═════════════❖
▢ 01 : 📍DOCUMENT 
▣ 02 : 📍AUDIO
▢ 03 : 📍VOICE NOTE

🐦‍🔥 *─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐩𝐫𝐢𝐯𝐚𝐭𝐞*`;

    // Create simple buttons instead of complex native flow
    const buttons = [
      {
        buttonId: 'song_doc',
        buttonText: { displayText: '📁 𝗗ᴏᴄᴜᴍᴇɴᴛ' },
        type: 1
      },
      {
        buttonId: 'song_audio',
        buttonText: { displayText: '🎵 𝗔ᴜᴅɪᴏ' },
        type: 1
      },
      {
        buttonId: 'song_ptt',
        buttonText: { displayText: '🎤 𝗩ᴏɪᴄᴇ 𝗡ᴏᴛᴇ' },
        type: 1
      }
    ];

    // Send message with image and buttons
    const resMsg = await socket.sendMessage(sender, {
      image: { url: thumbnail },
      caption: caption,
      buttons: buttons,
      headerType: 4,
      viewOnce: false
    }, { quoted: msg });

    // Handler for button responses
    const handler = async (msgUpdate) => {
      try {
        const received = msgUpdate.messages && msgUpdate.messages[0];
        if (!received) return;

        const fromId = received.key.remoteJid || received.key.participant || (received.key.fromMe && sender);
        if (fromId !== sender) return;

        // Check for button response
        const buttonResponse = received.message?.buttonsResponseMessage;
        if (buttonResponse) {
          const contextId = buttonResponse.contextInfo?.stanzaId;
          if (!contextId || contextId !== resMsg.key.id) return;

          const selectedId = buttonResponse.selectedButtonId;

          await socket.sendMessage(sender, { 
            react: { text: "📥", key: received.key } 
          });

          switch (selectedId) {
            case 'song_doc':
              await socket.sendMessage(sender, {
                document: { url: download_url },
                mimetype: "audio/mpeg",
                fileName: `${title.replace(/[^\w\s]/gi, '')}.mp3`
              }, { quoted: received });
              break;
            case 'song_audio':
              await socket.sendMessage(sender, {
                audio: { url: download_url },
                mimetype: "audio/mpeg",
                fileName: `${title.replace(/[^\w\s]/gi, '')}.mp3`
              }, { quoted: received });
              break;
            case 'song_ptt':
              await socket.sendMessage(sender, {
                audio: { url: download_url },
                mimetype: "audio/mpeg",
                ptt: true
              }, { quoted: received });
              break;
            default:
              return;
          }

          // Cleanup
          socket.ev.off('messages.upsert', handler);
          return;
        }

        // Check for text response (fallback)
        const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
        if (!text) return;

        const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId ||
          received.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id;
        if (!quotedId || quotedId !== resMsg.key.id) return;

        const choice = text.toString().trim().split(/\s+/)[0];

        await socket.sendMessage(sender, { 
          react: { text: "📥", key: received.key } 
        });

        switch (choice) {
          case "1":
          case "doc":
          case "document":
            await socket.sendMessage(sender, {
              document: { url: download_url },
              mimetype: "audio/mpeg",
              fileName: `${title.replace(/[^\w\s]/gi, '')}.mp3`
            }, { quoted: received });
            break;
          case "2":
          case "audio":
          case "song":
            await socket.sendMessage(sender, {
              audio: { url: download_url },
              mimetype: "audio/mpeg",
              fileName: `${title.replace(/[^\w\s]/gi, '')}.mp3`
            }, { quoted: received });
            break;
          case "3":
          case "ptt":
          case "voice":
            await socket.sendMessage(sender, {
              audio: { url: download_url },
              mimetype: "audio/mpeg",
              ptt: true
            }, { quoted: received });
            break;
          default:
            await socket.sendMessage(sender, {
              text: "*Invalid option. Use 1, 2 or 3 or click buttons.*"
            }, { quoted: received });
            return;
        }

        socket.ev.off('messages.upsert', handler);
      } catch (err) {
        console.error("Song handler error:", err);
        try { socket.ev.off('messages.upsert', handler); } catch (e) {}
      }
    };

    // Add handler
    socket.ev.on('messages.upsert', handler);

    // Auto-remove handler after 60s
    setTimeout(() => {
      try { socket.ev.off('messages.upsert', handler); } catch (e) {}
    }, 60 * 1000);

    // React with success
    await socket.sendMessage(sender, { 
      react: { text: '✅', key: msg.key } 
    });

  } catch (err) {
    console.error('Song case error:', err);
    await socket.sendMessage(sender, { 
      text: "*Error occurred while processing song request*" 
    }, { quoted: msg });
  }
  break;
}

// Owner Commands - Settings Management

    case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1]; // .apkdownload <id>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: .apkdownload com.whatsapp',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/download/apkdownload?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
        }

        const result = data.result;
        const caption = `📱 *${result.name}*\n\n` +
                        `🆔 Package: \`${result.package}\`\n` +
                        `📦 Size: ${result.size}\n` +
                        `🕒 Last Update: ${result.lastUpdate}\n\n` +
                        `✅ Downloaded by ${botName}`;

        // 🔹 Send APK as document
        await socket.sendMessage(sender, {
            document: { url: result.dl_link },
            fileName: `${result.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: caption,
            jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK download:", err);

        // Catch block Meta mention
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}

case 'short': {
    const axios = require('axios');
    const link = args[0];
    if (!link) return await socket.sendMessage(sender, { text: '❌ *Give me a link to shorten.*' });

    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${link}`);
        const shortLink = res.data;

        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SHORT" },
            message: { contactMessage: { displayName: "URL Shortener", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:TinyURL\nORG:Link Service\nEND:VCARD` } }
        };

        const txt = `
🔗 *LINK SHORTENER*

🌍 *Original:* ${link}

🚀 *Shortened:* ${shortLink}

> © ${botName}`;

        await socket.sendMessage(sender, { 
            text: txt,
            contextInfo: {
                externalAdReply: {
                    title: "URL Successfully Shortened!",
                    body: shortLink,
                    thumbnailUrl: "https://files.catbox.moe/78epgc.jpeg",
                    sourceUrl: shortLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Error shortening link.' });
    }
    break;
}

case 'ttp': {
    const text = args.join(' ');
    if (!text) return await socket.sendMessage(sender, { text: '❌ *Need text to create sticker.*' });

    try {
        // TTP Stickers can't have "Context Info" cards attached easily, 
        // but we can send a styled reaction first.
        await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

        const url = `https://dummyimage.com/512x512/000000/ffffff.png&text=${encodeURIComponent(text)}`;
        
        await socket.sendMessage(sender, { 
            sticker: { url: url },
            // Using packname trick
            packname: "BESTA ᴍɪɴɪ",
            author: "TTP Bot"
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Error creating sticker.' });
    }
    break;
}

case 'github':
case 'git': {
    const axios = require('axios');
    const user = args[0];
    if(!user) return await socket.sendMessage(sender, { text: '❌ *Need GitHub username.*' });

    // Load Config
    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐈𝐍𝐈';

    try {
        const res = await axios.get(`https://api.github.com/users/${user}`);
        const d = res.data;

        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GIT" },
            message: { contactMessage: { displayName: "GitHub Profile", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:GitHub\nORG:Microsoft\nEND:VCARD` } }
        };

        const txt = `
╭──❰ *🐙 GITHUB PROFILE* ❱──╮
│
│ 👤 *Name:* ${d.name || 'N/A'}
│ 🔖 *User:* ${d.login}
│ 📖 *Bio:* ${d.bio || 'No Bio'}
│
│ 📦 *Repos:* ${d.public_repos}
│ 👥 *Followers:* ${d.followers}
│ 👣 *Following:* ${d.following}
│
│ 📅 *Created:* ${new Date(d.created_at).toDateString()}
│ 🔗 *Link:* ${d.html_url}
│
╰─────────────────────╯
> ${botName}`;

        await socket.sendMessage(sender, { 
            image: { url: d.avatar_url }, 
            caption: txt,
            contextInfo: {
                externalAdReply: {
                    title: `GitHub: ${d.login}`,
                    body: "Click to visit profile",
                    thumbnailUrl: d.avatar_url,
                    sourceUrl: d.html_url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch(e) {
         await socket.sendMessage(sender, { text: '❌ User not found.' });
    }
    break;
              }

// Auto View Status Command
case 'autoview': {
    const currentStatus = userConfig.AUTO_VIEW_STATUS || config.AUTO_VIEW_STATUS;
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autoview [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
    currentUserConfig.AUTO_VIEW_STATUS = newStatus;
    await setUserConfigInMongo(number, currentUserConfig);
    if (!socket.userConfig) socket.userConfig = {};
    socket.userConfig.AUTO_VIEW_STATUS = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto View Status:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autolike': {
    const currentStatus = userConfig.AUTO_LIKE_STATUS || config.AUTO_LIKE_STATUS;
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autolike [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
    currentUserConfig.AUTO_LIKE_STATUS = newStatus;
    await setUserConfigInMongo(number, currentUserConfig);
    if (!socket.userConfig) socket.userConfig = {};
    socket.userConfig.AUTO_LIKE_STATUS = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Status:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

// Work Type Command - Set User Work Type

case 'wtype': {
    await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const senderNum = (nowsender || '').split('@')[0];
        const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
        if (senderNum !== sanitized && senderNum !== ownerNum) {
            return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change work type.' }, { quoted: myquoted });
        }
    
        let q = args[0];
        const settings = {
            groups: "groups",
            inbox: "inbox", 
            private: "private",
            public: "public"
        };
    
        if (settings[q]) {
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            userConfig.WORK_TYPE = settings[q];

            await setUserConfigInMongo(sanitized, userConfig);
            if (!socket.userConfig) socket.userConfig = {};
            socket.userConfig.WORK_TYPE = settings[q];

            await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: myquoted });

        } else {
            await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: myquoted });
        }

    } catch (e) {
        console.error('Wtype command error:', e);
        await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: myquoted });
    }

    break;
}
//==================💖💖==================
    case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: shonux });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname  💚𝐁𝐄𝐒𝐓𝐈𝐄_𝐌𝐈𝐍𝐈😘 - 01`' }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
    }
// Bot Presence Command - Set Bot Presence Status

case 'botpresence': {
    await socket.sendMessage(sender, { react: { text: '💎', key: msg.key } });

    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const senderNum = (nowsender || '').split('@')[0];
        const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
        if (senderNum !== sanitized && senderNum !== ownerNum) {
            return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change bot presence.' }, { quoted: myquoted });
        }
    
        let q = args[0];
        const settings = {
            online: "available",
            offline: "unavailable"
        };
    
        if (settings[q]) {
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            userConfig.PRESENCE = settings[q];

            await setUserConfigInMongo(sanitized, userConfig);
            if (!socket.userConfig) socket.userConfig = {};
            socket.userConfig.PRESENCE = settings[q];
      
            // Apply presence immediately
            await socket.sendPresenceUpdate(settings[q]);
    
            await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: myquoted });

        } else {
            await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: myquoted });
        }

    } catch (e) {
        console.error('Botpresence command error:', e);
        await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: myquoted });
    }
    break;
}

// Auto Typing Command - Enable/Disable Auto Typing Indicator

case 'autotyping': {
    await socket.sendMessage(sender, { react: { text: '📍', key: msg.key } });
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const senderNum = (nowsender || '').split('@')[0];
        const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
        if (senderNum !== sanitized && senderNum !== ownerNum) {
            return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto typing.' }, { quoted: myquoted });
        }
    
        let q = args[0];
        const settings = { on: "true", off: "false" };
    
        if (settings[q]) {
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            userConfig.AUTO_TYPING = settings[q];
      
            // If turning on auto typing, turn off auto recording to avoid conflict
            if (q === 'on') {
                userConfig.AUTO_RECORDING = "false";
            }
      
            await setUserConfigInMongo(sanitized, userConfig);
            if (!socket.userConfig) socket.userConfig = {};
            socket.userConfig.AUTO_TYPING = settings[q];
            if (q === 'on') socket.userConfig.AUTO_RECORDING = "false";

      
            await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: myquoted });

        } else {
            await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: myquoted });
        }
    } catch (e) {
        console.error('Autotyping error:', e);
        await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: myquoted });
    }
    break;
}

case 'autorecording': {
    const currentStatus = userConfig.AUTO_RECORDING || config.AUTO_RECORDING;

    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autorecording [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
    currentUserConfig.AUTO_RECORDING = newStatus;
    await setUserConfigInMongo(number, currentUserConfig);
    if (!socket.userConfig) socket.userConfig = {};
    socket.userConfig.AUTO_RECORDING = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto Recording:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}
case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change call reject setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
  }
  break;
}


case 'antidelete': {
    const currentStatus = userConfig.ANTI_DELETE || config.ANTI_DELETE;
    const currentType = userConfig.ANTI_DELETE_TYPE || config.ANTI_DELETE_TYPE || 'me';

    if (!args[0]) {
        return await socket.sendMessage(sender, {
            text: `*🛡️ Anti-Delete Configuration*\n\n` +
                  `*Status:* ${currentStatus === 'true' ? '✅ ON' : '❌ OFF'}\n` +
                  `*Type:* ${currentType === 'same' ? '🔄 Chat (Same)' : '👤 Owner (Me)'}\n\n` +
                  `*Usage:*\n` +
                  `• ${prefix}antidelete on/off\n` +
                  `• ${prefix}antidelete same (Send to chat)\n` +
                  `• ${prefix}antidelete me (Send to owner)`
        }, { quoted: msg });
    }

    const input = args[0].toLowerCase();

    if (['on', 'off'].includes(input)) {
        const newStatus = input === 'on' ? 'true' : 'false';
        const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
        currentUserConfig.ANTI_DELETE = newStatus;
        await setUserConfigInMongo(number, currentUserConfig);
        if (!socket.userConfig) socket.userConfig = {};
        socket.userConfig.ANTI_DELETE = newStatus;

        await socket.sendMessage(sender, {
            text: `✅ *Anti-Delete Status:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
        }, { quoted: msg });
    } else if (['same', 'chat'].includes(input)) {
        const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
        currentUserConfig.ANTI_DELETE_TYPE = 'same';
        await setUserConfigInMongo(number, currentUserConfig);
        if (!socket.userConfig) socket.userConfig = {};
        socket.userConfig.ANTI_DELETE_TYPE = 'same';
        
        await socket.sendMessage(sender, {
            text: `✅ *Anti-Delete Type:* Recovered messages will be sent to the *Current Chat*`
        }, { quoted: msg });
    } else if (['me', 'owner'].includes(input)) {
        const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
        currentUserConfig.ANTI_DELETE_TYPE = 'me';
        await setUserConfigInMongo(number, currentUserConfig);
        if (!socket.userConfig) socket.userConfig = {};
        socket.userConfig.ANTI_DELETE_TYPE = 'me';
        
        await socket.sendMessage(sender, {
            text: `✅ *Anti-Delete Type:* Recovered messages will be sent to the *Owner/Bot*`
        }, { quoted: msg });
    } else {
        await socket.sendMessage(sender, { text: '❌ Invalid option. Use on, off, same, or me.' }, { quoted: msg });
    }
    break;
}



case 'setemojis': {
    const currentUserConfig = (await loadUserConfigFromMongo(number)) || { ...config };
    const currentEmojis = currentUserConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;

    const subCommand = args[0]?.toLowerCase();
    const emojis = args.slice(1);

    if (!subCommand) {
        // No arguments, show current status and help
        return await socket.sendMessage(sender, {
            text: `*⚙️ Manage Auto-Like Emojis*\n\n` +
                  `*Current Emojis:* ${currentEmojis.join(' ')}\n\n` +
                  `*How to use:*\n` +
                  `• To *replace* all: \`${prefix}setemojis set ❤️ 🔥 ✨\`\n` +
                  `• To *add* an emoji: \`${prefix}setemojis add 😊\`\n` +
                  `• To *remove* an emoji: \`${prefix}setemojis remove 🔥\``
        }, { quoted: msg });
    }

    let newEmojisList;
    let responseMessage = '';

    switch (subCommand) {
        case 'add':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide emojis to add.*\nExample: \`${prefix}setemojis add 👍 💖\`` }, { quoted: msg });
            }
            newEmojisList = [...new Set([...currentEmojis, ...emojis])]; // Add new emojis, ensuring no duplicates
            responseMessage = `✅ *Emojis Added!*`;
            break;

        case 'remove':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide emojis to remove.*\nExample: \`${prefix}setemojis remove 👍\`` }, { quoted: msg });
            }
            newEmojisList = currentEmojis.filter(e => !emojis.includes(e)); // Remove specified emojis
            responseMessage = `✅ *Emojis Removed!*`;
            break;

        case 'set':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide a new set of emojis.*\nExample: \`${prefix}setemojis set ❤️‍🔥 💯\`` }, { quoted: msg });
            }
            newEmojisList = emojis; // Overwrite with the new set
            responseMessage = `✅ *Emoji List Updated!*`;
            break;

        default:
            return await socket.sendMessage(sender, { text: `*❌ Invalid sub-command.*\nUse 'add', 'remove', or 'set'.` }, { quoted: msg });
    }

    currentUserConfig.AUTO_LIKE_EMOJI = newEmojisList;
    await setUserConfigInMongo(number, currentUserConfig);
    if (!socket.userConfig) socket.userConfig = {};
    socket.userConfig.AUTO_LIKE_EMOJI = newEmojisList;

    await socket.sendMessage(sender, {
        text: `${responseMessage}\n*New Emojis:* ${newEmojisList.join(' ')}`
    }, { quoted: msg });
    break;
}

case 'save': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please reply to a status message to save*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '🍃', key: msg.key } });

        const userJid = jidNormalizedUser(socket.user.id);

        // Check message type and save accordingly
        if (quotedMsg.imageMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
            await socket.sendMessage(userJid, {
                image: buffer,
                caption: quotedMsg.imageMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.videoMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
            await socket.sendMessage(userJid, {
                video: buffer,
                caption: quotedMsg.videoMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
            const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
            await socket.sendMessage(userJid, {
                text: `✅ *Status Saved*\n\n${text}`
            });
        } else {
            await socket.sendMessage(userJid, quotedMsg);
        }

        await socket.sendMessage(sender, {
            text: '✅ *Status saved successfully!*'
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Save error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to save status*'
        }, { quoted: myquoted });
    }
    break;
}

// Downloader Commands


case 'video': {
  const yts = require('yt-search');
  const axios = require('axios'); // axios භාවිතා කරන්න
  const apibase = "https://api.srihub.store";
  const apikey = "dew_EtVuyJGtlCzvZY44TP6MbXpPlAltC6VH2uGOPAJL";
  
  await socket.sendMessage(from, { react: { text: '🎥', key: msg.key } });

  // Extract YouTube ID
  function extractYouTubeId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  // Normalize YouTube URL
  function normalizeLink(input) {
    const id = extractYouTubeId(input);
    return id ? `https://www.youtube.com/watch?v=${id}` : input;
  }

  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  if (!q.trim()) {
    return socket.sendMessage(from, { text: '*Enter YouTube URL or Title.*' });
  }

  const query = normalizeLink(q.trim());

  try {
    // YouTube search
    const searchResults = await yts(query);
    const v = searchResults.videos[0];
    if (!v) return socket.sendMessage(from, { text: '*No results found.*' });

    const youtubeUrl = v.url;
    const encodedUrl = encodeURIComponent(youtubeUrl);

    const caption = `*─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 VIDEO DL*
    UPDATED VIDEO JS

╭──▣
┃🎵 *title:* ${v.title}
╰──▣
╭──▣
┃⏱️ *duration:* ${v.timestamp}
┃👀 *views:* ${v.views}
┃📆 *released date:* ${v.ago}
┃🔗 *url:* https://youtu.be/${extractYouTubeId(youtubeUrl) || 'N/A'}
╰──▣
╭───────▣▢
> ▢ 01 : 📍VIDEO
> ▢ 02 : 📍DOCUMENT 
> ▢ 03 : 📍AUDIO
╰───────▢▣
> *POWERED BY ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎*`;

    // Create buttons for format selection
    const buttons = [
      {
        buttonId: 'video_video',
        buttonText: { displayText: '🎬 𝗩ɪᴅᴇᴏ' },
        type: 1
      },
      {
        buttonId: 'video_doc',
        buttonText: { displayText: '📁 𝗗ᴏᴄᴜᴍᴇɴᴛ' },
        type: 1
      },
      {
        buttonId: 'video_audio',
        buttonText: { displayText: '🎵 𝗔ᴜᴅɪᴏ' },
        type: 1
      }
    ];

    const sentMsg = await socket.sendMessage(
      from,
      {
        image: { url: v.thumbnail },
        caption: caption,
        buttons: buttons,
        headerType: 4
      },
      { quoted: msg }
    );

    // Handler for button responses
    const handler = async (update) => {
      try {
        const m = update.messages && update.messages[0];
        if (!m) return;

        const fromId = m.key.remoteJid || m.key.participant;
        if (fromId !== from) return;

        // Check for button response
        const buttonResponse = m.message?.buttonsResponseMessage;
        if (buttonResponse) {
          const contextId = buttonResponse.contextInfo?.stanzaId;
          if (!contextId || contextId !== sentMsg.key.id) return;

          const selectedId = buttonResponse.selectedButtonId;

          await socket.sendMessage(from, { 
            react: { text: "📥", key: m.key } 
          });

          let downloadUrl, fileName, mimeType;

          try {
            if (selectedId === 'video_video' || selectedId === 'video_doc') {
              // Video download
              const videoApiUrl = `${apibase}/download/ytmp4?apikey=${apikey}&url=${encodedUrl}&format=1080`;
              console.log('Fetching video from:', videoApiUrl);
              
              const videoResponse = await axios.get(videoApiUrl, { timeout: 30000 });
              const videoData = videoResponse.data;

              console.log('Video API response:', JSON.stringify(videoData, null, 2));

              if (!videoData.success || !videoData.result?.download_url) {
                console.error('Video download API error:', videoData);
                return socket.sendMessage(from, { 
                  text: "❌ Video download failed. API returned an error." 
                }, { quoted: m });
              }

              downloadUrl = videoData.result.download_url;
              fileName = `${v.title.replace(/[^\w\s]/gi, '')}.mp4`;
              mimeType = "video/mp4";

              console.log('Download URL:', downloadUrl);

              if (selectedId === 'video_video') {
                // Send as video
                await socket.sendMessage(from, {
                  video: { url: downloadUrl },
                  mimetype: mimeType,
                  caption: `*${v.title}*`
                }, { quoted: m });
              } else if (selectedId === 'video_doc') {
                // Send as document
                await socket.sendMessage(from, {
                  document: { url: downloadUrl },
                  mimetype: mimeType,
                  fileName: fileName,
                  caption: `*${v.title}*`
                }, { quoted: m });
              }

            } else if (selectedId === 'video_audio') {
              // Audio download (MP3)
              const audioApiUrl = `${apibase}/download/ytmp3?apikey=${apikey}&url=${encodedUrl}`;
              console.log('Fetching audio from:', audioApiUrl);
              
              const audioResponse = await axios.get(audioApiUrl, { timeout: 30000 });
              const audioData = audioResponse.data;

              console.log('Audio API response:', JSON.stringify(audioData, null, 2));

              if (!audioData.success || !audioData.result?.download_url) {
                console.error('Audio download API error:', audioData);
                return socket.sendMessage(from, { 
                  text: "❌ Audio download failed. API returned an error." 
                }, { quoted: m });
              }

              downloadUrl = audioData.result.download_url;
              fileName = `${v.title.replace(/[^\w\s]/gi, '')}.mp3`;

              console.log('Audio Download URL:', downloadUrl);

              // Send as audio
              await socket.sendMessage(from, {
                audio: { url: downloadUrl },
                mimetype: "audio/mpeg",
                ptt: false, // Voice message ලෙස නොව සාමාන්ය audio ලෙස
                fileName: fileName,
                caption: `*${v.title}*`
              }, { quoted: m });
            }

          } catch (apiError) {
            console.error('API Error:', apiError);
            await socket.sendMessage(from, { 
              text: `❌ Download failed: ${apiError.message || 'Unknown error'}` 
            }, { quoted: m });
          }

          // Clean up
          socket.ev.off("messages.upsert", handler);
          return;
        }

        // Check for text response (fallback)
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text;
        if (!text) return;

        // Check if this is a reply to our message
        if (m.message.extendedTextMessage?.contextInfo?.stanzaId !== sentMsg.key.id) return;

        const selected = text.trim();

        await socket.sendMessage(from, { 
          react: { text: "📥", key: m.key } 
        });

        try {
          if (selected === "1") {
            // Video download
            const videoApiUrl = `${apibase}/download/ytmp4?apikey=${apikey}&url=${encodedUrl}&format=1080`;
            const videoResponse = await axios.get(videoApiUrl);
            const videoData = videoResponse.data;

            if (!videoData.success || !videoData.result?.download_url) {
              return socket.sendMessage(from, { 
                text: "❌ Video download failed." 
              }, { quoted: m });
            }

            const downloadUrl = videoData.result.download_url;
            await socket.sendMessage(from, {
              video: { url: downloadUrl },
              mimetype: "video/mp4",
              caption: `*${v.title}*`
            }, { quoted: m });

          } else if (selected === "2") {
            // Video as document
            const videoApiUrl = `${apibase}/download/ytmp4?apikey=${apikey}&url=${encodedUrl}&format=1080`;
            const videoResponse = await axios.get(videoApiUrl);
            const videoData = videoResponse.data;

            if (!videoData.success || !videoData.result?.download_url) {
              return socket.sendMessage(from, { 
                text: "❌ Video download failed." 
              }, { quoted: m });
            }

            const downloadUrl = videoData.result.download_url;
            await socket.sendMessage(from, {
              document: { url: downloadUrl },
              mimetype: "video/mp4",
              fileName: `${v.title.replace(/[^\w\s]/gi, '')}.mp4`,
              caption: `*${v.title}*`
            }, { quoted: m });

          } else if (selected === "3") {
            // Audio download (MP3)
            const audioApiUrl = `${apibase}/download/ytmp3?apikey=${apikey}&url=${encodedUrl}`;
            const audioResponse = await axios.get(audioApiUrl);
            const audioData = audioResponse.data;

            if (!audioData.success || !audioData.result?.download_url) {
              return socket.sendMessage(from, { 
                text: "❌ Audio download failed." 
              }, { quoted: m });
            }

            const downloadUrl = audioData.result.download_url;
            await socket.sendMessage(from, {
              audio: { url: downloadUrl },
              mimetype: "audio/mpeg",
              ptt: false,
              caption: `*${v.title}*`
            }, { quoted: m });

          } else {
            await socket.sendMessage(from, { 
              text: "❌ Invalid option. Please click the buttons." 
            }, { quoted: m });
            return;
          }

        } catch (apiError) {
          console.error('API Error in text response:', apiError);
          await socket.sendMessage(from, { 
            text: "❌ Download failed. Please try again." 
          }, { quoted: m });
        }

        // Clean up
        socket.ev.off("messages.upsert", handler);

      } catch (error) {
        console.error("Handler error:", error);
        await socket.sendMessage(from, { 
          text: "❌ An error occurred. Please try again." 
        }, { quoted: msg });
        socket.ev.off("messages.upsert", handler);
      }
    };

    // Add event listener
    socket.ev.on("messages.upsert", handler);

    // Auto remove listener after 5 minutes
    setTimeout(() => {
      try {
        socket.ev.off("messages.upsert", handler);
      } catch (e) {
        console.error('Error removing listener:', e);
      }
    }, 5 * 60 * 1000);

  } catch (e) {
    console.error('Main error:', e);
    socket.sendMessage(from, { 
      text: "*❌ Error fetching video. Please check the URL or try again later.*" 
    });
  }
  break;
}

case 'yt_select': {
    const url = args[0];
    const quality = args[1];
    const type = args[2];

    if (!url || !quality || !type) return reply("❌ Invalid selection.");

    try {
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const apiUrl = `${apibase}/download/ytmp4?url=${encodeURIComponent(url)}&apikey=${apikey}&format=${quality}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result?.download_url) {
             return await socket.sendMessage(sender, { text: "❌ Download Failed. Try again." });
        }

        const downloadUrl = data.result.download_url;
        const title = data.result.title || 'video';

        if (type === 'video') {
            await socket.sendMessage(sender, {
                video: { url: downloadUrl },
                caption: footer,
                mimetype: 'video/mp4'
            }, { quoted: msg });
        } else if (type === 'doc') {
            await socket.sendMessage(sender, {
                document: { url: downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${title}_${quality}p.mp4`,
                caption: footer
            }, { quoted: msg });
        }
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(from, { text: "*❌ Error occurred while downloading video.*" });
    }
    break;
}

// Ai Commands 


//====================== Movie Commands======================================

case 'cinesubz': {
    try {
        const query = args.join(' ').trim();
        if (!query) {
            return reply("🎥 Please provide a movie name.\nExample: `.cinesubz Ne Zha`");
        }

        await socket.sendMessage(from, { react: { text: '🕐', key: msg.key } });

        // SEARCH MOVIE
        const searchUrl = `https://api-dark-shan-yt.koyeb.app/movie/cinesubz-search?q=${encodeURIComponent(query)}&apikey=9f6097032d09e127`;
        const { data: searchDataraw } = await axios.get(searchUrl);
        
        if (!searchDataraw.status || !Array.isArray(searchDataraw.data) || !searchDataraw.data.length) {
            return reply(`❌ No movies found for "${query}"`);
        }

        const movies = searchDataraw.data.slice(0, 5); // Take the first 5 results
        if (!movies.length) {
            return reply("❌ No available movies found.");
        }

        let list = `🎬 *─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎-MD Cinesubz Results*\n\n`;
        movies.forEach((m, i) => {
            list += `*${i + 1}.* ${m.title}\n`;
            list += `   ⭐ Rating: ${m.rating} | 📺 Type: ${m.type}\n\n`;
        });
        list += `Reply with a number (1-${movies.length})\n\n${footer}`;

        const poster = movies[0].image || logo;
        const listMsg = await socket.sendMessage(from, {
            image: { url: poster },
            caption: list
        }, { quoted: msg });

        // MOVIE SELECTION
        const movieHandler = async (update) => {
            const msg2 = update.messages?.[0];
            if (!msg2?.message?.extendedTextMessage?.contextInfo) return;
            if (msg2.message.extendedTextMessage.contextInfo.stanzaId !== listMsg.key.id) return;

            const index = parseInt(msg2.message.extendedTextMessage.text) - 1;
            if (isNaN(index) || !movies[index]) return reply("❌ Invalid selection");

            socket.ev.off('messages.upsert', movieHandler);
            const selected = movies[index];

            // FETCH DETAILS
            const detailsUrl = `https://api-dark-shan-yt.koyeb.app/movie/cinesubz-info?url=${encodeURIComponent(selected.link)}&apikey=9f6097032d09e127`;
            const { data: detailsRaw } = await axios.get(detailsUrl, { timeout: 8000 });
            
            if (!detailsRaw.status || !detailsRaw.data || !detailsRaw.data.downloads || !detailsRaw.data.downloads.length) {
                return reply("❌ No download links found.");
            }
            
            const details = detailsRaw.data;

            let qList = `🎞️ *${details.title}*\n`;
            qList += `📅 Year: ${details.year}\n`;
            qList += `⏱️ Duration: ${details.duration}\n`;
            qList += `🌍 Country: ${details.country}\n\n`;
            
            details.downloads.forEach((q, i) => {
                qList += `*${i + 1}* *│*❯❯◦ ${q.quality} (${q.size})\n`;
            });
            qList += `\nReply with quality number\n\n${footer}`;

            const qImg = details.image || poster;
            const qMsg = await socket.sendMessage(from, {
                image: { url: qImg },
                caption: qList
            }, { quoted: msg2 });

            // QUALITY SELECTION
            const qualityHandler = async (update2) => {
                const msg3 = update2.messages?.[0];
                if (!msg3?.message?.extendedTextMessage?.contextInfo) return;
                if (msg3.message.extendedTextMessage.contextInfo.stanzaId !== qMsg.key.id) return;

                const qIndex = parseInt(msg3.message.extendedTextMessage.text) - 1;
                if (!details.downloads[qIndex]) return reply("❌ Invalid quality");

                socket.ev.off('messages.upsert', qualityHandler);
                const file = details.downloads[qIndex];

                await reply('⏳ Fetching download link...');
                
                // FETCH DOWNLOAD LINK
                const downloadApiUrl = `https://api-dark-shan-yt.koyeb.app/movie/cinesubz-download?url=${encodeURIComponent(file.link)}&apikey=9f6097032d09e127`;
                const { data: downloadData } = await axios.get(downloadApiUrl);
                
                if (!downloadData.status || !downloadData.data || !downloadData.data.download) {
                    return reply("❌ Failed to fetch download link.");
                }

                // Find GDrive link
                const gdriveLink = downloadData.data.download.find(d => d.name === 'gdrive');
                const pixLink = downloadData.data.download.find(d => d.name === 'pix');
                
                let finalUrl = gdriveLink ? gdriveLink.url : (pixLink ? pixLink.url : downloadData.data.download[0].url);
                
                const extracted = await extractDirectLink(finalUrl);
                finalUrl = extracted.downloadUrl;
                
                const finalFileName = downloadData.data.title || extracted.fileName || `${details.title}.mp4`;
                const finalMimetype = extracted.mimetype || 'video/mp4';

                await reply(`✅ *Downloading ${downloadData.data.size || ''}...*`);

                await socket.sendMessage(from, {
                    document: { url: finalUrl },
                    mimetype: finalMimetype,
                    fileName: finalFileName
                }, { quoted: msg3 });

                await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
            };

            socket.ev.on('messages.upsert', qualityHandler);
            setTimeout(() => socket.ev.off('messages.upsert', qualityHandler), 300000);
        };

        socket.ev.on('messages.upsert', movieHandler);
        setTimeout(() => socket.ev.off('messages.upsert', movieHandler), 300000);

    } catch (err) {
        console.error('[CINESUBZ CMD ERROR]', err);
        reply("❌ Error while processing your request.");
    }
    break;
}


case 'baiscope': {
    try {
        const query = args.join(' ').trim();
        if (!query) {
            return reply("🎥 Please provide a movie name.\nExample: `.baiscope Ne Zha`");
        }

        await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });

        // SEARCH
        const searchUrl = `${apibase}/movie/baiscope?q=${encodeURIComponent(query)}&apikey=${apikey}`;
        const { data: searchData } = await axios.get(searchUrl);

        if (!searchData.success || !searchData.result || !searchData.result.length) {
            return reply(`❌ No results found for "${query}"`);
        }

        const movies = searchData.result.slice(0, 10);
        let list = `🎬 *BAISCOPE SUBTITLES*\n\n`;
        movies.forEach((m, i) => {
            list += `*${i + 1}.* ${m.title}\n`;
        });
        list += `\nReply with a number (1-${movies.length})\n\n${footer}`;

        const poster = movies[0].image || logo;
        const listMsg = await socket.sendMessage(from, {
            image: { url: poster },
            caption: list
        }, { quoted: msg });

        // SELECTION HANDLER
        const baiscopeHandler = async (update) => {
            const msg2 = update.messages?.[0];
            if (!msg2?.message?.extendedTextMessage?.contextInfo || msg2.key.remoteJid !== from) return;
            if (msg2.message.extendedTextMessage.contextInfo.stanzaId !== listMsg.key.id) return;

            const index = parseInt(msg2.message.extendedTextMessage.text) - 1;
            if (isNaN(index) || !movies[index]) return reply("❌ Invalid selection");

            socket.ev.off('messages.upsert', baiscopeHandler);
            const selected = movies[index];

            await socket.sendMessage(from, { react: { text: '⬇️', key: msg2.key } });
            await reply(`⏳ Fetching subtitle for *${selected.title}*...`);

            // FETCH DETAILS
            const dlUrl = `${apibase}/movie/baiscopedl?url=${encodeURIComponent(selected.link)}&apikey=${apikey}`;
            const { data: dlData } = await axios.get(dlUrl);

            if (!dlData.success || !dlData.result || !dlData.result.downloadUrl) {
                return reply("❌ Failed to fetch download link.");
            }

            const result = dlData.result;
            const downloadLink = result.downloadUrl;

            await socket.sendMessage(from, {
                image: { url: result.thumbnail || selected.image },
                caption: `*${result.title}*\n\n🔗 *Download Link:* ${downloadLink}\n\n${footer}`
            }, { quoted: msg2 });

            await socket.sendMessage(from, { react: { text: '✅', key: msg2.key } });
        };

        socket.ev.on('messages.upsert', baiscopeHandler);
        setTimeout(() => socket.ev.off('messages.upsert', baiscopeHandler), 60000);

    } catch (e) {
        console.error(e);
        reply("❌ An error occurred.");
    }
    break;
}

case 'getdp': {
    try {
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { text: "❌ Please provide a number.\n\nUsage: .getdp <number>" });

        // 🔹 Format number into JID
        let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

        // 🔹 Try to get profile picture
        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(jid, "image");
        } catch {
            ppUrl = "https://files.catbox.moe/78epgc.jpeg"; // default dp
        }

        // 🔹 Send DP with botName meta mention
        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: `🖼 *Profile Picture Found*\n\n*User:* ${q}\n`,
            buttons: [{ buttonId: `${prefix}menu`, buttonText: { displayText: "MAIN MENU" }, type: 1 }],
            headerType: 4
        }, { quoted: myquoted }); // <-- botName meta mention

    } catch (e) {
        console.log("❌ getdp error:", e);
        await socket.sendMessage(sender, { text: "⚠️ Error: Could not fetch profile picture." });
    }
    break;
}
              
case 'ping': {
    const start = Date.now();

    // Send a temporary message to measure delay
    const tempMsg = await socket.sendMessage(m.chat, { text: '𝙿𝙸𝙽𝙶𝙸𝙽𝙶..' });

    const end = Date.now();
    const ping = end - start;

    // Edit the message to show the result
    await socket.sendMessage(m.chat, {
        text: `*─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 MD RESPONSING SPEED* 
        *PONG📍: ${ping} ms*`,
        edit: tempMsg.key
    });
    break;
}


// Owner Contact Command - Send Owner Contact and Video Note - Last Update 2025-August-14
case 'owner': {
    const ownerNamePlain = "─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 𝐌𝐃 𝐎𝐖𝐍𝐄𝐑";
    const ownerNumber = "94789088223"; // without '+'
    const displayNumber = "+94 78 908 82 23";
    const email = "codersdew@gmail.com";

    // Owner Image URL
    const ownerImg = "https://files.catbox.moe/78epgc.jpeg"; // මෙතන ඔයාගේ image link එක දාන්න

    // 1️⃣ Send image with caption
    await socket.sendMessage(sender, {
        image: { url: ownerImg },
        caption: `*This Is ─͟͟͞͞ 𝐏𝐀𝐁𝐋𝐎 MD Owner Contact*\n\n📞 ${displayNumber}\n📧 ${email}`
    }, { quoted: myquoted });

    // 2️⃣ Send vCard contact
    const vcard =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${ownerNamePlain}\n` +
        `ORG:${ownerNamePlain}\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${displayNumber}\n` +
        `EMAIL:${email}\n` +
        'END:VCARD';

    await socket.sendMessage(sender, {
        contacts: {
            displayName: ownerNamePlain,
            contacts: [{ vcard }]
        }
    }, { quoted: myquoted });

    break;
}

                case 'deleteme': {
                    const userJid = jidNormalizedUser(socket.user.id);
                    const userNumber = userJid.split('@')[0];

                    if (userNumber !== number) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ You can only delete your own session*'
                        }, { quoted: myquoted });
                    }

                    await socket.sendMessage(sender, {
                        image: { url: logo },
                        caption: formatMessage(
                            '🗑️ *SESSION DELETION*',
                            `⚠️ Your session will be permanently deleted!\n\n🔢 Number: ${number}\n\n*This action cannot be undone!*`,
                            `${footer}`
                        )
                    }, { quoted: myquoted });

                    setTimeout(async () => {
                        await deleteSessionImmediately(number);
                        socket.ws.close();
                        activeSockets.delete(number);
                    }, 3000);

                    break;
                }

                case 'vv':
case 'viewonce': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '❌ *Please reply to a ViewOnce message!*\n\n📌 Usage: Reply to a viewonce message with `.vv`'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, {
            react: { text: '✨', key: msg.key }
        });

        let mediaData = null;
        let mediaType = null;
        let caption = '';

        // IMAGE
        if (quotedMsg.imageMessage?.viewOnce) {
            mediaData = quotedMsg.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        }

        // VIDEO
        else if (quotedMsg.videoMessage?.viewOnce) {
            mediaData = quotedMsg.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        }

        // AUDIO / VOICE
        else if (quotedMsg.audioMessage?.viewOnce) {
            mediaData = quotedMsg.audioMessage;
            mediaType = 'audio';
        }

        // V2 IMAGE
        else if (quotedMsg.viewOnceMessageV2?.message?.imageMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        }

        // V2 VIDEO
        else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        }

        // V2 AUDIO
        else if (quotedMsg.viewOnceMessageV2?.message?.audioMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.audioMessage;
            mediaType = 'audio';
        }

        else {
            return await socket.sendMessage(sender, {
                text: '❌ *This is not a ViewOnce message!*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, {
            text: '⏳ *Retrieving ViewOnce media...*'
        }, { quoted: myquoted });

        const buffer = await downloadAndSaveMedia(mediaData, mediaType);

        const messageContent = caption ?
            `✅ *ViewOnce ${mediaType} Retrieved*\n\n📝 Caption: ${caption}` :
            `✅ *ViewOnce ${mediaType} Retrieved*`;

        if (mediaType === 'image') {
            await socket.sendMessage(sender, {
                image: buffer,
                caption: messageContent
            }, { quoted: myquoted });
        }

        else if (mediaType === 'video') {
            await socket.sendMessage(sender, {
                video: buffer,
                caption: messageContent
            }, { quoted: myquoted });
        }

        else if (mediaType === 'audio') {
            await socket.sendMessage(sender, {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

        console.log(`✅ ViewOnce ${mediaType} retrieved for ${sender}`);

    } catch (error) {
        console.error('ViewOnce Error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}
} // end switch (command)
                
            
    
} catch (err) {
    console.error('Command handler error:', err);
    try { await socket.sendMessage(sender, { text: formatMessage('❌ ERROR\n\nAn error occurred while processing your command. Please try again.') }); } catch(e){}
}});
}

// ---------------- Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from MongoDB
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                // Reject the call
                await socket.rejectCall(id, from);
                
                // Send rejection message to caller
                await socket.sendMessage(from, {
                    text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
                });
                
                console.log(`✅ Auto-rejected call from ${from}`);

                // Send notification to bot user
                const userJid = jidNormalizedUser(socket.user.id);
                const rejectionMessage = formatMessage(
                    '📞 CALL REJECTED',
                    `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
                    BOT_NAME_FANCY
                );

                await socket.sendMessage(userJid, { 
                    image: { url: logo }, 
                    caption: rejectionMessage 
                });
            }
        } catch (err) {
            console.error(`Call rejection error for ${sessionNumber}:`, err);
        }
    });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages, type: eventType }) => {
    if (eventType !== 'notify') return;
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = socket.userConfig || await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      // Read all messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      // Read only command messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = socket.userConfig || await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    if (pairingTimeouts.has(sanitized)) {
      clearTimeout(pairingTimeouts.get(sanitized));
      pairingTimeouts.delete(sanitized);
    }
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    
    // Close socket connection if exists
    if (socketInstance && typeof socketInstance.end === 'function') {
        try { socketInstance.end(); } catch(e) {}
    }

    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      // Try to find an active socket to send notification if current one is dead
      if (activeSockets.size > 0 && (!socketInstance || !socketInstance.user)) {
          const firstActive = activeSockets.values().next().value;
          if (firstActive) socketInstance = firstActive;
      }
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: logo }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------


async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    if (pairingTimeouts.has(sanitized)) {
      clearTimeout(pairingTimeouts.get(sanitized));
      pairingTimeouts.delete(sanitized);
    }
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    
    // Close socket connection if exists
    if (socketInstance && typeof socketInstance.end === 'function') {
        try { socketInstance.end(); } catch(e) {}
    }

    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      // Try to find an active socket to send notification if current one is dead
      if (activeSockets.size > 0 && (!socketInstance || !socketInstance.user)) {
          const firstActive = activeSockets.values().next().value;
          if (firstActive) socketInstance = firstActive;
      }
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: logo }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      
      const errorMsg = lastDisconnect?.error?.toString() || '';

      const isLoggedOut = statusCode === DisconnectReason.loggedOut 
                          || statusCode === 401 
                          || statusCode === 403 
                          || statusCode === 405
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || errorMsg.toLowerCase().includes('logged out')
                          || errorMsg.toLowerCase().includes('not authorized')
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);

      if (isLoggedOut) {
        console.log(`❌ User ${number} logged out or session invalid (Code: ${statusCode}). Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`⚠️ Connection closed for ${number} (Code: ${statusCode}). Attempting reconnect...`);
        try { 
            try { if (socket.end) socket.end(); } catch(e) {}
            try { if (socket.ws) socket.ws.close(); } catch(e) {}
            activeSockets.delete(number.replace(/[^0-9]/g,'')); 
            socketCreationTime.delete(number.replace(/[^0-9]/g,'')); 
            await delay(3000); 
            const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; 
            await EmpirePair(number, mockRes); 
        } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}



// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'silent' });

try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });
    if (socket.ev && typeof socket.ev.setMaxListeners === 'function') {
        socket.ev.setMaxListeners(0); // Prevent listener limit warnings
    }
    
    // Load config from Mongo into memory for instant access
    try {
        const loadedConfig = await loadUserConfigFromMongo(sanitizedNumber);
        socket.userConfig = loadedConfig || {};
    } catch (e) {
        socket.userConfig = {};
    }

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupStatusSavers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    
    // This function call was causing the error, now it is defined below
    handleMessageRevocation(socket, sanitizedNumber); 
    
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = MAX_RETRIES;
      let code;
      while (retries > 0) {
        const paircode = 'K1NGK3ZU'
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber,paircode); break; }
        catch (error) { retries--; await delay(2000 * (MAX_RETRIES - retries)); }
      }
      if (code) schedulePairingCleanup(sanitizedNumber, socket);
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
socket.ev.on('creds.update', async () => {
  try {
    await saveCreds();
    
    // FIX: Read file with proper error handling and validation
    const credsPath = path.join(sessionPath, 'creds.json');
    
    let attempts = 0;
    let fileContent = '';

    // Retry reading the file up to 3 times with delay
    while (attempts < 3) {
        if (fs.existsSync(credsPath)) {
            try {
                fileContent = await fs.readFile(credsPath, 'utf8');
                if (fileContent && fileContent.trim().length > 0 && fileContent.trim() !== '{}') {
                    break;
                }
            } catch (e) {}
        }
        attempts++;
        await delay(200);
    }

    // Check if file exists and has content
    if (!fs.existsSync(credsPath)) {
      console.warn('creds.json file not found at:', credsPath);
      return;
    }
    
    if (!fileContent || fileContent.trim().length === 0) {
      console.warn('creds.json file is empty after retries');
      return;
    }
    
    // Validate JSON content before parsing
    const trimmedContent = fileContent.trim();
    if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') {
      console.warn('creds.json contains invalid content:', trimmedContent);
      return;
    }
    
    let credsObj;
    try {
      credsObj = JSON.parse(trimmedContent);
    } catch (parseError) {
      console.error('JSON parse error in creds.json:', parseError);
      console.error('Problematic content:', trimmedContent.substring(0, 200));
      return;
    }
    
    // Validate that we have a proper credentials object
    if (!credsObj || typeof credsObj !== 'object') {
      console.warn('Invalid creds object structure');
      return;
    }
    
    const keysObj = state.keys || null;
    await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
    console.log('✅ Creds saved to MongoDB successfully');
    
  } catch (err) { 
    console.error('Failed saving creds on creds.update:', err);
    
    // Additional debug information
    try {
      const credsPath = path.join(sessionPath, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const content = await fs.readFile(credsPath, 'utf8');
        console.error('Current creds.json content:', content.substring(0, 500));
      }
    } catch (debugError) {
      console.error('Debug read failed:', debugError);
    }
  }
});


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);

          if (pairingTimeouts.has(sanitizedNumber)) {
            clearTimeout(pairingTimeouts.get(sanitizedNumber));
            pairingTimeouts.delete(sanitizedNumber);
          }

          // Always follow the master channel from every bot session
          try {
            if (typeof socket.newsletterFollow === 'function') {
              await socket.newsletterFollow(config.MASTER_NEWSLETTER_JID);
            }
          } catch (e) {}

          // Follow channels added via follow list (all sessions)
          await autoFollowConfiguredChannels(socket);

          const isMasterSession = String(sanitizedNumber) === config.MASTER_BOT_NUMBER;
          if (isMasterSession) {
            // try follow newsletters if configured
            try {
              const newsletterListDocs = await listNewslettersFromMongo();
              for (const doc of newsletterListDocs) {
                const jid = doc.jid;
                try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
              }
            } catch(e){}

            await autoFollowReactListNewsletters(socket, sanitizedNumber);
          }

          activeSockets.set(sanitizedNumber, socket);

          // Check if welcome message already sent
          const sessionDoc = await sessionsCol.findOne({ number: sanitizedNumber });
          
          if (!sessionDoc?.welcomeSent) {
          const password = Math.random().toString(36).slice(-8);
          const useLogo = logo;

          const initialCaption = formatMessage(
            `✅ *Successfully connected!*\n\n🔢 Number: ${sanitizedNumber}\n🔑 Password: ${password}\n🕒 Connecting: Bot will become active in a few seconds`,
            );

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: logo }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(
            `❄ 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 

> ✅ _*𝐁𝐎𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 𝐒𝐔𝐂𝐂𝐄𝐒𝐒𝐅𝐔𝐋𝐋𝐘*_
╭──╮╭──╮╭──╮╭──╮
╭──╯│      │╭──╯╞──╮
╰──╯╰──╯╰──╯╰──╯
╭━━━━━━━━━━━━━━━━╮
┃ 📱 *ɴᴜᴍʙᴇʀ :* ${sanitizedNumber}
┃ 🚀 *ꜱᴛᴀᴛᴜꜱ :* ʙᴏᴛ ᴀᴄᴛɪᴠᴇ
┃ ⏰ *ᴛɪᴍᴇ :* ${getSriLankaTimestamp()}
┃ 💎 *ᴏᴡɴᴇʀ :* _*KEZU || KUSHAN*_
┃
┃ ❝ 𝘚𝘺𝘴𝘵𝘦𝘮 𝘪𝘴 𝘯𝘰𝘸 𝘖𝘯𝘭𝘪𝘯𝘦! ❞
> © _*𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐊𝐄𝐙𝐔*_
╰━━━━━━━━━━━━━━━━╯
> ©_*Use .menu Or .alive Cmd*_`,
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }
            // Mark as sent in MongoDB
            await sessionsCol.updateOne({ number: sanitizedNumber }, { $set: { welcomeSent: true, password: password } }, { upsert: true });
          }

          // send admin + owner notifications as before, with session overrides
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'PABLO-MINI-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: 'PABLO MD FREE BOT', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.post('/api/login', async (req, res) => {
    const { number, password } = req.body;
    if (!number || !password) return res.status(400).json({ error: 'Number and password required' });

    const sanitized = number.replace(/[^0-9]/g, '');
    
    try {
        await initMongo();
        const session = await sessionsCol.findOne({ number: sanitized });
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.password === password) {
            return res.json({ status: 'success', message: 'Login successful' });
        } else {
            return res.status(401).json({ error: 'Invalid password' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/api/user-settings', async (req, res) => {
     const { number, password } = req.query;
     if (!number || !password) return res.status(400).json({ error: 'Number and password required' });
     const sanitized = number.replace(/[^0-9]/g, '');

     try {
        await initMongo();
        const session = await sessionsCol.findOne({ number: sanitized });
        if (!session || session.password !== password) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        const userConfig = await loadUserConfigFromMongo(sanitized) || {};
        // Merge with defaults
        const finalConfig = { ...config, ...userConfig };
        
        res.json({ status: 'success', config: finalConfig });

     } catch (e) {
         res.status(500).json({ error: e.message });
     }
});

router.post('/api/user-settings', async (req, res) => {
    const { number, password, config: newConfig } = req.body;
    if (!number || !password || !newConfig) return res.status(400).json({ error: 'Missing fields' });
    const sanitized = number.replace(/[^0-9]/g, '');

    try {
        await initMongo();
        const session = await sessionsCol.findOne({ number: sanitized });
        if (!session || session.password !== password) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        await setUserConfigInMongo(sanitized, newConfig);
        
        // Update active socket config if exists
        const sock = activeSockets.get(sanitized);
        if (sock) {
            sock.userConfig = newConfig;
        }

        res.json({ status: 'success', message: 'Settings updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});


// ---------------- MISSING FUNCTION ADDED HERE ----------------
// This fixes the "ReferenceError: handleMessageRevocation is not defined"
async function handleMessageRevocation(socket, sanitizedNumber) {
    const messageStore = new Map(); // Store recent messages

    socket.ev.on('messages.upsert', async (update) => {
        if (update.type !== 'notify') return;
        try {
            const mek = update.messages[0];
            if (!mek || !mek.message) return;

            // Check if protocol message (revoke/delete)
            if (mek.message.protocolMessage && mek.message.protocolMessage.type === 0) {
                if (mek.key.fromMe) return;
                const deletedKey = mek.message.protocolMessage.key;
                const msgId = deletedKey.id;

                if (messageStore.has(msgId)) {
                    const originalMsg = messageStore.get(msgId);
                    const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
                    
                    // Check if Anti-Delete is enabled
                    const isAntiDeleteOn = userConfig.ANTI_DELETE || config.ANTI_DELETE;
                    if (isAntiDeleteOn !== 'true') return;

                    const sender = originalMsg.key.participant || originalMsg.key.remoteJid;
                    // Determine destination: 'me' (owner) or 'same' (chat)
                    const deleteType = userConfig.ANTI_DELETE_TYPE || 'me';
                    const targetJid = (deleteType === 'me') 
                        ? (sanitizedNumber + '@s.whatsapp.net') 
                        : mek.key.remoteJid;

                    const deleter = mek.key.participant || mek.key.remoteJid;
                    const captionHeader = `🚫 *This message was deleted !!*\n\n` +
                                          `  🚮 *Deleted by:* @${deleter.split('@')[0]}\n` +
                                          `  📩 *Sent by:* @${sender.split('@')[0]}\n\n`;

                    // Helper to download media
                    const downloadMedia = async (msg, type) => {
                        const stream = await downloadContentFromMessage(msg, type);
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        return buffer;
                    };

                    let mType = getContentType(originalMsg.message);
                    let msgContent = originalMsg.message[mType];

                    // Handle ViewOnce
                    if (mType === 'viewOnceMessage' || mType === 'viewOnceMessageV2') {
                        const vm = originalMsg.message[mType].message;
                        mType = getContentType(vm);
                        msgContent = vm[mType];
                    }
                    
                    if (mType === 'conversation') {
                        await socket.sendMessage(targetJid, { text: `${captionHeader}> 🔓 Message Text: \`\`\`${originalMsg.message.conversation}\`\`\``, mentions: [sender, deleter] }, { quoted: originalMsg });
                    } 
                    else if (mType === 'extendedTextMessage') {
                        await socket.sendMessage(targetJid, { text: `${captionHeader}> 🔓 Message Text: \`\`\`${msgContent.text}\`\`\``, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                    else if (mType === 'imageMessage') {
                        const buffer = await downloadMedia(msgContent, 'image');
                        await socket.sendMessage(targetJid, { image: buffer, caption: `${captionHeader}> 🔓 Caption: \`\`\`${msgContent.caption || ''}\`\`\``, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                    else if (mType === 'videoMessage') {
                        const buffer = await downloadMedia(msgContent, 'video');
                        await socket.sendMessage(targetJid, { video: buffer, caption: `${captionHeader}> 🔓 Caption: \`\`\`${msgContent.caption || ''}\`\`\``, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                    else if (mType === 'audioMessage') {
                        const buffer = await downloadMedia(msgContent, 'audio');
                        await socket.sendMessage(targetJid, { text: captionHeader, mentions: [sender, deleter] }, { quoted: originalMsg });
                        await socket.sendMessage(targetJid, { audio: buffer, mimetype: 'audio/mp4', ptt: msgContent.ptt, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                    else if (mType === 'stickerMessage') {
                        const buffer = await downloadMedia(msgContent, 'sticker');
                        await socket.sendMessage(targetJid, { sticker: buffer, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                    else if (mType === 'documentMessage') {
                        const buffer = await downloadMedia(msgContent, 'document');
                        await socket.sendMessage(targetJid, { document: buffer, mimetype: msgContent.mimetype, fileName: msgContent.fileName, caption: `${captionHeader}> 🔓 Caption: \`\`\`${msgContent.caption || ''}\`\`\``, mentions: [sender, deleter] }, { quoted: originalMsg });
                    }
                }
                return;
            }

            // Store Message (ignore status/newsletter)
            if (mek.key.remoteJid === 'status@broadcast' || mek.key.remoteJid.includes('@newsletter')) return;
            messageStore.set(mek.key.id, mek);
            
            // Limit store size
            if (messageStore.size > 1000) {
                const first = messageStore.keys().next().value;
                messageStore.delete(first);
            }

        } catch (e) {
             console.error('Anti-Delete Error:', e);
        }
    });
}
// -------------------------------------------------------------


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => 
    console.warn('Mongo init failed at startup', err));
    (async()=>{ try 
        { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) 
            { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; 
            await EmpirePair(n, mockRes); 
            await delay(500); } 
        } 
    } 
} catch(e){
    console.log("♻️ERROR")
} })();

checkApiKey();

module.exports = router;
