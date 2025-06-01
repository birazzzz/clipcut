from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import tempfile
import uuid

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration for yt-dlp
ydl_opts = {
    'quiet': True,
    'no_warnings': False,
    'extract_flat': False,
    'force_generic_extractor': True,
    'socket_timeout': 30,  # Increase timeout for slow connections
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'noplaylist': True,
    'extractor_retries': 3,
    'retries': 3,
    'fragment_retries': 3,
    'skip_unavailable_fragments': True,
    'compat_opts': {'no-youtube-unavailable-videos'},  # Add this line
    'extractor_args': {
        'twitter': {
            'username': None,
            'password': None,
            'cookies': None,
            'skip_auth': True,
        },
    },
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://twitter.com/',
    },
}

def extract_video_info(info):
    """Extract video information from the yt-dlp info dict."""
    try:
        # Determine platform
        extractor = info.get('extractor', '').lower()
        webpage_url = (info.get('webpage_url') or '').lower()
        
        if 'youtube' in extractor or 'youtu.be' in webpage_url:
            platform = 'youtube'
        elif 'twitter' in extractor or 'x.com' in webpage_url or 'twitter.com' in webpage_url:
            platform = 'twitter'
        else:
            platform = 'other'
        
        # Get thumbnail - try different possible keys
        thumbnail = (
            info.get('thumbnail') or 
            info.get('thumbnails', [{}])[0].get('url') if info.get('thumbnails') else None
        )
        
        # Get uploader - try different possible keys
        uploader = (
            info.get('uploader') or 
            info.get('channel') or 
            info.get('channel_follower_count') or 
            info.get('uploader_id')
        )
        
        return {
            'title': info.get('title', 'No title available'),
            'thumbnail': thumbnail,
            'duration': info.get('duration'),
            'uploader': uploader,
            'webpage_url': info.get('webpage_url', ''),
            'platform': platform,
            'formats': []
        }
    except Exception as e:
        print(f"Error extracting video info: {str(e)}")
        raise

def debug_extractor_info(ydl, url):
    """Debug function to get extractor information for a URL."""
    try:
        # First try to get the extractor info
        ie_result = ydl.extract_info(url, download=False, process=False)
        print(f"Extractor info: {ie_result}")
        
        # Then try to get the full info
        full_info = ydl.extract_info(url, download=True, process=True)
        print(f"Full info keys: {list(full_info.keys())}")
        
        return full_info
    except Exception as e:
        print(f"Debug extraction error: {str(e)}")
        raise

