const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// --- AYARLAR ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNEL_ID = '1283170980315005048';
const PORT = process.env.PORT || 3000;
const CACHE_LIMIT = 24 * 60 * 60 * 1000; // 24 Saat (Milisaniye)

// --- ÖNBELLEK DEĞİŞKENLERİ ---
let cachedMembers = [];
let lastCacheUpdate = 0;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Veri Ayrıştırma Fonksiyonu
function parseMemberData(post) {
    const content = post.content || "";
    let name = post.thread ? post.thread.name : "";
    
    if (!name || name === "") {
        name = content.match(/(?:İsim|Name|Adı):\s*(.*)/i)?.[1]?.trim() || content.split('\n')[0];
    }
    if (!name || name.length > 50) name = "Bilinmeyen Üye";

    const born = content.match(/Born:\s*(.*)/i)?.[1]?.trim() || "";
    const role = content.match(/Role:\s*(.*)/i)?.[1]?.trim() || "ÜYE";
    const images = post.attachments.map(a => a.url);

    let info = content;
    info = info.replace(/(?:İsim|Name|Adı|Born|Age|Occupations|Role):.*/gi, "").replace(/\*.*?\*/g, "").trim();

    return {
        isim: name.toUpperCase(),
        rol: role.toUpperCase(),
        gorsel: images[0] || "", 
        gorseller: images,       
        tarih: born,
        bilgi: info || "Silence Souls M.C. Üyesi"
    };
}

// Discord'dan Veri Çekme Fonksiyonu
async function refreshCache() {
    try {
        console.log("Discord'dan güncel veriler çekiliyor...");
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel || !channel.isThreadContainer()) {
            console.error("Hata: Forum kanalı bulunamadı.");
            return;
        }

        const threads = await channel.threads.fetchActive();
        const memberList = [];

        for (const [id, thread] of threads.threads) {
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                firstMsg.thread = thread;
                memberList.push(parseMemberData(firstMsg));
            }
        }

        cachedMembers = memberList;
        lastCacheUpdate = Date.now();
        console.log(`${cachedMembers.length} üye önbelleğe alındı.`);
    } catch (err) {
        console.error("Önbellek yenilenirken hata:", err.message);
    }
}

// API Endpoint - Her zaman bellekteki veriyi döner
app.get('/api/members', async (req, res) => {
    const now = Date.now();
    
    // Eğer önbellek boşsa veya süresi dolmuşsa (24 saat) yenile
    if (cachedMembers.length === 0 || (now - lastCacheUpdate > CACHE_LIMIT)) {
        await refreshCache();
    }

    res.json(cachedMembers);
});

// Manuel Yenileme Linki (İsteğe bağlı: https://botadi.onrender.com/api/refresh)
app.get('/api/refresh', async (req, res) => {
    await refreshCache();
    res.json({ message: "Önbellek manuel olarak yenilendi.", count: cachedMembers.length });
});

client.once('ready', () => { 
    console.log(`Bot Aktif: ${client.user.tag}`); 
    refreshCache(); // Başlangıçta 1 kez verileri çek
});

client.login(TOKEN);
app.listen(PORT, () => { console.log(`API Sunucusu çalışıyor: PORT ${PORT}`); });
