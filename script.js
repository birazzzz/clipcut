// Backend API URL - Update this if your backend is hosted elsewhere
const BACKEND_URL = 'http://localhost:3000'; // Changed from 8001 to 3000

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
    
    // Hide any previous error messages
    if (videoInfoDisplay) {
        videoInfoDisplay.style.display = 'none';
    }
    
    // Save original button text and set loading state
    const enterButton = document.getElementById('enterButton');
    const originalButtonHTML = enterButton.innerHTML;
    enterButton.innerHTML = '<span class="loading-text">Loading</span>';
    enterButton.disabled = true;
    
    // Start the ellipsis animation
    const loadingText = enterButton.querySelector('.loading-text');
    let dots = 0;
    const loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        loadingText.textContent = 'Loading' + '.'.repeat(dots);
    }, 500);
    
    // Store the interval ID on the button so we can clear it later
    enterButton._loadingInterval = loadingInterval;

    try {
        console.log('Fetching video info for URL:', url);
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
    } finally {
        // Restore original button state and clear interval
        if (enterButton) {
            clearInterval(enterButton._loadingInterval);
            enterButton.innerHTML = originalButtonHTML;
            enterButton.disabled = false;
            delete enterButton._loadingInterval;
        }
    }
}

/**
 * Formats the duration in seconds to HH:MM:SS or MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
function formatDuration(seconds) {
    if (!seconds) return '';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    return h > 0 
        ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        : `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Displays the fetched video data (thumbnail and title) in the center preview section.
 * @param {object} videoData - The video data from our backend.
 */
function displayVideoData(videoData) {
    const centerPreview = document.querySelector('.centre');
    const videoContainer = document.querySelector('.video-preview-container');
    const downloadButton = document.getElementById('downloadButton');
    
    if (!centerPreview || !videoContainer) return;
    
    // Store the current video URL for download
    window.currentVideoUrl = videoData.url || videoData.webpage_url || '';
    console.log('Setting currentVideoUrl to:', window.currentVideoUrl);
    console.log('Full videoData:', videoData);
    
    // Show and enable the download button
    if (downloadButton) {
        downloadButton.style.display = 'flex';
        downloadButton.style.visibility = 'visible';
        downloadButton.style.opacity = '1';
        downloadButton.disabled = false;
        console.log('Download button shown and enabled');
    } else {
        console.error('Download button element not found when trying to display video');
    }
    
    // Add a class to indicate video is loaded
    videoContainer.classList.add('has-video');
    
    const title = videoData.title || 'No title available';
    let thumbnailUrl = videoData.thumbnail || '';
    const isTwitter = videoData.platform === 'twitter';
    const videoId = extractVideoID(videoData.webpage_url || '');
    
    // For Twitter, sometimes we need to use a different thumbnail URL format
    if (isTwitter && thumbnailUrl) {
        // Try to get a higher resolution thumbnail if available
        thumbnailUrl = thumbnailUrl.replace('&name=small', '&name=large');
    }
    
    // Format duration if available
    const duration = videoData.duration ? formatDuration(videoData.duration) : '';
    
    // Create the video info HTML
    let videoInfoHTML = `
        ${thumbnailUrl ? `
            <div class="thumbnail-container" ${videoData.platform === 'youtube' ? 'data-video-id="' + videoId + '" onclick="embedYouTubeVideo(this, event)"' : ''}>
                <img class="video-thumbnail" src="${thumbnailUrl}" alt="${title}" title="${title}" onerror="this.onerror=null; this.style.display='none';">
                ${videoData.platform === 'youtube' ? `
                    <div class="play-button-overlay">
                        <div class="play-button">
                            <span class="material-icons-outlined">play_arrow</span>
                        </div>
                    </div>
                ` : ''}
                <div class="thumbnail-overlay">
                    ${duration ? `<div class="video-duration">${duration}</div>` : ''}
                    ${videoData.platform === 'youtube' ? `<div class="video-platform">YouTube</div>` : ''}
                </div>
            </div>` 
        : ''}
        <div class="video-info">
            <div class="video-title">${title}</div>
            ${videoData.platform === 'twitter' ? `<div class="video-platform">Twitter</div>` : ''}
        </div>
    `;
    
    // Update the center preview
    centerPreview.innerHTML = videoInfoHTML;
    centerPreview.style.display = 'block';
    
    // Also update the video info display if it exists
    if (videoInfoDisplay) {
        videoInfoDisplay.innerHTML = '';
        videoInfoDisplay.style.display = 'none';
    }
}

/**
 * Clears the video preview and hides the download button
 */
/**
 * Clears the video preview and hides the download button
 */
