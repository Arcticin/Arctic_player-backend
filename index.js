const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');
const ytdl = require('@distube/ytdl-core'); // Fallback library

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

// --- ROBUST SERVER LIST ---
const INSTANCES = [
    'https://api.cobalt.tools/api/json',
    'https://cobalt.kwiatekmiki.pl/api/json',
    'https://cobalt.lacey.se/api/json',
    'https://cobalt.synced.is/api/json',
    'https://cobalt.adminforge.de/api/json',
    'https://cobalt.rudart.cn/api/json'
];

app.get('/', (req, res) => res.send('RedVibes Ultimate Server is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    let buffer = null;
    let title = "YouTube Import";
    let success = false;

    console.log(`[START] Processing: ${videoUrl}`);

    // STRATEGY A: Try Public Cobalt APIs
    for (const apiBase of INSTANCES) {
        if (success) break;
        try {
            console.log(`Trying API: ${apiBase}...`);
            const cobalt = await axios.post(apiBase, {
                url: videoUrl,
                downloadMode: "audio",
                audioFormat: "mp3"
            }, { 
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                timeout: 10000 
            });

            const streamUrl = cobalt.data.url || (cobalt.data.picker ? cobalt.data.picker[0].url : null);
            
            if (streamUrl) {
                console.log("Got URL, downloading...");
                const audioRes = await axios.get(streamUrl, { responseType: 'arraybuffer', timeout: 20000 });
                buffer = Buffer.from(audioRes.data);
                if(cobalt.data.filename) title = cobalt.data.filename.replace('.mp3', '');
                success = true;
            }
        } catch (e) {
            console.log(`Failed ${apiBase}: ${e.message}`);
        }
    }

    // STRATEGY B: Fallback to Local Downloader (If APIs fail)
    if (!success) {
        console.log("⚠️ APIs failed. Trying Local Backup...");
        try {
            if (!ytdl.validateURL(videoUrl)) throw new Error("Invalid URL");
            
            const info = await ytdl.getInfo(videoUrl);
            title = info.videoDetails.title;
            
            const stream = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' });
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
            success = true;
            console.log("✅ Local Backup Success!");
        } catch (e) {
            console.error("Local Backup Failed:", e.message);
            return res.status(500).json({ error: "All methods failed. Video might be restricted." });
        }
    }

    // UPLOAD TO APPWRITE
    try {
        const cleanTitle = title.replace(/[^\w\s-]/gi, '').trim();
        const filename = `${cleanTitle}.mp3`;
        
        console.log(`Uploading ${filename} to Appwrite...`);
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

        console.log('Done!');
        res.json({ success: true, message: 'Uploaded!' });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Upload to Cloud failed." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