@app.route('/api/video-info', methods=['POST'])
def get_video_info():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    print(f"\n=== Processing URL: {url} ===")
    
    # Normalize Twitter/X URLs
    if 'x.com' in url or 'twitter.com' in url:
        url = url.replace('x.com', 'twitter.com')
        print(f"Normalized URL to: {url}")
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # First, try to get basic info without downloading
            try:
                print("Attempting to get video info...")
                info = ydl.extract_info(url, download=False)
                if not info:
                    print("No info returned, trying with download=True...")
                    info = ydl.extract_info(url, download=True)
                    
                if not info:
                    return jsonify({'error': 'No video information found (empty response)'}), 400
                    
                print(f"Successfully got info, keys: {list(info.keys())}")
                
            except Exception as e:
                print(f"Error extracting info: {str(e)}")
                # Try debug extraction
                try:
                    print("Trying debug extraction...")
                    info = debug_extractor_info(ydl, url)
                except Exception as debug_e:
                    print(f"Debug extraction failed: {str(debug_e)}")
                    return jsonify({
                        'error': f'Failed to extract video info: {str(e)}',
                        'debug_error': str(debug_e)
                    }), 400
            
            try:
                video_info = extract_video_info(info)
                print(f"Extracted video info: {video_info.keys() if video_info else 'None'}")
            except Exception as e:
                print(f"Error in extract_video_info: {str(e)}")
                return jsonify({'error': f'Error processing video info: {str(e)}'}), 400
            
            # Determine platform
            extractor = info.get('extractor', '').lower()
            webpage_url = info.get('webpage_url', '').lower()
            
            if 'youtube' in extractor or 'youtu.be' in webpage_url:
                platform = 'youtube'
            elif 'twitter' in extractor or 'x.com' in webpage_url or 'twitter.com' in webpage_url:
                platform = 'twitter'
            else:
                platform = 'other'
            
            # Extract relevant information
            video_info = {
                'title': info.get('title', 'No title available'),
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader') or info.get('channel') or info.get('channel_follower_count'),
                'webpage_url': info.get('webpage_url', ''),
                'platform': platform,
                'formats': []
            }
            
            # Handle different video formats based on platform
            formats = []
            
            # Try to get formats from different possible locations
            if 'requested_formats' in info and info['requested_formats']:
                formats.extend(info['requested_formats'])
            if 'formats' in info and info['formats']:
                formats.extend(info['formats'])
            
            # If no formats found, try to create one from the main URL
            if not formats and info.get('url'):
                formats = [{
                    'url': info['url'],
                    'ext': info.get('ext', 'mp4'),
                    'width': info.get('width'),
                    'height': info.get('height'),
                    'filesize': info.get('filesize')
                }]
            
            for f in formats:
                try:
                    # Skip if no URL
                    if not f.get('url'):
                        continue
                        
                    # Get format extension
                    ext = f.get('ext', 'mp4')
                    if ext == 'unknown_video' and 'url' in f:
                        # Try to determine extension from URL
                        url = f['url'].split('?')[0].lower()
                        if '.mp4' in url:
                            ext = 'mp4'
                        elif '.webm' in url:
                            ext = 'webm'
                        elif '.m3u8' in url:
                            ext = 'm3u8'
                    
                    # Skip unsupported formats
                    if ext not in ['mp4', 'webm', 'm3u8', 'mpd']:
                        continue
                    
                    # Get resolution
                    width = f.get('width', 0) or 0
                    height = f.get('height', 0) or 0
                    resolution = f.get('resolution')
                    if not resolution and width and height:
                        resolution = f'{width}x{height}'
                    
                    # Get filesize
                    filesize = f.get('filesize')
                    if not filesize and 'filesize_approx' in f:
                        filesize = f['filesize_approx']
                    
                    # Add format
                    video_info['formats'].append({
                        'format_id': f.get('format_id', f'format_{len(video_info["formats"])}'),
                        'ext': ext,
                        'resolution': resolution or 'unknown',
                        'filesize': filesize,
                        'url': f['url']
                    })
                    
                except Exception as e:
                    print(f"Error processing format {f.get('format_id')}: {str(e)}")
            
            # Sort formats by resolution (highest first)
            def get_resolution_sort_key(fmt):
                res = fmt.get('resolution', '0x0')
                try:
                    if 'x' in res:
                        w, h = map(int, res.split('x'))
                        return (w * h, w, h)
                    return (0, 0, 0)
                except:
                    return (0, 0, 0)
                    
            video_info['formats'].sort(key=get_resolution_sort_key, reverse=True)
            
            return jsonify(video_info)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_video():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    print(f"\n=== Processing download for URL: {url} ===")
    
    # Normalize Twitter/X URLs
    if 'x.com' in url or 'twitter.com' in url:
        url = url.replace('x.com', 'twitter.com')
    
    try:
        # Create a temporary directory for downloads
        temp_dir = os.path.join(tempfile.gettempdir(), 'clipcut_downloads')
        os.makedirs(temp_dir, exist_ok=True)
        
        # Configure yt-dlp for downloading best quality up to 480p with audio
        download_opts = {
            **ydl_opts,
            'format': 'best[height<=480][ext=mp4]',
            'merge_output_format': 'mp4',
            'outtmpl': os.path.join(temp_dir, f'%(id)s.%(ext)s'),
            'noprogress': True,
        }
        
        with yt_dlp.YoutubeDL(download_opts) as ydl:
            # Get info first to set filename
            info = ydl.extract_info(url, download=False)
            if not info:
                return jsonify({'error': 'Could not retrieve video information'}), 400
                
            # Download the video
            ydl.download([url])
            
            # Get the actual filename
            filename = ydl.prepare_filename(info)
            
            # Return the file for download
            return send_file(
                filename,
                as_attachment=True,
                download_name=f"{info.get('title', 'video')}.mp4",
                mimetype='video/mp4'
            )
            
    except Exception as e:
        print(f"Download error: {str(e)}")
        return jsonify({'error': f'Failed to download video: {str(e)}'}), 500
    finally:
        # Clean up the downloaded file after sending
        try:
            if 'filename' in locals() and os.path.exists(filename):
                os.remove(filename)
        except Exception as e:
            print(f"Error cleaning up file {filename}: {str(e)}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8001))
    app.run(host='0.0.0.0', port=port, debug=True)
