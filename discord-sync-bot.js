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

async function refreshCache() {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel || !channel.isThreadContainer()) return;

        const active = await channel.threads.fetchActive();
        const archived = await channel.threads.fetchArchived({ type: 'public', fetchAll: true });
        const allThreads = [...(active.threads ? active.threads.values() : []), ...(archived.threads ? archived.threads.values() : [])];
        
        const memberList = [];
        for (const thread of allThreads) {
            const messages = await thread.messages.fetch();
            let allImages = [];
            let fullBio = "";

            // Mesajları kronolojik sıraya sok ve içerikleri topla
            messages.reverse().forEach(msg => {
                if (msg.attachments.size > 0) allImages.push(...msg.attachments.map(a => a.url));
                if (msg.content) fullBio += msg.content + "\n";
            });

            memberList.push({
                isim: thread.name.toUpperCase(),
                rol: "ÜYE", 
                gorsel: allImages[0] || "",
                gorseller: allImages,       
                bilgi: fullBio.replace(/\*+/g, "").trim().replace(/\n/g, "<br>")
            });
        }
        cachedMembers = memberList;
        lastCacheUpdate = Date.now();
        console.log("Veriler Tazelendi.");
    } catch (err) { console.error("Hata:", err.message); }
}

app.get('/api/members', async (req, res) => {
    if (cachedMembers.length === 0 || (Date.now() - lastCacheUpdate > CACHE_LIMIT)) await refreshCache();
    res.json(cachedMembers);
});

app.get('/api/refresh', async (req, res) => {
    await refreshCache();
    res.json({ message: "Yenilendi", count: cachedMembers.length });
});

client.once('ready', () => { refreshCache(); });
client.login(TOKEN);
app.listen(PORT, () => console.log(`Aktif: ${PORT}`));
