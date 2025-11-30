const express = require('express');
const cors = require('cors');
// Use DisTube version to fix 410 Gone errors
const ytdl = require('@distube/ytdl-core'); 
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 SERVER CONFIGURATION 🔴 ---
const client = new Client();

// Your API Secret Key (Keep this safe!)
const API_KEY = 'standard_c5809a7931f0429ba74ebbbbd219ef80f9719fe772a1ec656a47c9e6268d5ed9c5bd466b4f1f15a650a7dda355cf34b45659cefbb2932cfc383eb55d8cc7ff32eb4120fe51b39031d90f3d1b877d1440d384b7d82e9a06dced07ec2f2070698b16877e050cb1f48357a5475f8ab390aff2dd4806bbabe030a163e4dd0f1d1f16';

client
    .setEndpoint('https://sgp.cloud.appwrite.io/v1') // Singapore Endpoint
    .setProject('692c52a50008e44bd725')              // Project ID
    .setKey(API_KEY);                                // API Secret

const storage = new Storage(client);
const db = new Databases(client);

// Your IDs
const BUCKET_ID = '692c5892002418619aff';
const DB_ID = '692c530f0031554a340b';
const COL_ID = 'songs';
// ----------------------------------

app.get('/', (req, res) => res.send('RedVibes Server (DisTube Version) is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        console.log(`Processing: ${videoUrl}`);

        // 1. Get Video Info (Using Agent to avoid bot detection)
        const agent = ytdl.createAgent([{ name: 'cookie', value: '...' }]); // Optional: Add cookies if needed later
        const info = await ytdl.getInfo(videoUrl, { agent });
        
        let title = info.videoDetails.title.replace(/[^\w\s-]/gi, ''); // Clean title
        if (!title) title = `Audio_${Date.now()}`;
        const filename = `${title}.mp3`;

        console.log(`Title found: ${title}`);

        // 2. Download Stream to Buffer
        const audioStream = ytdl(videoUrl, { 
            quality: 'highestaudio', 
            filter: 'audioonly',
            agent 
        });
        
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // 3. Upload to Appwrite Storage
        console.log('Uploading to Appwrite...');
        const fileId = ID.unique();
        
        const fileRes = await storage.createFile(
            BUCKET_ID, 
            fileId, 
            InputFile.fromBuffer(buffer, filename)
        );

        // 4. Create Database Entry
        // Note: Using the Singapore endpoint for the View URL
        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube Import";
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

        console.log('Upload Success!');
        res.json({ success: true, message: 'Uploaded successfully!' });

    } catch (error) {
        console.error("Server Error:", error);
        
        // Handle 410 specifically
        if (error.statusCode === 410) {
            res.status(410).json({ error: "Video restricted/deleted by YouTube (410)." });
        } else {
            res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
