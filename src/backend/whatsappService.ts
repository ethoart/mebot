import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import type { Client as ClientType } from "whatsapp-web.js";
import qrcode from "qrcode";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

let client: ClientType | null = null;
let qrCodeDataURL: string | null = null;
let connectionState: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
let lastError: string | null = null;

// Track active chats where the user (human) recently replied to prevent bot from interfering
const userActiveChats: Record<string, number> = {}; 
const USER_ACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes pause after user replies manually
const botSentMessagesBody = new Set<string>(); // Track bot's own recent messages

let trainingPrompt: string = "You are a helpful proxy assistant. You MUST respond in perfect, natural Sinhala language.";
let botEnabled: boolean = false;

// Initialize Gemini
const initGenAI = () => {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "dummy" });
};

export function getWhatsAppStatus() {
  return {
    state: connectionState,
    qrUpdate: qrCodeDataURL,
    error: lastError,
    botEnabled
  };
}

export function updateBotConfig(config: { enabled?: boolean }) {
    if (config.enabled !== undefined) {
        botEnabled = config.enabled;
    }
    return { enabled: botEnabled };
}

export async function uploadTrainingScreenshots(files: Express.Multer.File[]) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
           throw new Error("GEMINI_API_KEY is missing. Please set it in Settings.");
        }

        const ai = initGenAI();
        console.log("Analyzing screenshots...");
        
        // Prepare files for Gemini
        const parts = files.map(file => {
            return {
                inlineData: {
                    data: fs.readFileSync(file.path).toString("base64"),
                    mimeType: file.mimetype
                }
            };
        });

        const promptText = `
        Analyze these chat screenshots. Identify my chat persona (the user taking the screenshot).
        Pay attention to:
        - How I greet or respond.
        - My tone (casual, formal, emojis, abbreviations).
        - The languages used (detect Sinhala, English, Singlish).
        - How short or long my messages usually are.
        
        Generate a detailed SYSTEM PROMPT that can be used to instruct an LLM to roleplay as me. 
        The prompt should start with: "You are a proxy for me on WhatsApp. Respond exactly as I do. You MUST use perfect, natural Sinhala language where appropriate. Here are your persona rules: ..."
        `;

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
               ...parts,
               { text: promptText }
            ],
        });

        console.log("Gemini extraction complete.");
        if (response.text) {
            trainingPrompt = response.text;
        }

        // Clean up files
        files.forEach(f => fs.unlinkSync(f.path));

    } catch (e: any) {
        console.error("Error analyzing screenshots:", e);
        throw e;
    }
}

export function getTrainingPrompt() {
    return trainingPrompt;
}

export interface Schedule {
  id: string;
  chatId: string;
  chatName: string;
  message: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  enabled: boolean;
}

let schedules: Schedule[] = [];
const sentSchedules = new Set<string>();
const targetTimes = new Map<string, string>();

export async function getChatsAll() {
    if (!client || connectionState !== "connected") return [];
    try {
        const chats = await client.getChats();
        return chats.map(c => ({
            id: c.id._serialized,
            name: c.name || c.id.user,
            isGroup: c.isGroup
        }));
    } catch {
        return [];
    }
}

export function getSchedules() {
    return schedules;
}

export function addSchedule(schedule: Omit<Schedule, "id">) {
    const newSchedule = { ...schedule, id: Math.random().toString(36).substr(2, 9) };
    schedules.push(newSchedule);
    return newSchedule;
}

export function removeSchedule(id: string) {
    schedules = schedules.filter(s => s.id !== id);
}

export function toggleSchedule(id: string, enabled: boolean) {
    const s = schedules.find(s => s.id === id);
    if (s) s.enabled = enabled;
}

