// Backend API URL - Update this if your backend is hosted elsewhere
const BACKEND_URL = 'http://localhost:5000';

// DOM Elements for Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const body = document.body;
const currentTheme = localStorage.getItem('theme');
const themeIcon = themeToggle.querySelector('.theme-toggle-knob .material-icons-outlined');

// DOM Elements for Clip Controls and Input
const clipTextarea = document.getElementById('clipTextarea'); 
const videoInfoDisplay = document.getElementById('videoInfoDisplay');
const clipModeButtons = document.querySelectorAll('.clip-mode-button');
const dropdownItems = document.querySelectorAll('.dropdown-item');
const clipButton = document.getElementById('clipButton');
const clipButtonTextMain = clipButton.querySelector('.clip-button-text-main');
const clipButtonTextSuffix = clipButton.querySelector('.clip-button-text-suffix');
const promptButton = document.getElementById('promptButton'); 
const fullClipButton = document.getElementById('fullClipButton');
const enterButton = document.getElementById('enterButton');

// Placeholder Texts
const PLACEHOLDER_DEFAULT = "Paste video link and tell us what to clip";
const PLACEHOLDER_FULL_CLIP = "Enter your video link";
const PLACEHOLDER_CLIP_MODE = "Paste video link and specify clip details";


/**
 * Applies the selected theme (light/dark) to the page.
 * @param {string} theme - The theme to apply ('light' or 'dark').
 */
function applyTheme(theme) {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        if (themeIcon) themeIcon.textContent = 'dark_mode';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark-mode');
        if (themeIcon) themeIcon.textContent = 'light_mode';
        localStorage.setItem('theme', 'light');
    }
}

/**
 * Sets the active state for clip mode buttons and updates UI accordingly.
 * @param {HTMLElement} selectedButton - The button that was clicked to become active.
 */
function setActiveClipModeButton(selectedButton) {
    // Deactivate all clip mode buttons and reset their outlined state if needed
    clipModeButtons.forEach(button => {
        button.classList.remove('active');
        if (button.dataset.isOutlined === 'true' && button !== selectedButton) {
            button.classList.add('nav-button-outlined');
        }
        // Reset "Clip" button text if another mode is selected
        if (button.id === 'clipButton' && selectedButton.id !== 'clipButton') {
            if(clipButtonTextMain) clipButtonTextMain.textContent = 'Clip';
            if(clipButtonTextSuffix) clipButtonTextSuffix.textContent = '';
        }
    });

    // Activate the selected button
    selectedButton.classList.add('active');
    // If the newly active button was marked as outlined, remove that class
    // as the .active style (with 12% opacity bg) should take precedence.
    if (selectedButton.dataset.isOutlined === 'true') {
         selectedButton.classList.remove('nav-button-outlined');
    }

    // Update placeholder text based on the active button
    if (clipTextarea) { 
        if (selectedButton.id === 'fullClipButton') {
            clipTextarea.placeholder = PLACEHOLDER_FULL_CLIP;
        } else if (selectedButton.id === 'promptButton') {
            clipTextarea.placeholder = PLACEHOLDER_DEFAULT;
        } else if (selectedButton.id === 'clipButton') {
            clipTextarea.placeholder = PLACEHOLDER_CLIP_MODE; 
        }
    }
}

/**
 * Toggles the enabled/disabled state of the Enter button based on textarea content.
 */
function toggleEnterButtonState() {
    if(clipTextarea && enterButton){ 
        let hasContent = clipTextarea.value.trim() !== '';

        if (!hasContent) {
            enterButton.classList.add('disabled'); // Add .disabled for styling
            enterButton.classList.remove('active'); // Remove .active if it was there
            enterButton.disabled = true; // HTML attribute to prevent clicks
        } else {
            enterButton.classList.remove('disabled');
            enterButton.classList.add('active'); // Add .active for primary color styling
            enterButton.disabled = false;
        }
    }
}

/**
 * Extracts a YouTube video ID from various URL formats.
 * @param {string} url - The YouTube URL.
 * @returns {string|null} The video ID or null if not found.
 */
function extractVideoID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetches video information using our yt-dlp backend.
 * @param {string} url - The YouTube video URL.
 */
