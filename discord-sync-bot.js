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
const KULTUR_CHANNEL_ID = '1259277964294623332';
const MAP_FORUM_CHANNEL_ID = '1485447522720940123';
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bot_data.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- NORMALIZATION HELPER ---
const normalizeCountry = (name) => {
    if (!name) return "USA";
    const n = name.toUpperCase().replace(/[#.]/g, '').trim(); 
    if (n === "TURKIYE" || n === "TURKEY" || n === "TR") return "TURKIYE";
    if (n === "USA" || n === "ABD" || n === "US") return "USA";
    if (n === "GERMANY" || n === "ALMANYA" || n === "GER") return "GERMANY";
    if (n === "IRELAND" || n === "IRLANDA" || n === "IRE") return "IRELAND";
    return n;
};

let cache = {
    members: { data: null, lastRefresh: null },
    memorial: { data: null, lastRefresh: null },
    gallery: { data: null, lastRefresh: null },
    patches: { data: null, lastRefresh: null },
    kultur: { data: null, lastRefresh: null },
    mapData: { data: null, lastRefresh: null }
};

async function fetchMapData() {
    console.log(`--- Harita Veri Taraması Başlatıldı [${new Date().toLocaleTimeString()}] ---`);
    try {
        const channel = await client.channels.fetch(MAP_FORUM_CHANNEL_ID);
        if (!channel) return { error: "Kanal bulunamadı" };

        const result = {};

        // 1. ÖNCE THREADS (FORUM VEYA BAŞLIKLI KANAL) DENE
        const fetchedThreads = await channel.threads?.fetchActive().catch(() => null);
        const threads = fetchedThreads ? Array.from(fetchedThreads.threads.values()) : [];

        if (threads.length > 0) {
            console.log(`${threads.length} adet başlık (thread) bulundu.`);
            for (const thread of threads) {
                const countryKey = normalizeCountry(thread.name);
                const messages = await thread.messages.fetch({ limit: 100 });
                result[countryKey] = parseMapMessages(messages);
            }
        } 

        // 2. THREADS YOKSA TÜM KANALI TARA (TEK KANAL DÜZENİ)
        if (Object.keys(result).length === 0) {
            console.log("Threads bulunamadı veya boş. Tek kanal mesaj modu deneniyor...");
            const messages = await channel.messages.fetch({ limit: 100 });
            let currentCountry = "GENERAL";
            let currentState = "GENERAL";

            const sortedMsgs = Array.from(messages.values()).reverse();
            sortedMsgs.forEach(msg => {
                const content = msg.content.trim();

                // # ÜLKE
                const countryMatch = content.match(/^#\s+([^\n]+)/);
                if (countryMatch) {
                    currentCountry = normalizeCountry(countryMatch[1]);
                    if (!result[currentCountry]) result[currentCountry] = {};
                    currentState = "GENERAL";
                    return;
                }

                // ## EYALET/STATE
                const stateMatch = content.match(/^##\s+([^\n]+)/);
                if (stateMatch) {
                    currentState = stateMatch[1].trim().toUpperCase();
                    if (!result[currentCountry]) result[currentCountry] = {};
                    if (!result[currentCountry][currentState]) result[currentCountry][currentState] = [];
                    return;
                }

                // ### ŞEHİR/CITY or **CITY**
                const cityMatch = content.match(/^(?:###|\*\*)\s*([^\*\n]+)/);
                if (cityMatch) {
                    let cityName = cityMatch[1].trim();
                    const isNew = cityName.includes(':SSMCNEW:');
                    cityName = cityName.replace(':SSMCNEW:', '').trim();

                    const description = content.replace(cityMatch[0], '').replace(/\*\*/g, '').trim().replace(/\n/g, '<br>');
                    const image = msg.attachments.first()?.url || 'assets/images/placeholder.png';

                    if (!result[currentCountry]) result[currentCountry] = {};
                    if (!result[currentCountry][currentState]) result[currentCountry][currentState] = [];
                    
                    result[currentCountry][currentState].push({
                        slug: cityName.toLowerCase().replace(/\s+/g, '_').replace(/_chapter|_charter/g, ''),
                        title: cityName,
                        content: description,
                        image: image,
                        isNew: isNew
                    });
                }
            });
        }

        // Filter: remove states with no cities, then remove countries with no states
        for (const country in result) {
            for (const state in result[country]) {
                if (!result[country][state] || result[country][state].length === 0) {
                    delete result[country][state];
                }
            }
            if (Object.keys(result[country]).length === 0) {
                delete result[country];
            }
        }

        return result;
    } catch (e) {
        console.error("Harita verisi çekme hatası:", e);
        return { error: e.message };
    }
}

function parseMapMessages(messages) {
    const states = {};
    let currentState = "GENERAL";
    const sortedMsgs = Array.from(messages.values()).reverse();

    sortedMsgs.forEach(msg => {
        const content = msg.content.trim();
        
        // ## EYALET/STATE header
        const stateMatch = content.match(/^##\s+([^\n]+)/);
        if (stateMatch) {
            currentState = stateMatch[1].trim().toUpperCase();
            if (!states[currentState]) states[currentState] = [];
            return;
        }

        // GLOBAL SCAN: extract ALL **CityName** or ### CityName entries from a single message
        // This handles the user's format where all cities are in one message
        const boldCityRegex = /\*\*([^\*]+)\*\*/g;
        const mdCityRegex = /^###\s+(.+)$/gm;
        
        let matched = false;
        let match;
        
        // Check for ### format (multi-line)
        while ((match = mdCityRegex.exec(content)) !== null) {
            let cityName = match[1].trim();
            const isNew = cityName.includes(':SSMCNEW:');
            cityName = cityName.replace(':SSMCNEW:', '').trim();
            const image = msg.attachments.first()?.url || 'assets/images/placeholder.png';
            if (!states[currentState]) states[currentState] = [];
            states[currentState].push({
                slug: cityName.toLowerCase().replace(/\s+/g, '_').replace(/_chapter|_charter/g, ''),
                title: cityName,
                content: '',
                image: image,
                isNew: isNew
            });
            matched = true;
        }
        
        // Check for **bold** format (all on same or separate lines)
        if (!matched) {
            while ((match = boldCityRegex.exec(content)) !== null) {
                let cityName = match[1].trim();
                if (!cityName || cityName.length < 2) continue;
                const isNew = cityName.includes(':SSMCNEW:');
                cityName = cityName.replace(':SSMCNEW:', '').trim();
                const image = msg.attachments.first()?.url || 'assets/images/placeholder.png';
                if (!states[currentState]) states[currentState] = [];
                states[currentState].push({
                    slug: cityName.toLowerCase().replace(/\s+/g, '_').replace(/_chapter|_charter/g, ''),
                    title: cityName,
                    content: '',
                    image: image,
                    isNew: isNew
                });
            }
        }
    });
    return states;
}

async function fetchFromChannel(channelId) {
    console.log(`--- Tarama Başlatıldı [${channelId}] [${new Date().toLocaleTimeString()}] ---`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return { members: [], error: "Kanal bulunamadı" };

        const fetchedActive = await channel.threads?.fetchActive().catch(() => null);
        const fetchedArchived = await channel.threads?.fetchArchived({ type: 'public' }).catch(() => null);

        const allThreads = [
            ...(fetchedActive?.threads ? Array.from(fetchedActive.threads.values()) : []),
            ...(fetchedArchived?.threads ? Array.from(fetchedArchived.threads.values()) : [])
        ];

        const memberList = [];

        // MOD 1: THREADS VARSA (Üye Düzeni)
        if (allThreads.length > 0) {
            for (const thread of allThreads) {
                const messages = await thread.messages.fetch({ limit: 50 }).catch(() => new Map());
                const msgsArr = Array.from(messages.values()).reverse();
                const data = parseMemberMessages(msgsArr, thread.name, channelId);
                if (data) memberList.push(data);
            }
        }

        // MOD 2: THREADS YOKSA (MESAJ DÜZENİ)
        if (memberList.length === 0) {
            console.log(`Kanal [${channelId}] içinde thread bulunamadı. Mesaj modu deneniyor...`);
            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
            const sortedMsgs = Array.from(messages.values()).reverse();

            sortedMsgs.forEach(msg => {
                const data = parseMemberMessages([msg], msg.author.username, channelId);
                if (data) memberList.push(data);
            });
        }

        return { members: memberList, lastRefresh: new Date().toLocaleString('tr-TR') };
    } catch (err) {
        console.error(`Error [${channelId}]:`, err);
        return { members: [], error: err.message };
    }
}

function parseMemberMessages(msgs, defaultName, channelId) {
    let allImages = [];
    let fullBio = "";

    msgs.forEach(msg => {
        if (msg.attachments.size > 0) allImages.push(...msg.attachments.map(a => a.url));
        if (msg.content && msg.content.trim().length > 0) fullBio += msg.content + "\n\n";
    });

    if (allImages.length === 0 && fullBio.length === 0) return null;

    const urlRegex = /https?:\/\/[^\s\)\>\]\"\<]+/g;
    let formattedLines = fullBio.split('\n').map(line => {
        let text = line.trim().replace(urlRegex, '').replace(/[\\*_~`|]/g, "").replace(/[\u200b\u200c\u200d\u180e\ufeff]/g, "").replace(/^>\s+/gm, "");
        if (!text) return "";
        const colonIndex = text.indexOf(':');
        if (colonIndex > 0 && colonIndex < 25) {
            const key = text.substring(0, colonIndex + 1);
            const value = text.substring(colonIndex + 1);
            if (!/[.!?]/.test(key.trim()) && key.trim().split(/\s+/).length <= 3) {
                return `<span class="bio-key">${key}</span>${value}`;
            }
        }
        return text;
    });

    let cleanBilgi = formattedLines.filter(l => l !== "").join('<br>').replace(/(<br>){3,}/g, "<br><br>");

    return {
        isim: defaultName.toUpperCase(),
        rol: channelId === MEMBERS_CHANNEL_ID ? "ÜYE" : (channelId === MEMORIAL_CHANNEL_ID ? "ANI" : (channelId === GALLERY_CHANNEL_ID ? "GALERİ" : (channelId === KULTUR_CHANNEL_ID ? "KÜLTÜR" : "YAMA"))),
        gorsel: allImages[0] || "",
        gorseller: allImages,
        bilgi: cleanBilgi
    };
}

async function bulkRefresh() {
    console.log("--- TOPLU VERİ ÇEKME BAŞLADI ---");
    try {
        console.log("Fetching: Members...");
        const members = await fetchFromChannel(MEMBERS_CHANNEL_ID);
        console.log("Fetching: Memorial...");
        const memorial = await fetchFromChannel(MEMORIAL_CHANNEL_ID);
        console.log("Fetching: Gallery...");
        const gallery = await fetchFromChannel(GALLERY_CHANNEL_ID);
        console.log("Fetching: Patches...");
        const patches = await fetchFromChannel(PATCHES_CHANNEL_ID);
        console.log("Fetching: Kultur...");
        const kultur = await fetchFromChannel(KULTUR_CHANNEL_ID);
        console.log("Fetching: Map Data...");
        const mapData = await fetchMapData();

        cache.members.data = members;
        cache.memorial.data = memorial;
        cache.gallery.data = gallery;
        cache.patches.data = patches;
        cache.kultur.data = kultur;
        cache.mapData.data = mapData;

        fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
        console.log("--- TÜM VERİLER BAŞARIYLA YENİLENDİ VE KAYDEDİLDİ ---");
        return true;
    } catch (err) {
        console.error("KRİTİK HATA (bulkRefresh):", err);
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
            cache.kultur.data = parsed.kultur?.data || null;
            cache.mapData.data = parsed.mapData?.data || null;
            console.log("--- Başlangıç Verileri Diskten Yüklendi ---");
        } catch (e) {
            console.error("Diskten veri yükleme hatası:", e);
        }
    }
}

app.get('/api/members', (req, res) => res.json(cache.members.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/memoryof', (req, res) => res.json(cache.memorial.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/gallery', (req, res) => res.json(cache.gallery.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/patches', (req, res) => res.json(cache.patches.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/mc-kultur', (req, res) => res.json(cache.kultur.data || { members: [], error: "Henüz veri yüklenmedi" }));
app.get('/api/map-data', (req, res) => res.json(cache.mapData.data || { error: "Henüz veri yüklenmedi" }));

app.get('/api/refresh', async (req, res) => {
    const success = await bulkRefresh();
    if (success) res.json({ message: "Tüm veriler yenilendi" });
    else res.status(500).json({ error: "Yenileme hatası" });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!bot-refresh') {
        message.channel.send("🔄 Veriler yenileniyor, lütfen bekleyin...");
        const success = await bulkRefresh();
        if (success) message.channel.send("✅ Tüm veriler başarıyla yenilendi ve diske kaydedildi.");
        else message.channel.send("❌ Veri yenileme sırasında bir hata oluştu.");
    }
});

client.once('ready', async () => {
    console.log(`Bot Yayında: ${client.user.tag}`);
    loadInitialData(); // Önce diskten yükle (hız için)
    await bulkRefresh(); // Başlangıçta hemen bir kez tazele

    // Günde bir kez otomatik yenileme (24 saat = 86400000 ms)
    setInterval(bulkRefresh, 86400000);
    console.log("Günlük otomatik yenileme zamanlayıcısı aktif.");
});

client.login(TOKEN);
app.listen(PORT, () => console.log(`Server dinlemede: ${PORT}`));
