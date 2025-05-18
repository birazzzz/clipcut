class VideoInfo {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'video-info-container';
        this.init();
    }

    init() {
        // Create the basic structure
        this.container.innerHTML = `
            <div class="video-info">
                <div class="thumbnail-container">
                    <img class="thumbnail" src="" alt="Video thumbnail">
                </div>
                <div class="video-details">
                    <h2 class="video-title"></h2>
                    <div class="video-meta">
                        <span class="channel-name"></span>
                        <span class="video-date"></span>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .video-info-container {
                max-width: 800px;
                margin: 2rem auto;
                padding: 1rem;
            }

            .video-info {
                display: flex;
                gap: 1.5rem;
                background: var(--navbar-bg-light);
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .dark-mode .video-info {
                background: var(--navbar-bg-dark);
            }

            .thumbnail-container {
                flex-shrink: 0;
                width: 320px;
                height: 180px;
                border-radius: 8px;
                overflow: hidden;
            }

            .thumbnail {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .video-details {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            .video-title {
                font-size: 1.5rem;
                font-weight: 600;
                margin-bottom: 0.5rem;
                color: var(--text-color-logo-light);
            }

            .dark-mode .video-title {
                color: var(--text-color-logo-dark);
            }

            .video-meta {
                display: flex;
                gap: 1rem;
                color: var(--nav-button-text-light);
                font-size: 0.9rem;
            }

            .dark-mode .video-meta {
                color: var(--nav-button-text-dark);
            }
        `;
        document.head.appendChild(style);
    }

    async loadVideoInfo(videoId) {
        try {
            // In a real application, you would fetch this data from your backend
            // For now, we'll simulate it with a mock response
            const mockData = {
                title: "Sample Video Title",
                thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                channelName: "Channel Name",
                publishDate: "2024-03-20"
            };

            this.updateUI(mockData);
        } catch (error) {
            console.error('Error loading video info:', error);
        }
    }

    updateUI(data) {
        const thumbnail = this.container.querySelector('.thumbnail');
        const title = this.container.querySelector('.video-title');
        const channelName = this.container.querySelector('.channel-name');
        const videoDate = this.container.querySelector('.video-date');

        thumbnail.src = data.thumbnailUrl;
        title.textContent = data.title;
        channelName.textContent = data.channelName;
        videoDate.textContent = new Date(data.publishDate).toLocaleDateString();
    }

    mount(element) {
        element.appendChild(this.container);
    }
}

// Export the class
export default VideoInfo;