function clearVideoPreview() {
    const centerPreview = document.querySelector('.centre');
    const videoContainer = document.querySelector('.video-preview-container');
    const downloadButton = document.getElementById('downloadButton');
    
    if (centerPreview) {
        centerPreview.innerHTML = '';
        centerPreview.style.display = 'none';
    }
    
    if (videoContainer) {
        videoContainer.classList.remove('has-video');
    }
    
    // Hide the download button
    if (downloadButton) {
        downloadButton.style.display = 'none';
    }
    
    // Clear the current video URL
    window.currentVideoUrl = '';
}

/**
 * Displays an error message in the video info area.
 * @param {string} message - The error message to display.
 */
function displayVideoError(message) {
    // Hide the center preview and download button
    clearVideoPreview();
    
    // Show error in the video info display area
    if (videoInfoDisplay) {
        videoInfoDisplay.style.display = 'block';
        videoInfoDisplay.innerHTML = `<p class="error-message">${message}</p>`;
    }
    
    console.error('Video Error:', message);
}

/**
 * Embeds a YouTube video when the thumbnail is clicked
 * @param {HTMLElement} element - The clicked element
 * @param {Event} event - The click event
 */
function embedYouTubeVideo(element, event) {
    // Prevent the click from bubbling up to parent elements
    event.stopPropagation();
    
    const videoId = element.getAttribute('data-video-id');
    if (!videoId) return;
    
    // Create the YouTube iframe
    const iframe = document.createElement('iframe');
    iframe.setAttribute('width', '100%');
    iframe.setAttribute('height', '100%');
    iframe.setAttribute('src', `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&showinfo=0`);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    
    // Replace the thumbnail with the iframe
    element.innerHTML = '';
    element.appendChild(iframe);
    element.classList.add('video-embedded');
    
    // Remove the click handler to prevent re-embedding
    element.onclick = null;
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

// Handle download button click
async function handleDownload() {
    console.log('Download button clicked');
    const downloadButton = document.getElementById('downloadButton');
    
    if (!downloadButton) {
        console.error('Download button not found');
        return;
    }
    
    if (!window.currentVideoUrl) {
        console.error('No video URL set');
        alert('Please enter a video URL first');
        return;
    }
    
    console.log('Current video URL:', window.currentVideoUrl);
    
    // Show loading state
    const originalHTML = downloadButton.innerHTML;
    downloadButton.disabled = true;
    downloadButton.innerHTML = '<span class="material-symbols-rounded spin">hourglass_empty</span> Preparing...';
    
    try {
        // Show preparing state
        downloadButton.innerHTML = '<span class="material-symbols-rounded spin">hourglass_empty</span> Preparing download...';
        
        // Start the download
        const response = await fetch(`${BACKEND_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: window.currentVideoUrl })
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                console.error('Error parsing error response:', e);
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            console.error('Download error response:', errorData);
            
            // Format a more detailed error message
            let errorMessage = errorData.message || errorData.error || 'Download failed';
            if (errorData.details) {
                errorMessage += `\n\nDetails: ${errorData.details}`;
            }
            if (errorData.exitCode) {
                errorMessage += `\nExit code: ${errorData.exitCode}`;
            }
            
            throw new Error(errorMessage);
        }

        // Get the filename from the content-disposition header or generate one
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'video.mp4';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        // Create a blob from the response
        const blob = await response.blob();
        
        // Create a download link and trigger it
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
    } catch (error) {
        console.error('Download error:', error);
        
        // Show more detailed error message
        const errorMessage = error.message || 'An unknown error occurred';
        alert(`❌ Download Failed\n\n${errorMessage}\n\nPlease try again or contact support if the problem persists.`);
    } finally {
        // Reset button state
        downloadButton.disabled = false;
        downloadButton.innerHTML = originalHTML;
    }
}

// Add event delegation for dynamically created download button
console.log('Adding click event listener for download button');
document.addEventListener('click', (event) => {
    console.log('Click event detected on:', event.target);
    const downloadButton = event.target.closest('#downloadButton');
    if (downloadButton) {
        console.log('Download button clicked, current state:', {
            disabled: downloadButton.disabled,
            display: window.getComputedStyle(downloadButton).display,
            visibility: window.getComputedStyle(downloadButton).visibility
        });
        if (!downloadButton.disabled) {
            handleDownload();
        } else {
            console.log('Download button is disabled');
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {

    // Textarea input handling
    if (clipTextarea) {
        // Handle paste event for auto-submission
        clipTextarea.addEventListener('paste', (e) => {
            // Let the paste complete
            setTimeout(() => {
                const text = clipTextarea.value.trim();
                if (text) {
                    const videoId = extractVideoID(text);
                    if (videoId) {
                        fetchVideoInfo(text);
                    }
                }
            }, 10);
        });

        // Handle Enter key press
        clipTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = clipTextarea.value.trim();
                if (text) {
                    const videoId = extractVideoID(text);
                    if (videoId) {
                        fetchVideoInfo(text);
                    }
                }
            }
        });

        // Update Enter button state based on textarea content
        clipTextarea.addEventListener('input', toggleEnterButtonState);
    }
});

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
