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
        if (!channel) return { members: [], error: "Kanal bulunamadı" };

        const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        const archived = await channel.threads.fetchArchived({ type: 'public' }).catch(() => ({ threads: new Map() }));
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        const memberList = [];
        for (const thread of allThreads) {
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
                // Kapsamlı Bio Ayrıştırma (Backend-side)
                const urlRegex = /https?:\/\/[^\s\)\>\]\"\<]+/g;
                let lines = fullBio.split('\n');
                let formattedLines = lines.map(line => {
                    let text = line.trim()
                        .replace(urlRegex, '') // Linkleri sil
                        .replace(/[\\*_~`|]/g, "") // Markdown sembollerini sil
                        .replace(/[\u200b\u200c\u200d\u180e\ufeff]/g, "") // Gizli Unicode sil
                        .replace(/^>\s+/gm, ""); // Quote sil
                    
                    if (!text) return "";

                    // İlk iki nokta üst üsteyi bul
                    const colonIndex = text.indexOf(':');
                    if (colonIndex > 0 && colonIndex < 25) {
                        const key = text.substring(0, colonIndex + 1);
                        const value = text.substring(colonIndex + 1);
                        
                        // Key kontrolü: Cümle bitiş işareti içermemeli ve maks 3 kelime olmalı
                        const keyTrimmed = key.trim();
                        if (!/[.!?]/.test(keyTrimmed) && keyTrimmed.split(/\s+/).length <= 3) {
                            return `<span class="bio-key">${key}</span>${value}`;
                        }
                    }
                    return text;
                });

                let cleanBilgi = formattedLines
                    .filter(l => l !== "") // Boş satırları at
                    .join('<br>') // Satırları birleştir
                    .replace(/(<br>){3,}/g, "<br><br>"); // 3+ boşluğu 2'ye indir

                memberList.push({
                    isim: thread.name.toUpperCase(),
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
    if (!cache.members.data) cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    res.json(cache.members.data);
});

app.get('/api/memoryof', async (req, res) => {
    if (!cache.memorial.data) cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
    res.json(cache.memorial.data);
});

app.get('/api/refresh', async (req, res) => {
    cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
    res.json({ message: "Tüm veriler yenilendi" });
});

client.once('ready', async () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    cache.members.data = await fetchFromChannel(MEMBERS_CHANNEL_ID);
    cache.memorial.data = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
