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
    console.log("--- Taram Başlatıldı ---");
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.log("KRİTİK HATA: Kanal bulunamadı! ID yanlış olabilir.");
            return [];
        }

        console.log(`Kanal Bulundu: #${channel.name} | Tip: ${channel.type} (Forum=15)`);

        // Aktif ve Arşivlenmiş başlıkları çek
        const active = await channel.threads.fetchActive().catch(e => { console.log("Aktif çekme hatası:", e.message); return { threads: new Map() }});
        const archived = await channel.threads.fetchArchived({ type: 'public' }).catch(e => { console.log("Arşiv çekme hatası:", e.message); return { threads: new Map() }});
        
        const allThreads = [
            ...(active.threads ? Array.from(active.threads.values()) : []),
            ...(archived.threads ? Array.from(archived.threads.values()) : [])
        ];
        
        console.log(`Toplam Görünür Başlık: ${allThreads.length}`);

        const memberList = [];
        for (const thread of allThreads) {
            // Mesaj limitini 100'e çıkarıyoruz (tüm biyografi ve resimler için)
            const messages = await thread.messages.fetch({ limit: 100 }).catch(e => { 
                console.log(`Mesaj çekilemedi (#${thread.name}):`, e.message); 
                return new Map() 
            });
            
            let allImages = [];
            let fullBio = "";

            // Mesajları kronolojik (eskiden yeniye) sıralayarak birleştir
            messages.reverse().forEach(msg => {
                // Görselleri topla
                if (msg.attachments.size > 0) {
                    allImages.push(...msg.attachments.map(a => a.url));
                }
                // Metin içeriğini (varsa) topla
                if (msg.content && msg.content.trim().length > 0) {
                    fullBio += msg.content + "\n\n";
                }
            });

            memberList.push({
                isim: thread.name.toUpperCase(),
                rol: "ÜYE",
                gorsel: allImages[0] || "",
                gorseller: allImages,
                // Biyografiyi temizle (Markdown karakterlerini ve gereksiz boşlukları at)
                bilgi: fullBio.replace(/[\*_`]/g, "").trim().replace(/\n/g, "<br>")
            });
        }
        
        console.log(`Başarıyla Ayrıştırılan Üye: ${memberList.length}`);
        return {
            members: memberList,
            lastRefresh: new Date().toLocaleString('tr-TR')
        };
    } catch (err) {
        console.error("GENEL HATA:", err.stack);
        return [];
    }
}

let cachedData = [];
app.get('/api/members', async (req, res) => {
    if (cachedData.length === 0) cachedData = await refreshCache();
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
