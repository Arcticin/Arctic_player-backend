const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const { Client, Databases, Storage, ID, InputFile } = require('node-appwrite');
const stream = require('stream');

const app = express();
app.use(cors({ origin: '*' }));

// --- 🔴 SERVER CONFIGURATION 🔴 ---
const client = new Client();
client
    .setEndpoint('https://sgp.cloud.appwrite.io/v1') // Singapore Endpoint
    .setProject('692c52a50008e44bd725')              // Project ID
    .setKey('PASTE_YOUR_LONG_API_SECRET_KEY_HERE');  // <--- PASTE THE KEY HERE

const storage = new Storage(client);
const db = new Databases(client);

// Appwrite IDs
const BUCKET_ID = '692c5892002418619aff';
const DB_ID = '692c530f0031554a340b';
const COL_ID = 'songs';
// ----------------------------------

app.get('/', (req, res) => res.send('RedVibes Server v2 (Direct Upload) is Running!'));

app.get('/upload-youtube', async (req, res) => {
    const videoUrl = req.query.url;

    if (!ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        // 1. Get Video Info
        const info = await ytdl.getInfo(videoUrl);
        let title = info.videoDetails.title.replace(/[^\w\s-]/gi, ''); // Clean title
        const filename = `${title}.mp3`;

        console.log(`Starting conversion: ${title}`);

        // 2. Download Stream to Buffer (Memory)
        const audioStream = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' });
        
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // 3. Upload to Appwrite Storage
        console.log('Uploading to Appwrite Storage...');
        const fileId = ID.unique();
        
        // InputFile.fromBuffer(buffer, filename)
        const fileRes = await storage.createFile(
            BUCKET_ID, 
            fileId, 
            InputFile.fromBuffer(buffer, filename)
        );

        // 4. Create Database Entry
        const publicUrl = `https://sgp.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileRes.$id}/view?project=692c52a50008e44bd725`;
        
        let artist = "YouTube Import";
        if(title.includes('-')) {
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
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
