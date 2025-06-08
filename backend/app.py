from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import tempfile
import uuid
import subprocess

app = Flask(__name__)
# Enable CORS for all routes with specific origins and methods
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Configuration for yt-dlp options
ydl_opts = {
    'format': 'best',
    'quiet': False,  # Set to False to see more detailed logs
    'no_warnings': False,  # Show warnings to help with debugging
    'extract_flat': False,
    'force_generic_extractor': False,
    'extractor_retries': 5,
    'socket_timeout': 30,
    'extractor_args': {
        'youtube': {'skip': ['dash', 'hls']},
        'tiktok': {
            'extract_flat': False,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'noplaylist': True,
        }
    },
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'no_color': True,
    'cachedir': False,
    'noplaylist': True,
    'extract_flat': 'in_playlist',
    'retries': 5,
    'fragment_retries': 10,
    'file_access_retries': 10,
    'skip_unavailable_fragments': True,
    'verbose': True,
    # TikTok specific options
    'extractor_retries': 5,
    'fragment_retries': 5,
    'retry_sleep': 1,
    'sleep_interval_requests': 2,
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
        extractor = info.get('extractor', '').lower()
        webpage_url = (info.get('webpage_url') or '').lower()
        
        if 'youtube' in extractor or 'youtu.be' in webpage_url:
            platform = 'youtube'
        elif 'twitter' in extractor or 'x.com' in webpage_url or 'twitter.com' in webpage_url:
            platform = 'twitter'
        elif 'reddit.com' in webpage_url or 'redd.it' in webpage_url or 'reddit' in extractor:
            platform = 'reddit'
        elif 'tiktok.com' in webpage_url or 'tiktok' in extractor or 'vm.tiktok.com' in webpage_url:
            platform = 'tiktok'
            
            # Handle TikTok-specific data extraction
            if not info.get('title') and info.get('description'):
                info['title'] = info['description']
                
            # Ensure we have a valid thumbnail
            if not info.get('thumbnail'):
                # Try to get the best available thumbnail
                for thumb in info.get('thumbnails', [])[::-1]:  # Try highest resolution first
                    if thumb.get('url'):
                        info['thumbnail'] = thumb['url']
                        break
                        
                # If still no thumbnail, try to construct one from video ID
                if not info.get('thumbnail') and info.get('id'):
                    info['thumbnail'] = f"https://p16-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/placeholder.jpg?x-expires=9999999999&x-signature=PLACEHOLDER"
                    
        # For debugging
        print(f"Extracting video info for platform: {platform}")
        print(f"Available keys: {list(info.keys())}")
        
        # For Reddit, we might need to adjust the thumbnail URL to get a higher quality version
        if platform == 'reddit':
            thumbnail = info.get('thumbnail', '')
            if thumbnail and 'external-preview' in thumbnail:
                # Try to get a better quality thumbnail if available
                thumbnail = thumbnail.replace('external-preview', 'preview')
                info['thumbnail'] = thumbnail
        
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

@app.route('/api/tiktok-download', methods=['POST'])
def download_tiktok():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    print(f"\n=== Processing TikTok download for URL: {url} ===")
    
    try:
        # Step 1: List all available formats
        list_cmd = ["yt-dlp", "--list-formats", url]
        print(f"Running command: {' '.join(list_cmd)}")
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return jsonify({
                'error': f'Failed to list formats: {result.stderr}'
            }), 400

        # Step 2: Parse the output to find the best MP4 format with audio
        format_id = None
        for line in result.stdout.split('\n'):
            if 'mp4' in line and 'audio only' not in line:
                parts = line.split()
                if parts and parts[0].isdigit():
                    format_id = parts[0]
                    break

        if not format_id:
            return jsonify({
                'error': 'No suitable MP4 format found with video and audio'
            }), 400

        print(f"Selected format ID: {format_id}")

        # Step 3: Download the video with the selected format
        temp_file = "temp_video.mp4"
        download_cmd = [
            "yt-dlp",
            "-f", format_id,
            "-o", temp_file,
            "--no-warnings",
            "--no-check-certificate",
            url
        ]
        
        print(f"Running command: {' '.join(download_cmd)}")
        download_result = subprocess.run(download_cmd, capture_output=True, text=True)
        
        if download_result.returncode != 0:
            return jsonify({
                'error': f'Download failed: {download_result.stderr}'
            }), 400

        # Step 4: Send the file to the frontend
        return send_file(
            temp_file,
            as_attachment=True,
            download_name="tiktok_video.mp4",
            mimetype='video/mp4',
            conditional=True
        )

    except Exception as e:
        print(f"Error in download_tiktok: {str(e)}")
        return jsonify({'error': f'Error downloading TikTok: {str(e)}'}), 500

@app.route('/api/tiktok-info', methods=['POST'])
def get_tiktok_info():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    print(f"\n=== Processing TikTok URL with yt-dlp: {url} ===")
    
    try:
        # Options to get all video information including all formats
        ydl_opts_get_info = {
            'quiet': False,
            'no_warnings': False,
            'extract_flat': False,  # Need individual formats
            'force_generic_extractor': False,
            'extractor_retries': 3,
            'fragment_retries': 3,
            'retries': 3,
            'nocheckcertificate': True,
            'ignoreerrors': False, 
            'no_color': True,
            'cachedir': False,
            'noplaylist': True,
            'extractor_args': {
                'tiktok': {
                    'extract_flat': False,
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.tiktok.com/',
                'Origin': 'https://www.tiktok.com',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'TE': 'trailers',
            }
        }

        print(f"\n=== Getting all video info for TikTok URL: {url} ===")
        with yt_dlp.YoutubeDL(ydl_opts_get_info) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            print("ERROR: yt-dlp extract_info returned None or empty.")
            return jsonify({'error': 'Failed to extract video information from TikTok. yt-dlp returned no data.'}), 500
        
        print(f"\n=== All Available Formats for {url} (from extract_info) ===")
        if 'formats' in info and info['formats']:
            for fmt_idx, fmt_detail in enumerate(info['formats']):
                format_id = fmt_detail.get('format_id', 'N/A')
                ext = fmt_detail.get('ext', 'N/A')
                resolution = fmt_detail.get('resolution', 'N/A')
                vcodec = fmt_detail.get('vcodec', 'none')
                acodec = fmt_detail.get('acodec', 'none')
                note = fmt_detail.get('format_note', '')
                filesize = fmt_detail.get('filesize') or fmt_detail.get('filesize_approx')
                filesize_str = f"{filesize / (1024*1024):.2f}MB" if filesize else "N/A"
                has_url = 'present' if fmt_detail.get('url') else 'missing'
                print(f"  [{fmt_idx}] ID: {format_id}, Ext: {ext}, Res: {resolution}, Vid: {vcodec}, Aud: {acodec}, Note: {note}, Size: {filesize_str}, URL: {has_url}")
        else:
            print("  No 'formats' array found in yt-dlp info or it's empty.")

        # Programmatically select the best format
        selected_format = None
        candidates = []

        if 'formats' in info and info['formats']:
            for fmt_detail in info['formats']:
                if fmt_detail.get('url') and fmt_detail.get('vcodec', 'none') != 'none' and fmt_detail.get('acodec', 'none') != 'none':
                    candidates.append(fmt_detail)
        
        if candidates:
            mp4_candidates = [f for f in candidates if f.get('ext') == 'mp4']
            if mp4_candidates:
                mp4_candidates.sort(key=lambda f: (int(f.get('height', 0) or 0), int(f.get('vbr', 0) or f.get('tbr', 0) or 0)), reverse=True)
                selected_format = mp4_candidates[0]
                print(f"Selected MP4 (with audio): ID {selected_format.get('format_id')}, Res {selected_format.get('resolution')}")

            if not selected_format:
                webm_candidates = [f for f in candidates if f.get('ext') == 'webm']
                if webm_candidates:
                    webm_candidates.sort(key=lambda f: (int(f.get('height', 0) or 0), int(f.get('vbr', 0) or f.get('tbr', 0) or 0)), reverse=True)
                    selected_format = webm_candidates[0]
                    print(f"Selected WebM (with audio): ID {selected_format.get('format_id')}, Res {selected_format.get('resolution')}")
            
            if not selected_format: # Fallback to any candidate if specific extensions not found
                candidates.sort(key=lambda f: (int(f.get('height', 0) or 0), int(f.get('vbr', 0) or f.get('tbr', 0) or 0)), reverse=True)
                selected_format = candidates[0]
                print(f"Selected best available (with audio, any extension): ID {selected_format.get('format_id')}, Res {selected_format.get('resolution')}")

        # Prepare the response
        video_data_to_return = {
            'title': info.get('title', 'TikTok Video'),
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'uploader': info.get('uploader', ''),
            'webpage_url': info.get('webpage_url', url),
            'platform': 'tiktok',
            'formats': [], 
            'direct_url': None,
            'selected_format_id': None,
            'error_message': None
        }

        if 'formats' in info and info['formats']:
            for fmt_detail in info['formats']:
                if fmt_detail.get('url'): 
                    video_data_to_return['formats'].append({
                        'url': fmt_detail['url'],
                        'ext': fmt_detail.get('ext', 'N/A'),
                        'format_note': fmt_detail.get('format_note', ''),
                        'format_id': fmt_detail.get('format_id', 'N/A'),
                        'resolution': fmt_detail.get('resolution', fmt_detail.get('height', '')),
                        'filesize': fmt_detail.get('filesize') or fmt_detail.get('filesize_approx'),
                        'vcodec': fmt_detail.get('vcodec', 'none'),
                        'acodec': fmt_detail.get('acodec', 'none'),
                        'tbr': fmt_detail.get('tbr')
                    })
            video_data_to_return['formats'].sort(key=lambda x: (
                (int(str(x.get('resolution', '0x0')).split('x')[-1] or 0) if isinstance(x.get('resolution'), str) else int(x.get('resolution',0) or 0)),
                int(x.get('tbr',0) or 0)
            ), reverse=True)

        if selected_format and selected_format.get('url'):
            video_data_to_return['direct_url'] = selected_format['url']
            video_data_to_return['selected_format_id'] = selected_format.get('format_id')
            print(f"Final selected format URL for client: {video_data_to_return['direct_url']}")
        else:
            print("ERROR: No suitable downloadable format with video and audio found after manual selection.")
            video_data_to_return['error_message'] = 'No downloadable video format with both video and audio found. Please check backend logs for all available formats.'
            return jsonify(video_data_to_return), 404

        return jsonify(video_data_to_return)
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error processing TikTok URL: {str(e)}\n{error_trace}")
        return jsonify({
            'error': f'Failed to process TikTok video: {str(e)}',
            'type': 'tiktok_processing_error',
            'details': str(e)
        }), 400

@app.route('/api/video-info', methods=['POST'])
@app.route('/api/video-info/', methods=['POST'])
def get_video_info():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    print(f"\n=== Processing URL: {url} ===")
    
    # Normalize URLs
    if 'x.com' in url or 'twitter.com' in url:
        url = url.replace('x.com', 'twitter.com')
        print(f"Normalized Twitter URL to: {url}")
    elif 'tiktok.com' in url or 'vm.tiktok.com' in url:
        print("Processing TikTok URL")
        # Ensure we're using the mobile URL for better compatibility
        if 'vm.tiktok.com' not in url and '/video/' in url:
            # Extract video ID from URL like https://www.tiktok.com/@username/video/1234567890123456789
            import re
            video_id_match = re.search(r'/video/(\d+)', url)
            if video_id_match:
                video_id = video_id_match.group(1)
                url = f'https://www.tiktok.com/@placeholder/video/{video_id}'
                print(f"Reformatted TikTok URL to: {url}")
    
    # Create a copy of ydl_opts to modify per request
    request_ydl_opts = ydl_opts.copy()
    
    # Add TikTok specific options if needed
    if 'tiktok.com' in url or 'vm.tiktok.com' in url:
        print("Using TikTok-specific extractor options")
        request_ydl_opts.update({
            'extract_flat': False,
            'noplaylist': True,
            'ignore_no_formats_error': True,
            'force_generic_extractor': True,  # Try generic extractor
            'extractor_retries': 3,
            'fragment_retries': 3,
            'retries': 3,
            'sleep_interval': 1,
            'max_sleep_interval': 3,
            'extractor_args': {
                'tiktok': {
                    'extract_flat': False,
                    'skip_download': True,
                    'extractor_retries': 3,
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.tiktok.com/',
                'Origin': 'https://www.tiktok.com',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'TE': 'trailers',
            }
        })
    
    try:
        with yt_dlp.YoutubeDL(request_ydl_opts) as ydl:
            # First, try to get basic info without downloading
            try:
                print("Attempting to get video info...")
                info = ydl.extract_info(url, download=False)
                
                if not info:
                    print("No info returned, trying with download=True...")
                    info = ydl.extract_info(url, download=True)
                
                if not info:
                    print("No video information found (empty response)")
                    return jsonify({
                        'error': 'No video information found (empty response)',
                        'url': url,
                        'type': 'empty_response'
                    }), 400
                    
                print(f"Successfully got info, keys: {list(info.keys())}")
                print(f"Available formats: {[f.get('ext') for f in info.get('formats', []) if f.get('ext')]}")
                
            except Exception as e:
                print(f"Error extracting info: {str(e)}")
                # Try debug extraction
                try:
                    print("Trying debug extraction...")
                    info = debug_extractor_info(ydl, url)
                    if not info:
                        raise Exception("Debug extraction returned no data")
                except Exception as debug_e:
                    print(f"Debug extraction failed: {str(debug_e)}")
                    return jsonify({
                        'error': f'Failed to extract video info: {str(e)}',
                        'debug_error': str(debug_e),
                        'url': url,
                        'type': 'extraction_failed'
                    }), 400
            
            try:
                video_info = extract_video_info(info)
                print(f"Extracted video info: {video_info.keys() if video_info else 'None'}")
                if not video_info:
                    raise Exception("No video info extracted")
            except Exception as e:
                print(f"Error in extract_video_info: {str(e)}")
                return jsonify({
                    'error': f'Error processing video info: {str(e)}',
                    'url': url,
                    'type': 'processing_error'
                }), 400
            
            # Determine platform
            extractor = info.get('extractor', '').lower()
            webpage_url = info.get('webpage_url', '').lower()
            
            if 'youtube' in extractor or 'youtu.be' in webpage_url:
                platform = 'youtube'
            elif 'twitter' in extractor or 'x.com' in webpage_url or 'twitter.com' in webpage_url:
                platform = 'twitter'
            elif 'reddit.com' in webpage_url or 'redd.it' in webpage_url or 'reddit' in extractor:
                platform = 'reddit'
            elif 'tiktok.com' in webpage_url or 'tiktok' in extractor:
                platform = 'tiktok'
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
@app.route('/api/download/', methods=['POST'])
def download_video():
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    print(f"\n=== Processing download for URL: {url} ===")
    
    # Normalize URLs
    if 'x.com' in url or 'twitter.com' in url:
        url = url.replace('x.com', 'twitter.com')
    
    # Handle Reddit URLs - ensure we're using the direct URL
    if 'reddit.com' in url or 'redd.it' in url:
        # Remove any query parameters that might cause issues
        url = url.split('?')[0]
        # Ensure we're using the old.reddit.com for better compatibility
        url = url.replace('www.reddit.com', 'old.reddit.com')
    
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
            # Add additional options for Reddit
            'extractor_args': {
                'reddit': {
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
                'Referer': 'https://www.reddit.com/',
            },
        }
        
        with yt_dlp.YoutubeDL(download_opts) as ydl:
            # Get info first to set filename
            info = ydl.extract_info(url, download=False)
            print(f"Video info: {info}")
            
            if not info:
                return jsonify({'error': 'Could not retrieve video information'}), 400
            
            # For Reddit, we might need to get the direct media URL
            if 'reddit.com' in url or 'redd.it' in url:
                print("Processing Reddit video...")
                if 'url' in info and info['url']:
                    # Use the direct media URL if available
                    url = info['url']
                    print(f"Using direct media URL: {url}")
            
            # Download the video
            print(f"Starting download for URL: {url}")
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
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port, debug=True)
