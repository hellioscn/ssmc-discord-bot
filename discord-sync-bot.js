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

// Discord OwnerID -> Karakter Adı eşleşmesi için global harita
let userToCharacterMap = {};

async function refreshAllData() {
    console.log("--- Global Senkronizasyon Başlatıldı ---");
    
    // Önce Üyeleri tarayalım ki haritayı dolduralım
    const membersData = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    cache.members.data = membersData;
    cache.members.lastRefresh = new Date().toLocaleString('tr-TR');

    // Sonra Kayıpları tarayalım (Üyelerden gelen haritayı kullanabilir)
    const memorialData = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
    cache.memorial.data = memorialData;
    cache.memorial.lastRefresh = new Date().toLocaleString('tr-TR');
    
    console.log("--- Global Senkronizasyon Tamamlandı ---");
}

async function fetchFromChannel(channelId) {
    console.log(`--- Tarama Başlatıldı [${channelId}] [${new Date().toLocaleTimeString()}] ---`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return { members: [], error: "Kanal bulunamadı" };

        const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        const archived = await channel.threads.fetchArchived({ type: 'public' }).catch(() => ({ threads: new Map() }));
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        const memberList = [];
        for (const thread of allThreads) {
            // Eğer Üyeler kanalını tarıyorsak, sahiplik eşleşmesini kaydet
            if (channelId === MEMBERS_CHANNEL_ID) {
                userToCharacterMap[thread.ownerId] = thread.name.toUpperCase();
            }

            const messages = await thread.messages.fetch({ limit: 50 }).catch(() => new Map());
            
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
                const characterName = thread.name.toUpperCase();
                // Biyografi içindeki Discord etiketlerini (<@123...>) sitemizdeki isimlerle değiştir
                let cleanBilgi = fullBio.replace(/[\*`|]/g, "").trim().replace(/\n/g, "<br>");
                
                // Etiketleri (mention) bul ve haritadan karşılığını yaz
                cleanBilgi = cleanBilgi.replace(/<@!?(\d+)>/g, (match, userId) => {
                    return userToCharacterMap[userId] || match; 
                });

                memberList.push({
                    isim: characterName,
                    sahibi: userToCharacterMap[thread.ownerId] || thread.ownerId, 
                    rol: channelId === MEMBERS_CHANNEL_ID ? "ÜYE" : "ANI",
                    gorsel: allImages[0] || "",
                    gorseller: allImages,
                    bilgi: cleanBilgi
                });
            }
        }
        
        return { members: memberList, lastRefresh: new Date().toLocaleString('tr-TR') };
    } catch (err) {
        console.error(`Error [${channelId}]:`, err);
        return { members: [], error: err.message };
    }
}

app.get('/api/members', async (req, res) => {
    if (!cache.members.data) await refreshAllData();
    res.json(cache.members.data);
});

app.get('/api/memoryof', async (req, res) => {
    if (!cache.memorial.data) await refreshAllData();
    res.json(cache.memorial.data);
});

app.get('/api/refresh', async (req, res) => {
    await refreshAllData();
    res.json({ message: "Tüm cache ve haritalar yenilendi", count: Object.keys(userToCharacterMap).length });
});

client.once('ready', async () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    await refreshAllData();
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
