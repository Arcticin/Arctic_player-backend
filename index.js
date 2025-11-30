const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 SERVER CONFIGURATION 🔴 ---
const client = new Client();

// API SECRET KEY
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

// --- LIST OF PUBLIC SERVERS (Backups) ---
const INSTANCES = [
    'https://api.cobalt.tools/api/json',      // Main (Official)
    'https://cobalt.kwiatekmiki.pl/api/json', // Backup 1
    'https://cobalt.lacey.se/api/json',       // Backup 2
    'https://cobalt.smartcode.nl/api/json'    // Backup 3
];

app.get('/', (req, res) => res.send('RedVibes Server (Multi-Instance) is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    let streamUrl = null;
    let title = "YouTube Import";
    let lastError = null;

    // 1. Try servers one by one until success
    console.log(`[START] Processing: ${videoUrl}`);
    
    for (const apiBase of INSTANCES) {
        try {
            console.log(`Trying server: ${apiBase} ...`);
            
            const cobaltResponse = await axios.post(apiBase, {
                url: videoUrl,
                downloadMode: "audio",
                audioFormat: "mp3",
                filenamePattern: "basic"
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000 // 15s timeout per server
            });

            if (cobaltResponse.data && (cobaltResponse.data.url || cobaltResponse.data.picker)) {
                streamUrl = cobaltResponse.data.url || cobaltResponse.data.picker[0].url;
                if (cobaltResponse.data.filename) title = cobaltResponse.data.filename.replace('.mp3', '');
                console.log(`✅ Success with ${apiBase}`);
                break; // Stop loop if it works
            }
        } catch (e) {
            console.error(`❌ Failed on ${apiBase}: ${e.message}`);
            lastError = e.message;
        }
    }

    if (!streamUrl) {
        return res.status(500).json({ error: "All servers failed. Please try again later." });
    }

    try {
        // 2. Download the Audio
        console.log("Downloading audio stream...");
        const audioResponse = await axios.get(streamUrl, { 
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const buffer = Buffer.from(audioResponse.data);

        // 3. Upload to Appwrite
        const filename = `${title.replace(/[^\w\s-]/gi, '')}_${Date.now()}.mp3`;
        console.log(`Uploading ${filename} (${buffer.length} bytes)...`);
        
        const fileId = ID.unique();
        const fileRes = await storage.createFile(BUCKET_ID, fileId, InputFile.fromBuffer(buffer, filename));

        // 4. Save to DB
        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube";
        if (title.includes('-')) {
            const parts = title.split('-');
            artist = parts[0].trim();
            title = parts.slice(1).join('-').trim();
        }

        await db.createDocument(DB_ID, COL_ID, ID.unique(), { title, artist, url: publicUrl });

        console.log('[DONE] Upload complete!');
        res.json({ success: true, message: 'Uploaded successfully!' });

    } catch (error) {
        console.error("[FINAL ERROR]", error);
        res.status(500).json({ error: "Upload failed during file transfer." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