async function fetchVideoInfo(url) {
    if (!url) {
        displayVideoError("No URL provided");
        return;
    }
    
    const centerPreview = document.querySelector('.centre');
    if (centerPreview) {
        centerPreview.style.display = 'none';
    }
    
    if (videoInfoDisplay) {
        videoInfoDisplay.style.display = 'block';
        videoInfoDisplay.innerHTML = '<p class="loading-message">Fetching video info...</p>';
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/video-info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        displayVideoData(data);
        
    } catch (error) {
        console.error('Error fetching video info:', error);
        displayVideoError(`Failed to fetch video details: ${error.message}`);
    }
}

/**
 * Displays the fetched video data (thumbnail and title) in the center preview section.
 * @param {object} videoData - The video data from our backend.
 */
function displayVideoData(videoData) {
    const centerPreview = document.querySelector('.centre');
    if (!centerPreview) return;
    
    const title = videoData.title || 'No title available';
    const thumbnailUrl = videoData.thumbnail || '';
    
    // Update the center preview with the video thumbnail and title
    centerPreview.innerHTML = `
        ${thumbnailUrl ? `<img class="video-thumbnail" src="${thumbnailUrl}" alt="${title}" title="${title}">` : ''}
        <div class="video-title">${title}</div>
    `;
    
    // Show the preview section if it was hidden
    centerPreview.style.display = 'block';
    
    // Also update the video info display if it exists
    if (videoInfoDisplay) {
        videoInfoDisplay.innerHTML = '';
        videoInfoDisplay.style.display = 'none';
    }
}

/**
 * Displays an error message in the video info area.
 * @param {string} message - The error message to display.
 */
function displayVideoError(message) {
    // Hide the center preview on error
    const centerPreview = document.querySelector('.centre');
    if (centerPreview) {
        centerPreview.style.display = 'none';
    }
    
    // Show error in the video info display area
    if (videoInfoDisplay) {
        videoInfoDisplay.style.display = 'block';
        videoInfoDisplay.innerHTML = `<p class="error-message">${message}</p>`;
    }
    
    console.error('Video Error:', message);
}

// --- Initialize Page ---

// Apply saved theme or default
if (currentTheme) {
    applyTheme(currentTheme);
} else {
     applyTheme('light'); 
}

// Theme toggle event listener
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            applyTheme('light');
        } else {
            applyTheme('dark');
        }
    });
}

// Initialize clip mode buttons
clipModeButtons.forEach(button => {
    button.dataset.isOutlined = 'true'; // Mark all as outlined by default when inactive
    
    // The main "Clip" button's active state is handled by its dropdown items.
    // Other clip mode buttons set their active state on click.
    if (button.id !== 'clipButton') { 
        button.addEventListener('click', (event) => {
            setActiveClipModeButton(event.currentTarget);
        });
    }
});

// Dropdown item click listeners
dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
        const parentButtonId = item.dataset.parentButtonId;
        const value = item.dataset.value; 

        if (parentButtonId) {
            const parentButton = document.getElementById(parentButtonId);
            if (parentButton) {
                setActiveClipModeButton(parentButton); 
                // Update text of the parent "Clip" button
                if (parentButton.id === 'clipButton' && value) {
                    if(clipButtonTextMain) clipButtonTextMain.textContent = 'Clip';
                    if(clipButtonTextSuffix) clipButtonTextSuffix.textContent = `(${value})`;
                }
            }
        }
    });
});

// ARIA for "Clip" dropdown button
if (clipButton) {
    clipButton.addEventListener('click', () => { 
        const isExpanded = clipButton.getAttribute('aria-expanded') === 'true' || false;
        clipButton.setAttribute('aria-expanded', !isExpanded);
        // Note: Dropdown visibility is primarily CSS hover-driven. This click is for ARIA.
    });
}

// Set "Prompt" button as active by default on page load
if (promptButton) {
    setActiveClipModeButton(promptButton);
}

// Initialize Enter button state and add listener to textarea
if(clipTextarea) { 
    clipTextarea.addEventListener('input', toggleEnterButtonState);
    toggleEnterButtonState(); // Set initial state
}

// Add listener to Enter button for YouTube API call
if(enterButton) {
    enterButton.addEventListener('click', () => {
        if (!enterButton.disabled && clipTextarea) {
            const url = clipTextarea.value.trim();
            if (!url) {
                displayVideoError("Please enter a YouTube URL.");
                return;
            }
            
            // Use the URL directly with yt-dlp
            fetchVideoInfo(url);
        }
    });
    
    // Also trigger on Enter key in the textarea
    if (clipTextarea) {
        clipTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enterButton.click();
            }
        });
    }
}
