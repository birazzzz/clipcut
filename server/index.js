const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = 'http://localhost:3001'; // Backend server URL

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../')));

// Proxy API requests to the backend server
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api' // Rewrite path: remove /api
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying request: ${req.method} ${req.path} -> ${BACKEND_URL}${req.path}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Failed to connect to the backend server' });
  }
}));

// Proxy download requests to the backend server
app.use('/download', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying download request: ${req.method} ${req.path} -> ${BACKEND_URL}${req.path}`);
  },
  onError: (err, req, res) => {
    console.error('Download proxy error:', err);
    res.status(500).json({ error: 'Failed to connect to the download server' });
  }
}));

// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Download endpoint
app.post('/download', (req, res) => {
    console.log('=== NEW DOWNLOAD REQUEST ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    const videoUrl = req.body.url || req.body.videoUrl;
    
    // Set headers for file download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    if (!videoUrl) {
        console.error('No video URL provided');
        return res.status(400).send('Video URL is required');
    }
    
    console.log('Downloading video from URL:', videoUrl);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Create a downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Generate a unique filename
    const timestamp = new Date().getTime();
    const outputPath = path.join(downloadsDir, `video_${timestamp}.mp4`);

    // Use the full path to yt-dlp
    const ytdlpPath = '/Users/birazzz/Library/Python/3.9/bin/yt-dlp';
    const args = [
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        // Try to get the best format that includes audio and video, up to 480p
        '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
        // Fallback to any format if needed
        '--merge-output-format', 'mp4',
        '--format-sort', 'vcodec:h264,res:480',
        '--prefer-free-formats',
        '--no-playlist',
        '--geo-bypass',
        '--socket-timeout', '30',
        '--source-address', '0.0.0.0',
        '--no-embed-thumbnail',
        '--no-embed-metadata',
        '--no-embed-chapters',
        '--no-embed-subs',
        '--no-embed-info-json',
        '--no-write-thumbnail',
        '--no-write-description',
        '--no-write-info-json',
        '--no-write-annotations',
        '--no-write-sub',
        '--no-write-auto-sub',
        '--no-write-thumbnail',
        '--no-part',
        '--force-overwrites',
        '--no-mtime',
        '--no-cache-dir',
        '--no-simulate',
        '--compat-options', 'no-youtube-unavailable-videos',
        '--console-title',
        '--progress',
        '--newline',
        '--no-colors',
        '-o', outputPath,
        videoUrl
    ];
    
    console.log('Executing yt-dlp command:');
    console.log(`${ytdlpPath} ${args.join(' ')}`);

    const ytdlp = spawn(ytdlpPath, args);
    let output = '';
    let errorOutput = '';
    
    // Log all output from yt-dlp for debugging
    ytdlp.stderr.on('data', (data) => {
        const text = data.toString();
        console.error('yt-dlp stderr:', text);
        errorOutput += text;
    });
    
    // Log stdout for debugging
    ytdlp.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('yt-dlp stdout:', text);
        output += text;
    });
    
    ytdlp.on('close', (code) => {
        console.log(`yt-dlp process exited with code ${code}`);
        console.log('yt-dlp stdout:', output);
        console.log('yt-dlp stderr:', errorOutput);
        
        if (code === 0) {
            if (fs.existsSync(outputPath)) {
                // Set headers for file download
                const filename = `video-${Date.now()}.mp4`;
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                
                // Stream the file directly
                const fileStream = fs.createReadStream(outputPath);
                
                // Log when streaming starts
                console.log('Starting file stream for download...');
                
                // Handle file stream events
                fileStream.on('open', () => {
                    console.log('File stream opened...');
                    fileStream.pipe(res);
                });
                
                fileStream.on('end', () => {
                    console.log('File stream ended, cleaning up...');
                    fs.unlink(outputPath, (err) => {
                        if (err) console.error('Error deleting file:', err);
                    });
                });
                
                fileStream.on('error', (err) => {
                    console.error('Error reading file:', err);
                    if (!res.headersSent) {
                        res.status(500).json({
                            error: 'File read error',
                            message: 'Failed to read the downloaded file',
                            details: err.message
                        });
                    }
                });
                
                // Handle client disconnect
                res.on('close', () => {
                    if (!fileStream.destroyed) {
                        fileStream.destroy();
                    }
                });
            } else {
                console.error('Downloaded file not found at path:', outputPath);
                res.status(500).json({ error: 'Downloaded file not found' });
            }
        } else {
            console.error('yt-dlp process exited with code', code);
            console.error('Error output:', errorOutput);
            
            if (!res.headersSent) {
                // Try to parse error output for more details
                let errorDetails = 'Unknown error occurred';
                try {
                    const errorMatch = errorOutput.match(/ERROR:\s*([^\n]+)/i);
                    if (errorMatch && errorMatch[1]) {
                        errorDetails = errorMatch[1].trim();
                    } else {
                        errorDetails = errorOutput || 'No error details available';
                    }
                } catch (e) {
                    console.error('Error parsing error output:', e);
                }
                
                res.status(500).json({ 
                    error: 'Download failed',
                    message: `Error downloading video (exit code: ${code})`,
                    details: errorDetails,
                    exitCode: code,
                    command: `${ytdlpPath} ${args.join(' ')}`
                });
            }
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
                        // Add the original URL and return all data
                        data.original_url = url;
                        resolve(data);
                    } catch (e) {
                        console.error('Error parsing yt-dlp output:', e);
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
