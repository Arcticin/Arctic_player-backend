const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');
const ytdl = require('@distube/ytdl-core');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 CONFIGURATION 🔴 ---
const client = new Client();

// 1. PASTE YOUR API SECRET KEY HERE
const API_KEY = 'standard_c5809a7931f0429ba74ebbbbd219ef80f9719fe772a1ec656a47c9e6268d5ed9c5bd466b4f1f15a650a7dda355cf34b45659cefbb2932cfc383eb55d8cc7ff32eb4120fe51b39031d90f3d1b877d1440d384b7d82e9a06dced07ec2f2070698b16877e050cb1f48357a5475f8ab390aff2dd4806bbabe030a163e4dd0f1d1f16';

client
    .setEndpoint('https://sgp.cloud.appwrite.io/v1') 
    .setProject('692c52a50008e44bd725')              
    .setKey(API_KEY);                                

const storage = new Storage(client);
const db = new Databases(client);

const BUCKET_ID = '692c5892002418619aff';
const DB_ID = '692c530f0031554a340b';
const COL_ID = 'songs';

// --- UPDATED SERVER LIST (Fresh Mirrors) ---
const INSTANCES = [
    'https://cobalt.kwiatekmiki.pl/api/json', // Usually reliable
    'https://api.cobalt.tools/api/json',      // Official (Strict)
    'https://cobalt.lacey.se/api/json',
    'https://cobalt.synced.is/api/json',
    'https://cobalt.rudart.cn/api/json'
];

app.get('/', (req, res) => res.send('RedVibes Android-Mode Server is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    let buffer = null;
    let title = "YouTube Import";
    let success = false;

    console.log(`[START] Processing: ${videoUrl}`);

    // STRATEGY A: Cobalt APIs
    for (const apiBase of INSTANCES) {
        if (success) break;
        try {
            console.log(`Trying API: ${apiBase}...`);
            const cobalt = await axios.post(apiBase, {
                url: videoUrl,
                downloadMode: "audio",
                audioFormat: "mp3"
            }, { 
                headers: { 'Accept': 'application/json' },
                timeout: 8000 
            });

            const streamUrl = cobalt.data.url || (cobalt.data.picker ? cobalt.data.picker[0].url : null);
            
            if (streamUrl) {
                const audioRes = await axios.get(streamUrl, { responseType: 'arraybuffer', timeout: 15000 });
                buffer = Buffer.from(audioRes.data);
                if(cobalt.data.filename) title = cobalt.data.filename.replace('.mp3', '');
                success = true;
                console.log(`✅ Success via API`);
            }
        } catch (e) {
            console.log(`Failed ${apiBase}`);
        }
    }

    // STRATEGY B: Local Downloader with ANDROID CLOAKING
    if (!success) {
        console.log("⚠️ APIs failed. Engaging Android Mode...");
        try {
            // This tricks YouTube into thinking we are an Android App, not a server
            const agent = ytdl.createAgent([{ name: 'cookie', value: '' }]); 
            
            const info = await ytdl.getInfo(videoUrl, { 
                agent,
                playerClients: ["ANDROID", "WEB_CREATOR"] // Use Android Client
            });
            
            title = info.videoDetails.title;
            
            const stream = ytdl(videoUrl, { 
                quality: 'highestaudio', 
                filter: 'audioonly',
                agent,
                playerClients: ["ANDROID", "WEB_CREATOR"]
            });

            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
            success = true;
            console.log("✅ Local Android Mode Success!");
        } catch (e) {
            console.error("Local Error:", e.message);
            // Don't quit yet, return specific error
            if(e.message.includes('403')) return res.status(500).json({ error: "Server IP is blocked by YouTube (403)." });
            if(e.message.includes('410')) return res.status(500).json({ error: "Video is Age Restricted or Deleted." });
        }
    }

    if (!success || !buffer) {
        return res.status(500).json({ error: "All download methods failed." });
    }

    // UPLOAD TO APPWRITE
    try {
        const cleanTitle = title.replace(/[^\w\s-]/gi, '').trim();
        const filename = `${cleanTitle}.mp3`;
        
        console.log(`Uploading ${filename}...`);
        const fileId = ID.unique();
        
        const fileRes = await storage.createFile(
            BUCKET_ID, 
            fileId, 
            InputFile.fromBuffer(buffer, filename)
        );

        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube";
        if (cleanTitle.includes('-')) {
            const parts = cleanTitle.split('-');
            artist = parts[0].trim();
            title = parts.slice(1).join('-').trim();
        }

        await db.createDocument(DB_ID, COL_ID, ID.unique(), {
            title: title || cleanTitle,
            artist: artist,
            url: publicUrl
        });

        res.json({ success: true, message: 'Uploaded!' });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Appwrite Upload Failed: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
