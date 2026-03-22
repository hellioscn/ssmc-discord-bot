const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNEL_ID = '1283170980315005048';
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

async function refreshCache() {
    console.log("--- Tarama Başlatıldı [" + new Date().toLocaleTimeString() + "] ---");
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.log("KRİTİK HATA: Kanal bulunamadı!");
            return { members: [], error: "Kanal bulunamadı" };
        }

        const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        const archived = await channel.threads.fetchArchived({ type: 'public' }).catch(() => ({ threads: new Map() }));
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        console.log(`Görünür Başlık Sayısı: ${allThreads.length}`);

        const memberList = [];
        for (const thread of allThreads) {
            // Limiti 50'ye çekiyoruz (Daha stabil, performanslı ve Rate Limit dostu)
            const messages = await thread.messages.fetch({ limit: 50 }).catch(e => { 
                console.log(`Hata (#${thread.name}): ${e.message}`); 
                return new Map();
            });
            
            let allImages = [];
            let fullBio = "";

            // Mesajları kronolojikleştir
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
                    rol: "ÜYE",
                    gorsel: allImages[0] || "",
                    gorseller: allImages,
                    bilgi: fullBio.replace(/[\*_`]/g, "").trim().replace(/\n/g, "<br>")
                });
            }
        }
        
        console.log(`İşlem Tamamlandı: ${memberList.length} Üye.`);
        return {
            members: memberList,
            lastRefresh: new Date().toLocaleString('tr-TR')
        };
    } catch (err) {
        console.error("REFRESH ERROR:", err);
        return { members: [], error: err.message };
    }
}


app.get('/api/members', async (req, res) => {
    // Eğer cache boşsa veya hata döndüyse yenile
    if (!cachedData || !cachedData.members || cachedData.members.length === 0) {
        cachedData = await refreshCache();
    }
    res.json(cachedData);
});


app.get('/api/refresh', async (req, res) => {
    cachedData = await refreshCache();
    res.json({ message: "Yenilendi", count: cachedData.length });
});

client.once('ready', async () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    cachedData = await refreshCache();
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
