const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 SERVER CONFIGURATION 🔴 ---
const client = new Client();

// PASTE YOUR API SECRET KEY HERE (Keep this safe!)
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

// --- COBALT API CONFIG (Updated) ---
const COBALT_API = 'https://api.cobalt.tools/api/json';

app.get('/', (req, res) => res.send('RedVibes Server (Cobalt Fixed) is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    try {
        console.log(`[START] Processing: ${videoUrl}`);

        // 1. Ask Cobalt for the Stream URL (Using NEW Payload)
        const cobaltResponse = await axios.post(COBALT_API, {
            url: videoUrl,
            downloadMode: "audio", // New Parameter
            audioFormat: "mp3",
            filenamePattern: "basic"
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Debugging Logs
        console.log("Cobalt Response Status:", cobaltResponse.status);
        
        if (!cobaltResponse.data) {
            throw new Error("Cobalt returned empty data.");
        }

        // Check for Cobalt specific error text
        if (cobaltResponse.data.status === 'error') {
            throw new Error(`Cobalt API Error: ${cobaltResponse.data.text}`);
        }

        // Get URL from response (it might be .url or .picker[].url)
        let streamUrl = cobaltResponse.data.url;
        if (!streamUrl && cobaltResponse.data.picker) {
            streamUrl = cobaltResponse.data.picker[0].url;
        }

        if (!streamUrl) {
            console.error("Full Response:", JSON.stringify(cobaltResponse.data));
            throw new Error("Could not find download URL in Cobalt response.");
        }

        console.log("Got stream URL, downloading audio file...");

        // 2. Download the MP3 Stream (as ArrayBuffer)
        const audioResponse = await axios.get(streamUrl, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const buffer = Buffer.from(audioResponse.data);

        // 3. Generate Filename
        let title = "YouTube Import";
        if (cobaltResponse.data.filename) {
            title = cobaltResponse.data.filename.replace('.mp3', '');
        } else {
            title = `Audio_${Date.now()}`;
        }
        
        // Sanitize filename for Appwrite
        const filename = `${title.replace(/[^\w\s-]/gi, '')}.mp3`;

        // 4. Upload to Appwrite Storage
        console.log(`Uploading ${filename} (${buffer.length} bytes) to Appwrite...`);
        const fileId = ID.unique();
        
        const fileRes = await storage.createFile(
            BUCKET_ID, 
            fileId, 
            InputFile.fromBuffer(buffer, filename)
        );

        // 5. Create Database Entry
        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube";
        if (title.includes('-')) {
            const parts = title.split('-');
            artist = parts[0].trim();
            title = parts.slice(1).join('-').trim();
        }

        await db.createDocument(DB_ID, COL_ID, ID.unique(), {
            title: title,
            artist: artist,
            url: publicUrl
        });

        console.log('[SUCCESS] Upload complete!');
        res.json({ success: true, message: 'Uploaded successfully!', title: title });

    } catch (error) {
        console.error("[ERROR] Failed:", error.message);
        if (error.response) {
            console.error("External API Response:", error.response.data);
        }
        
        const safeMsg = error.message.includes("Cobalt") ? error.message : "Conversion failed. Video might be age-restricted.";
        res.status(500).json({ error: safeMsg });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
