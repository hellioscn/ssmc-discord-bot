const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const TOKEN = process.env.DISCORD_TOKEN; 
const MEMBERS_CHANNEL_ID = '1283170980315005048';
const MEMORIAL_CHANNEL_ID = '1283455369212858473';
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let cache = {
    members: { data: null, lastRefresh: null },
    memorial: { data: null, lastRefresh: null }
};

async function fetchFromChannel(channelId) {
    console.log(`--- Tarama Başlatıldı [${channelId}] [${new Date().toLocaleTimeString()}] ---`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error(`KRİTİK HATA: Kanal bulunamadı! [${channelId}]`);
            return { members: [], error: "Kanal bulunamadı" };
        }

        const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        const archived = await channel.threads.fetchArchived({ type: 'public' }).catch(() => ({ threads: new Map() }));
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        console.log(`Kanal [${channelId}] - Görünür Başlık Sayısı: ${allThreads.length}`);

        const memberList = [];
        for (const thread of allThreads) {
            const messages = await thread.messages.fetch({ limit: 50 }).catch(e => { 
                console.log(`Hata (#${thread.name}): ${e.message}`); 
                return new Map();
            });
            
            let allImages = [];
            let fullBio = "";

            const sortedMsgs = Array.from(messages.values()).reverse();
            
            sortedMsgs.forEach(msg => {
                if (msg.attachments.size > 0) {
                    allImages.push(...msg.attachments.map(a => a.url));
                }
                if (msg.content && msg.content.trim().length > 0) {
                    fullBio += msg.content + "\n\n";
                }
            });

            if (allImages.length > 0 || fullBio.length > 0) {
                memberList.push({
                    isim: thread.name.toUpperCase(),
                    rol: channelId === MEMBERS_CHANNEL_ID ? "ÜYE" : "ANI",
                    gorsel: allImages[0] || "",
                    gorseller: allImages,
                    bilgi: fullBio.replace(/[\*`]/g, "").trim().replace(/\n/g, "<br>")
                });
            }
        }
        
        console.log(`Kanal [${channelId}] - İşlem Tamamlandı: ${memberList.length} Kayıt.`);
        return {
            members: memberList,
            lastRefresh: new Date().toLocaleString('tr-TR')
        };
    } catch (err) {
        console.error(`REFRESH ERROR [${channelId}]:`, err);
        return { members: [], error: err.message };
    }
}

app.get('/api/members', async (req, res) => {
    if (!cache.members.data || cache.members.data.members.length === 0) {
        cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    }
    res.json(cache.members.data);
});

app.get('/api/memoryof', async (req, res) => {
    if (!cache.memorial.data || cache.memorial.data.members.length === 0) {
        cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
    }
    res.json(cache.memorial.data);
});

app.get('/api/refresh', async (req, res) => {
    cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
    res.json({ message: "Tüm cache yenilendi" });
});

client.once('ready', async () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
