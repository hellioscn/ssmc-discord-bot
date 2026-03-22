const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const TOKEN = process.env.DISCORD_TOKEN; 
const MEMBERS_CHANNEL_ID = '1283170980315005048';
const MEMORIAL_CHANNEL_ID = '1283455369212858473';
const GALLERY_CHANNEL_ID = '1485411952137076746';
const PATCHES_CHANNEL_ID = '1485409905765781555';
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bot_data.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let cache = {
    members: { data: null, lastRefresh: null },
    memorial: { data: null, lastRefresh: null },
    gallery: { data: null, lastRefresh: null },
    patches: { data: null, lastRefresh: null }
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
                    rol: channelId === MEMBERS_CHANNEL_ID ? "ÜYE" : (channelId === MEMORIAL_CHANNEL_ID ? "ANI" : (channelId === GALLERY_CHANNEL_ID ? "GALERİ" : "YAMA")),
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

async function bulkRefresh() {
    console.log("--- Toplu Veri Çekme İşlemi Başlatıldı ---");
    try {
        const [members, memorial, gallery, patches] = await Promise.all([
            fetchFromChannel(MEMBERS_CHANNEL_ID),
            fetchFromChannel(MEMORIAL_CHANNEL_ID),
            fetchFromChannel(GALLERY_CHANNEL_ID),
            fetchFromChannel(PATCHES_CHANNEL_ID)
        ]);
        cache.members.data = members;
        cache.memorial.data = memorial;
        cache.gallery.data = gallery;
        cache.patches.data = patches;
        
        // Diske Kaydet
        fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
        console.log("--- Veriler Diske Kaydedildi ve Önbelleklendi ---");
        return true;
    } catch (err) {
        console.error("Bulk Refresh Error:", err);
        return false;
    }
}

function loadInitialData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            cache.members.data = parsed.members?.data || null;
            cache.memorial.data = parsed.memorial?.data || null;
            cache.gallery.data = parsed.gallery?.data || null;
            cache.patches.data = parsed.patches?.data || null;
            console.log("--- Başlangıç Verileri Diskten Yüklendi ---");
        } catch (e) {
            console.error("Diskten veri yükleme hatası:", e);
        }
    }
}

// REST API — Sadece Cache'den döner (Hızlı ve Stabil)
app.get('/api/members', (req, res) => res.json(cache.members.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/memoryof', (req, res) => res.json(cache.memorial.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/gallery', (req, res) => res.json(cache.gallery.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/patches', (req, res) => res.json(cache.patches.data || { members: [], error: "Henüz veri yüklenmedi" }));

app.get('/api/refresh', async (req, res) => {
    const success = await bulkRefresh();
    if (success) res.json({ message: "Tüm veriler yenilendi" });
    else res.status(500).json({ error: "Yenileme hatası" });
});

// Discord Komutları
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!bot-refresh') {
        message.channel.send("🔄 Veriler yenileniyor, lütfen bekleyin...");
        const success = await bulkRefresh();
        if (success) message.channel.send("✅ Tüm veriler başarıyla yenilendi ve diske kaydedildi.");
        else message.channel.send("❌ Veri yenileme sırasında bir hata oluştu.");
    }
});

client.once('ready', () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    loadInitialData(); // Önce diskten yükle (hız için)
    
    // Günde bir kez otomatik yenileme (24 saat = 86400000 ms)
    setInterval(bulkRefresh, 86400000);
    console.log("Günlük otomatik yenileme zamanlayıcısı aktif.");
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
