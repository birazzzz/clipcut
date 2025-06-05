const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Download endpoint
app.post('/download', (req, res) => {
    console.log('Received download request:', req.body);
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        console.error('No video URL provided');
        return res.status(400).json({ 
            error: 'Video URL is required',
            details: 'Please provide a valid video URL'
        });
    }

    // Create a downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Generate a unique filename
    const timestamp = new Date().getTime();
    const outputPath = path.join(downloadsDir, `video_${timestamp}.%(ext)s`);

    // Use the full path to yt-dlp
    const ytdlpPath = '/Users/birazzz/Library/Python/3.9/bin/yt-dlp';
    const args = [
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        // Best video (up to 480p) + best audio merged into MP4
        '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--output', outputPath,
        '--no-playlist',
        '--geo-bypass',
        '--socket-timeout', '30',
        '--source-address', '0.0.0.0',
        '--embed-thumbnail',
        '--add-metadata',
        '--no-part',
        videoUrl
    ];
    
    console.log('Executing yt-dlp with args:', args);

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
            
            // Try to extract a more user-friendly error message
            let errorMessage = 'Error downloading video';
            if (errorOutput.includes('Unsupported URL')) {
                errorMessage = 'Unsupported URL. Please check if the video is available.';
            } else if (errorOutput.includes('Private video')) {
                errorMessage = 'This video is private and cannot be downloaded.';
            } else if (errorOutput.includes('Video unavailable')) {
                errorMessage = 'The video is unavailable. It may have been removed or made private.';
            } else if (errorOutput.includes('This video is not available')) {
                errorMessage = 'This video is not available in your country or has been removed.';
            } else if (errorOutput.includes('yt-dlp: command not found')) {
                errorMessage = 'yt-dlp is not installed. Please install yt-dlp to continue.';
            }
            
            res.status(500).json({ 
                error: errorMessage,
                details: errorOutput || 'Unknown error occurred',
                exitCode: code
            });
        }
    });
});

// Video info endpoint
app.post('/api/video-info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ 
            error: 'Video URL is required',
            details: 'Please provide a valid video URL'
        });
    }

    // Use the full path to yt-dlp
    const ytdlpPath = '/Users/birazzz/Library/Python/3.9/bin/yt-dlp';
    const args = [
        '--dump-json',
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        '--no-playlist',
        '--geo-bypass',
        '--socket-timeout', '30',
        url
    ];

    console.log('Fetching video info with command:', `${ytdlpPath} ${args.join(' ')}`);

    try {
        const ytdlp = spawn(ytdlpPath, args);
        let output = '';
        let errorOutput = '';

        ytdlp.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('yt-dlp stderr:', data.toString());
        });

        // Handle process completion
        const videoData = await new Promise((resolve, reject) => {
            ytdlp.on('close', (code) => {
                if (code === 0) {
                    try {
                        const data = JSON.parse(output);
                        // Extract only the fields we need
                        resolve({
                            id: data.id,
                            title: data.title,
                            thumbnail: data.thumbnail,
                            duration: data.duration,
                            uploader: data.uploader,
                            upload_date: data.upload_date,
                            view_count: data.view_count,
                            description: data.description
                        });
                    } catch (parseError) {
                        console.error('Error parsing yt-dlp output:', parseError);
                        reject(new Error('Failed to parse video information'));
                    }
                } else {
                    console.error(`yt-dlp process exited with code ${code}`);
                    console.error('Error output:', errorOutput);
                    
                    let errorMessage = 'Failed to fetch video information';
                    if (errorOutput.includes('Unsupported URL')) {
                        errorMessage = 'Unsupported URL. Please check if the video is available.';
                    } else if (errorOutput.includes('Private video')) {
                        errorMessage = 'This video is private and cannot be accessed.';
                    } else if (errorOutput.includes('Video unavailable')) {
                        errorMessage = 'The video is unavailable. It may have been removed or made private.';
                    } else if (errorOutput.includes('This video is not available')) {
                        errorMessage = 'This video is not available in your country or has been removed.';
                    } else if (errorOutput.includes('yt-dlp: command not found')) {
                        errorMessage = 'yt-dlp is not installed. Please install yt-dlp to continue.';
                    }
                    
                    reject(new Error(errorMessage));
                }
            });
        });

        res.json(videoData);

    } catch (error) {
        console.error('Error in video-info endpoint:', error);
        res.status(500).json({
            error: error.message || 'Failed to fetch video information',
            details: error.details || 'An unexpected error occurred'
        });
    }
});

// Start server
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
});
