const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// --- AYARLAR (Burayı Kendi Bilgilerinle Doldur) ---
const TOKEN = 'SENIN_BOT_TOKENIN_BURAYA';
const CHANNEL_ID = 'SENIN_FORUM_KANAL_ID_BURAYA';
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Veri Ayrıştırma Fonksiyonu (Regex ile)
function parseMemberData(post) {
    const content = post.content || "";
    const title = post.thread ? post.thread.name : (content.split('\n')[0] || "Bilinmeyen Üye");
    
    // Mesaj içinden bilgileri ayıkla (Born, Age, Status vb.)
    // Örnek: Born: October 13, 1980 -> Born: October 13, 1980
    const born = content.match(/Born:\s*(.*)/i)?.[1]?.trim() || "";
    const age = content.match(/Age:\s*(\d+)/i)?.[1]?.trim() || "";
    const role = content.match(/Role:\s*(.*)/i)?.[1]?.trim() || "ÜYE";
    const occupations = content.match(/Occupations:\s*(.*)/i)?.[1]?.trim() || "";

    // İlk görseli üye resmi olarak al
    const image = post.attachments.first()?.url || "";

    // Biyografi (Bilgi) kısmını temizle
    let info = content;
    // Kodları ve başlıkları temizle (isteğe bağlı)
    info = info.replace(/\*.*?\*/g, "").replace(/Born:.*|Age:.*|Occupations:.*/gi, "").trim();

    return {
        isim: title.toUpperCase(),
        rol: role.toUpperCase(),
        gorsel: image,
        tarih: born,
        bilgi: info || occupations || "Silence Souls M.C. Üyesi"
    };
}

app.get('/api/members', async (req, res) => {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel || !channel.isThreadContainer()) {
            return res.status(404).json({ error: "Forum kanalı bulunamadı veya yanlis ID." });
        }

        // Forum başlıklarını (Thread) çek
        const threads = await channel.threads.fetchActive();
        const memberList = [];

        for (const [id, thread] of threads.threads) {
            // Her başlığın ilk mesajını (üyenin ana postu) al
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                memberList.push(parseMemberData(firstMsg));
            }
        }

        res.json(memberList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Discord verisi çekilemedi." });
    }
});

client.once('ready', () => {
    console.log(`Bot Aktif: ${client.user.tag}`);
});

client.login(TOKEN);

app.listen(PORT, () => {
    console.log(`API Sunucusu çalışıyor: http://localhost:${PORT}`);
});
