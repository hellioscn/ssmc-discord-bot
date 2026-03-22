const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
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
    let name = post.thread ? post.thread.name : "";
    if (!name) name = content.match(/(?:İsim|Name|Adı):\s*(.*)/i)?.[1]?.trim() || content.split('\n')[0];
    if (!name || name.length > 50) name = "Bilinmeyen Üye";

    const born = content.match(/Born:\s*(.*)/i)?.[1]?.trim() || "";
    const role = content.match(/Role:\s*(.*)/i)?.[1]?.trim() || "ÜYE";
    const images = post.attachments.map(a => a.url);
    let info = content.replace(/(?:İsim|Name|Adı|Born|Age|Occupations|Role):.*/gi, "").replace(/\*.*?\*/g, "").trim();

    return { isim: name.toUpperCase(), rol: role.toUpperCase(), gorsel: images[0] || "", gorseller: images, tarih: born, bilgi: info || "Silence Souls M.C. Üyesi" };
}

async function refreshCache() {
    try {
        console.log("Kanal taranıyor...");
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) return console.log("Hata: Kanal bulunamadı.");

        // Hem Aktif hem de Arşivlenmiş başlıkları topla
        const activeThreads = await channel.threads.fetchActive();
        const archivedThreads = await channel.threads.fetchArchived({ type: 'public', fetchAll: true });
        
        const allThreads = [
            ...(activeThreads.threads ? activeThreads.threads.values() : []),
            ...(archivedThreads.threads ? archivedThreads.threads.values() : [])
        ];
        
        console.log(`Bulunan Toplam Başlık Sayısı: ${allThreads.length}`);

        const memberList = [];
        for (const thread of allThreads) {
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                firstMsg.thread = thread;
                memberList.push(parseMemberData(firstMsg));
            }
        }
        cachedMembers = memberList;
        lastCacheUpdate = Date.now();
    } catch (err) { console.error("Hata Detayı:", err.message); }
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

client.once('ready', () => { refreshCache(); });
client.login(TOKEN);
app.listen(PORT, () => { console.log(`Aktif: ${PORT}`); });
