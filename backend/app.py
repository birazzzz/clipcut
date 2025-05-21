from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration for yt-dlp
ydl_opts = {
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'extract_flat': False,
}

@app.route('/api/video-info', methods=['POST'])
def get_video_info():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract relevant information
            video_info = {
                'title': info.get('title', 'No title available'),
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'webpage_url': info.get('webpage_url'),
                'formats': [
                    {
                        'format_id': f.get('format_id'),
                        'ext': f.get('ext'),
                        'resolution': f.get('resolution'),
                        'filesize': f.get('filesize'),
                        'url': f.get('url')
                    }
                    for f in info.get('requested_formats', info.get('formats', []))
                    if f.get('ext') in ['mp4', 'webm'] and f.get('height')
                ]
            }
            
            # Sort formats by resolution (highest first)
            video_info['formats'].sort(key=lambda x: x.get('height', 0), reverse=True)
            
            return jsonify(video_info)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