// Background task to send scheduled messages
setInterval(async () => {
   if (!client || connectionState !== "connected") return;
   
   // Use Sri Lanka timezone if no TZ set, but better yet get timezone from the system
   const tz = process.env.TZ || 'Asia/Colombo';
   const now = new Date();
   const timeStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
   }).format(now);
   
   const dateStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz
   }).format(now);

   for (const s of schedules) {
      if (!s.enabled) continue;
      
      const sentKey = `${s.id}_${dateStr}`;
      if (sentSchedules.has(sentKey)) continue;

      let targetTime = targetTimes.get(sentKey);
      if (!targetTime) {
         const [startH, startM] = s.startTime.split(':').map(Number);
         const [endH, endM] = s.endTime.split(':').map(Number);
         const startMin = startH * 60 + startM;
         let endMin = endH * 60 + endM;
         if (endMin <= startMin) endMin = startMin + 1;
         
         const randomMin = Math.floor(Math.random() * (endMin - startMin + 1)) + startMin;
         const rh = Math.floor(randomMin / 60).toString().padStart(2, '0');
         const rm = (randomMin % 60).toString().padStart(2, '0');
         targetTime = `${rh}:${rm}`;
         targetTimes.set(sentKey, targetTime);
         console.log(`Generated target time ${targetTime} for schedule ${s.id} on ${dateStr}`);
      }

      if (timeStr >= targetTime) {
         try {
             await client.sendMessage(s.chatId, s.message);
             console.log(`Scheduled message sent to ${s.chatName} (${s.chatId})`);
             sentSchedules.add(sentKey);
         } catch (e) {
             console.error(`Failed to send scheduled message to ${s.chatId}`, e);
         }
      }
   }
}, 60000);

export function getChats() {
   // Just return connection status for now to avoid large dumps; frontend can query more later.
   return { activeUsers: Object.keys(userActiveChats).length };
}

export async function startWhatsAppClient() {
  if (connectionState === "connected" || connectionState === "connecting") {
    return;
  }

  connectionState = "connecting";
  qrCodeDataURL = null;
  lastError = null;

  try {
    client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        // Essential flags for running beautifully in headless server environments
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    client.on("qr", async (qr) => {
      console.log("QR RECEIVED", qr);
      qrCodeDataURL = await qrcode.toDataURL(qr);
      connectionState = "disconnected"; // still awaiting scan
    });

    client.on("ready", () => {
      console.log("Client is ready!");
      connectionState = "connected";
      qrCodeDataURL = null;
    });

    client.on("authenticated", () => {
      console.log("Authenticated...");
    });

    client.on("auth_failure", (msg) => {
      console.error("Auth failure", msg);
      connectionState = "error";
      lastError = "Authentication Failed: " + msg;
    });

    client.on("disconnected", (reason) => {
       console.log("Disconnected", reason);
       connectionState = "disconnected";
       client = null;
    });

    client.on("message_create", handleMessage);

    await client.initialize();

  } catch (err: any) {
    console.error("Failed to start WhatsApp client", err);
    connectionState = "error";
    lastError = err.message || "Failed to launch headless browser";
  }
}

const pendingChatReplies: Record<string, NodeJS.Timeout> = {};

async function handleMessage(msg: any) {
  try {
     // If the message is from me (human using WhatsApp normally), register activity and ignore.
     if (msg.fromMe) {
        if (msg.body && botSentMessagesBody.has(msg.body)) {
           // This message was sent by the bot! Ignore it and remove from tracking set.
           botSentMessagesBody.delete(msg.body);
           return;
        }
        
        userActiveChats[msg.to] = Date.now();
        console.log(`User active on chat ${msg.to}. Pausing bot for this chat.`);
        return;
     }

     if (!botEnabled) return;

     // Ignore group chats to prevent chaos unless explicitly enabled.
     const chat = await msg.getChat();
     if (chat.isGroup) {
         return; 
     }

     // If message is from someone else, but user was recently active, ignore it!
     const lastActive = userActiveChats[msg.from];
     if (lastActive && (Date.now() - lastActive) < USER_ACTIVE_TIMEOUT) {
         console.log(`Ignoring message from ${msg.from} due to recent user activity.`);
         return;
     }

     console.log(`Received message from ${msg.from}, waiting before replying...`);
     
     if (pendingChatReplies[msg.from]) {
         clearTimeout(pendingChatReplies[msg.from]);
     }

     pendingChatReplies[msg.from] = setTimeout(() => {
         delete pendingChatReplies[msg.from];
         processChatReply(chat, msg.from).catch(console.error);
     }, 5000); // 5 second delay to gather quick consecutive messages

  } catch (err) {
      console.error("Error setting up chat reply", err);
  }
}

