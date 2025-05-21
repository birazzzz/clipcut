# ClipCut

A web application for downloading and clipping YouTube videos using yt-dlp.

## Features

- Fetch and display YouTube video information
- Preview video thumbnails and titles
- Light and dark theme support
- Responsive design

## Prerequisites

- Python 3.6+
- pip (Python package manager)
- Node.js and npm (for frontend development)

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   python app.py
   ```
   The server will start on `http://localhost:5000`

## Frontend Setup

1. Open a new terminal window and navigate to the project root directory.

2. Start a local HTTP server (Python 3):
   ```bash
   python -m http.server 8000
   ```
   Or use any other local server of your choice.

3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

## Usage

1. Enter a YouTube URL in the input field
2. Click the Enter button or press Enter
3. The video thumbnail and title will appear in the center preview section
4. Use the clip controls to specify how you want to process the video

## Development

### Backend

The backend is a Flask server that uses yt-dlp to fetch video information. The main endpoints are:

- `POST /api/video-info` - Fetches information about a YouTube video

### Frontend

The frontend is built with vanilla JavaScript and uses the following:
- Material Icons for icons
- CSS variables for theming
- Fetch API for making requests to the backend

## License

This project is licensed under the MIT License.
