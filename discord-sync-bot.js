const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNEL_ID = '1283170980315005048'; // Mevcut ID
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- KANAL BULUCU FONKSİYON ---
function listAllChannels() {
    console.log("--- Botun Görebildiği Kanallar Listeleniyor ---");
    client.guilds.cache.forEach(guild => {
        console.log(`Sunucu: ${guild.name}`);
        guild.channels.cache.forEach(ch => {
            // Sadece Forum (type 15) veya Yazı (type 0) kanallarını göster
            if (ch.type === 15 || ch.type === 0) {
                console.log(`Kanal Adı: #${ch.name} | ID: ${ch.id} | Tip: ${ch.type === 15 ? 'FORUM' : 'YAZI'}`);
            }
        });
    });
    console.log("----------------------------------------------");
}

app.get('/api/members', async (req, res) => {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        console.log(`Şu an taranan kanal: #${channel?.name} (Tip: ${channel?.type})`);
        
        const active = await channel.threads.fetchActive();
        const archived = await channel.threads.fetchArchived();
        const allThreads = [...active.threads.values(), ...archived.threads.values()];
        
        res.json({ debug_info: "Kanal bulundu", thread_count: allThreads.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

client.once('ready', () => { 
    console.log(`Bot Aktif: ${client.user.tag}`); 
    listAllChannels(); // Başlangıçta tüm kanalları loglara dök
});

client.login(TOKEN);
app.listen(PORT, () => console.log("Debug mod aktif."));
