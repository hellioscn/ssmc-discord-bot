const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// --- AYARLAR ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNEL_ID = '1283170980315005048';
const PORT = process.env.PORT || 3000;
const CACHE_LIMIT = 24 * 60 * 60 * 1000; // 24 Saat

// --- ÖNBELLEK ---
let cachedMembers = [];
let lastCacheUpdate = 0;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Veri Ayrıştırma - İsim Garantili Sürüm
function parseMemberData(post, threadName) {
    const content = post.content || "";
    const name = (threadName || "Bilinmeyen Üye").replace(/\*+/g, "").trim().toUpperCase();
    const images = post.attachments.map(a => a.url);

    return {
        isim: name,
        rol: "ÜYE",
        gorsel: images[0] || "",
        gorseller: images,
        bilgi: content.replace(/\*+/g, "").trim().replace(/\n/g, "<br>")
    };
}

// Discord'dan Veri Çekme - Arşiv ve Hız Optimize
async function refreshCache() {
    try {
        console.log("Tarama başlatıldı...");
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) return console.log("Hata: Kanal bulunamadı.");

        const active = await channel.threads.fetchActive();
        const archived = await channel.threads.fetchArchived({ type: 'public', limit: 50 });
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        const memberList = [];
        for (const thread of allThreads) {
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                memberList.push(parseMemberData(firstMsg, thread.name));
            }
        }
        cachedMembers = memberList;
        lastCacheUpdate = Date.now();
        console.log(`Bitti: ${cachedMembers.length} üye yüklendi.`);
    } catch (err) { console.error("Hata:", err.message); }
}

// API Endpointleri
app.get('/api/members', async (req, res) => {
    if (cachedMembers.length === 0 || (Date.now() - lastCacheUpdate > CACHE_LIMIT)) await refreshCache();
    res.json(cachedMembers);
});

app.get('/api/refresh', async (req, res) => {
    await refreshCache();
    res.json({ message: "Yenilendi", count: cachedMembers.length });
});

client.once('ready', () => { 
    console.log(`Bot Yayında: ${client.user.tag}`);
    refreshCache(); 
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Aktif port: ${PORT}`));
