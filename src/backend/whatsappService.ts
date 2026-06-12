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

let trainingPrompt: string = "You are a helpful assistant.";
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
        The prompt should start with: "You are a proxy for me on WhatsApp. Respond exactly as I do. Here are your persona rules: ..."
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
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
   
   const now = new Date();
   // Pad components to handle locale edge cases safely
   const y = now.getFullYear();
   const m = String(now.getMonth() + 1).padStart(2, '0');
   const d = String(now.getDate()).padStart(2, '0');
   const dateStr = `${y}-${m}-${d}`;
   const timeStr = now.toTimeString().slice(0, 5); // "HH:mm"

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

async function handleMessage(msg: any) {
  try {
     // If the message is from me (human using WhatsApp normally), register activity and ignore.
     if (msg.fromMe) {
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

     console.log(`Bot handling message from ${msg.from}: ${msg.body}`);
     
     // Fetch recent messages for context
     const messages = await chat.fetchMessages({ limit: 10 });
     
     // Use Gemini to generate a response
     const genAIQuery = messages.map((m: any) => `[${m.fromMe ? 'Me' : 'Them'}]: ${m.body}`).join('\n');
     
     const prompt = `
     ${trainingPrompt}
     
     Here is the recent chat history:
     ${genAIQuery}
     
     Based on the conversation and your persona instructions, generate a single text response to reply back to 'Them'.
     Do not include prefixes like "Me:". Just the raw message.
     `;

     const ai = initGenAI();
     const response = await ai.models.generateContent({
         model: "gemini-2.5-flash",
         contents: [{ text: prompt }]
     });

     if (response.text) {
        await chat.sendMessage(response.text.trim());
     }
  } catch (err) {
      console.error("Error handling incoming message", err);
  }
}
