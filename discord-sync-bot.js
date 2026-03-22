const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNEL_ID = '1283170980315005048';
const PORT = process.env.PORT || 3000;
const CACHE_LIMIT = 24 * 60 * 60 * 1000; 

let cachedMembers = [];
let lastCacheUpdate = 0;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

function parseMemberData(post) {
    const content = post.content || "";
    // İsmi her zaman Forum Başlığından al (En güvenlisi)
    let name = post.thread ? post.thread.name : (content.split('\n')[0] || "ÜYE");
    name = name.replace(/\*+/g, "").trim().toUpperCase();

    // Biyografiyi temizle (BORN, AGE gibi başlıkları metin içinde kalsın ama süslü kalsın)
    let info = content.replace(/\*+/g, "").trim();

    const images = post.attachments.map(a => a.url);

    return {
        isim: name,
        rol: "ÜYE",
        gorsel: images[0] || "",
        gorseller: images,
        bilgi: info.replace(/\n/g, "<br>")
    };
}

async function refreshCache() {
    try {
        console.log("Tarama başlatıldı...");
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) return console.log("Kanal bulunamadı.");

        // Aktif ve Arşivlenmiş başlıkları çek (Limitleri makul tutalım)
        const active = await channel.threads.fetchActive();
        const archived = await channel.threads.fetchArchived({ type: 'public', limit: 50 });
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        console.log(`Toplam başlık: ${allThreads.length}`);

        const memberList = [];
        for (const thread of allThreads) {
            // Sadece ilk mesajı çekmek çok daha hızlıdır
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                firstMsg.thread = thread;
                memberList.push(parseMemberData(firstMsg));
            }
        }
        cachedMembers = memberList;
        lastCacheUpdate = Date.now();
        console.log("Veriler başarıyla güncellendi.");
    } catch (err) { console.error("HATA:", err.message); }
}

app.get('/api/members', async (req, res) => {
    if (cachedMembers.length === 0 || (Date.now() - lastCacheUpdate > CACHE_LIMIT)) {
        await refreshCache();
    }
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