async function processChatReply(chat: any, contactId: string) {
  try {
     console.log(`Bot handling batch messages for ${contactId}`);
     
     // Fetch recent messages for context
     const messages = await chat.fetchMessages({ limit: 20 });
     const contact = await chat.getContact();
     const contactName = contact.name || contact.pushname || "Them";
     
     // Use Gemini to generate a response
     const genAIQuery = messages.map((m: any) => `[${m.fromMe ? 'Me' : contactName}]: ${m.body}`).join('\n');
     
     const prompt = `
     ${trainingPrompt}
     
     CRITICAL CONTEXT RULES:
     Analyze the "recent chat history" below. Pay close attention to how I ("Me") speak to "${contactName}".
     You must strictly match the relationship dynamic, tone, and formatting. 
     - If we talk like close friends, use slang, informal words, and matching emojis.
     - If it's a romantic partner, mirror the affectionate tone naturally.
     - If it's professional, keep it polite and formal.
     - Notice if I usually give short 1-word answers or longer paragraphs, and copy that style.
     
     Here is the recent chat history:
     ${genAIQuery}
     
     Based on the conversation and your persona instructions, decide how to reply back to '${contactName}'.
     Humans often break their thoughts into multiple short messages instead of one long paragraph. 
     CRITICAL INSTRUCTIONS:
     1. DO NOT repeat yourself. If you already asked a question, do not ask it again.
     2. DO NOT answer exactly the same way if they send multiple fast messages. Read the full context before replying.
     3. Your response MUST be a valid JSON array of strings (e.g. ["first message", "second message"]). 
     4. Your response MUST be written in perfect, grammatically correct, and natural-sounding Sinhala language, unless the conversation context explicitly demands otherwise.
     Do not include prefixes like "Me:". Just the raw messages inside the JSON array. Only output the JSON array, no markdown blocks.
     `;

     const ai = initGenAI();
     const response = await ai.models.generateContent({
         model: "gemini-3.5-flash",
         contents: [{ text: prompt }]
     });

     if (response.text) {
        let replyTexts = [];
        try {
            // try to parse JSON
            let cleanText = response.text.trim();
            if (cleanText.startsWith("```json")) {
                cleanText = cleanText.substring(7);
            }
            if (cleanText.startsWith("```")) {
                cleanText = cleanText.substring(3);
            }
            if (cleanText.endsWith("```")) {
                cleanText = cleanText.substring(0, cleanText.length - 3);
            }
            replyTexts = JSON.parse(cleanText.trim());
            if (!Array.isArray(replyTexts)) {
                replyTexts = [response.text.trim()]; // Fallback if not an array
            }
        } catch (e) {
            // Fallback to single message
            replyTexts = [response.text.trim()];
        }

        for (const replyText of replyTexts) {
            // Humanized delay logic:
            // reading delay (1.5s to 3s base) + typing delay (50ms per character)
            const readingDelay = Math.floor(Math.random() * 1500) + 1500;
            const typingDelay = replyText.length * 50; 
            const totalDelay = Math.min(readingDelay + typingDelay, 10000); // Cap at 10 seconds per message
            
            // Wait for reading delay before starting to type
            await new Promise(resolve => setTimeout(resolve, readingDelay));

            // Try to show typing indicator during typing delay
            try {
                if (chat.sendStateTyping) await chat.sendStateTyping();
            } catch (e) {
                // ignore if unsupported
            }
            
            // Wait simulating human typing
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            // Try to clear typing indicator
            try {
                if (chat.clearState) await chat.clearState();
            } catch (e) {
                // ignore if unsupported
            }

            botSentMessagesBody.add(replyText);
            // Backup cleanup if message_create fails to catch it
            setTimeout(() => botSentMessagesBody.delete(replyText), 120000);

            await chat.sendMessage(replyText);
        }
     }
  } catch (err) {
      console.error("Error handling incoming message", err);
  }
}
