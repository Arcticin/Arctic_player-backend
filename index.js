const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 SERVER CONFIGURATION 🔴 ---
const client = new Client();

// PASTE YOUR API SECRET KEY HERE
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

// --- COBALT API CONFIG ---
// We use a robust public instance of Cobalt
const COBALT_API = 'https://api.cobalt.tools/api/json';

app.get('/', (req, res) => res.send('RedVibes Server (Cobalt V3) is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    try {
        console.log(`Processing via Cobalt: ${videoUrl}`);

        // 1. Ask Cobalt for the Stream URL
        const cobaltResponse = await axios.post(COBALT_API, {
            url: videoUrl,
            isAudioOnly: true,
            aFormat: 'mp3'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!cobaltResponse.data || !cobaltResponse.data.url) {
            throw new Error("Cobalt could not process this video.");
        }

        const streamUrl = cobaltResponse.data.url;
        console.log("Got stream URL, downloading...");

        // 2. Download the MP3 Stream
        const audioResponse = await axios.get(streamUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(audioResponse.data);

        // 3. Generate Filename
        let title = "YouTube Import";
        // Try to guess title from Cobalt or use Timestamp
        if (cobaltResponse.data.filename) {
            title = cobaltResponse.data.filename.replace('.mp3', '');
        } else {
            title = `Audio_${Date.now()}`;
        }
        const filename = `${title.replace(/[^\w\s-]/gi, '')}.mp3`;

        // 4. Upload to Appwrite Storage
        console.log(`Uploading ${filename} to Appwrite...`);
        const fileId = ID.unique();
        
        const fileRes = await storage.createFile(
            BUCKET_ID, 
            fileId, 
            InputFile.fromBuffer(buffer, filename)
        );

        // 5. Create Database Entry
        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube";
        // Basic parser for "Artist - Title" format
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

        console.log('Success!');
        res.json({ success: true, message: 'Uploaded successfully!' });

    } catch (error) {
        console.error("Handler Error:", error.message);
        console.error("Details:", error.response ? error.response.data : "No external response data");
        res.status(500).json({ error: "Conversion failed. Video might be age-restricted or region-locked." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
