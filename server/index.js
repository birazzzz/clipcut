const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Download endpoint
app.post('/download', (req, res) => {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    // Create a downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Generate a unique filename
    const timestamp = new Date().getTime();
    const outputPath = path.join(downloadsDir, `video_${timestamp}.%(ext)s`);

    // Prepare yt-dlp command
    const ytdlpPath = '/Users/birazzz/Library/Python/3.9/bin/yt-dlp';
    const args = [
        '-f', 'best[height<=480][ext=mp4]', // Best quality up to 480p in mp4 format
        '-o', outputPath,
        '--merge-output-format', 'mp4',
        videoUrl
    ];

    console.log(`Executing: ${ytdlpPath} ${args.join(' ')}`);

    const ytdlp = spawn(ytdlpPath, args);
    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`stdout: ${data}`);
    });

    ytdlp.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`stderr: ${data}`);
    });

    ytdlp.on('close', (code) => {
        if (code === 0) {
            // Find the actual downloaded file
            const files = fs.readdirSync(downloadsDir);
            const downloadedFile = files.find(file => file.startsWith(`video_${timestamp}`));
            
            if (downloadedFile) {
                const filePath = path.join(downloadsDir, downloadedFile);
                res.download(filePath, downloadedFile, (err) => {
                    // Clean up the file after download
                    fs.unlink(filePath, (unlinkErr) => {
                        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                    });
                });
            } else {
                res.status(500).json({ error: 'Downloaded file not found' });
            }
        } else {
            console.error(`yt-dlp process exited with code ${code}`);
            console.error('Error output:', errorOutput);
            res.status(500).json({ 
                error: 'Error downloading video',
                details: errorOutput || 'Unknown error occurred'
            });
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
