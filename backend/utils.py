import os
import logging
from functools import lru_cache
from flask import jsonify
import yt_dlp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Common yt-dlp options
YDL_OPTS = {
    'quiet': True,
    'no_warnings': False,
    'extract_flat': False,
    'force_generic_extractor': True,
    'socket_timeout': 30,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'noplaylist': True,
    'extractor_retries': 3,
    'retries': 3,
    'fragment_retries': 3,
    'skip_unavailable_fragments': True,
    'compat_opts': {'no-youtube-unavailable-videos'},
    'extractor_args': {
        'twitter': {'skip_auth': True},
    },
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://twitter.com/',
    },
}

def normalize_url(url):
    """Normalize social media URLs."""
    if not url:
        return url
    return url.replace('x.com', 'twitter.com')

def create_error_response(message, status_code=400):
    """Create a standardized error response."""
    logger.error(f"Error: {message}")
    return jsonify({'error': message}), status_code

def get_video_info(url):
    """Get video info using yt-dlp with caching."""
    try:
        with yt_dlp.YoutubeDriver(YDL_OPTS) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as e:
        logger.error(f"Error getting video info: {str(e)}")
        return None
