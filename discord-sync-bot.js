const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// --- AYARLAR ---
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

function parseMemberData(post) {
    const content = post.content || "";
    const title = post.thread ? post.thread.name : (content.split('\n')[0] || "Bilinmeyen Üye");
    const born = content.match(/Born:\s*(.*)/i)?.[1]?.trim() || "";
    const role = content.match(/Role:\s*(.*)/i)?.[1]?.trim() || "ÜYE";
    
    // TÜM GÖRSELLERİ TOPLA
    const images = post.attachments.map(a => a.url);

    let info = content;
    info = info.replace(/\*.*?\*/g, "").replace(/Born:.*|Age:.*|Occupations:.*|Role:.*/gi, "").trim();

    return {
        isim: title.toUpperCase(),
        rol: role.toUpperCase(),
        gorsel: images[0] || "", 
        gorseller: images,       
        tarih: born,
        bilgi: info || "Silence Souls M.C. Üyesi"
    };
}

app.get('/api/members', async (req, res) => {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel || !channel.isThreadContainer()) return res.status(404).json({ error: "Forum kanalı bulunamadı." });
        const threads = await channel.threads.fetchActive();
        const memberList = [];
        for (const [id, thread] of threads.threads) {
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMsg = messages.first();
            if (firstMsg) {
                firstMsg.thread = thread;
                memberList.push(parseMemberData(firstMsg));
            }
        }
        res.json(memberList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Discord verisi çekilemedi.", detay: err.message });
    }
});

client.once('ready', () => { console.log(`Bot Aktif: ${client.user.tag}`); });
client.login(TOKEN);
app.listen(PORT, () => { console.log(`API Sunucusu çalışıyor: PORT ${PORT}`); });
