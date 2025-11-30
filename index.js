const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const app = express();

// Allow your specific frontend to talk to this server
app.use(cors({ origin: '*' })); // In production, replace '*' with your Netlify/Firebase domain

app.get('/', (req, res) => {
    res.send('RedVibes Converter is Running!');
});

app.get('/convert', async (req, res) => {
    try {
        const videoUrl = req.query.url;

        if (!ytdl.validateURL(videoUrl)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Get video info to find the title
        const info = await ytdl.getInfo(videoUrl);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, ''); // Clean title

        // Set headers to tell the browser this is an audio file
        res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
        res.header('Content-Type', 'audio/mpeg');

        // Stream the audio directly to the response
        ytdl(videoUrl, {
            format: 'mp3',
            filter: 'audioonly',
            quality: 'highestaudio'
        }).pipe(res);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Conversion failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});