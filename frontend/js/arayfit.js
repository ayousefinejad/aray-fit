(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // Service Worker Registration
    // ═══════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(registration => {
                    console.log('✅ Service Worker registered:', registration.scope);

                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'activated') {
                                console.log('🔄 Service Worker updated, reloading...');
                                window.location.reload();
                            }
                        });
                    });
                })
                .catch(err => console.error('❌ Service Worker registration failed:', err));
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Cache Management Utility
    // ═══════════════════════════════════════════════════════════
    window.clearArayfitCache = async function() {
        try {
            // Unregister service worker
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                    console.log('🗑️ Service Worker unregistered');
                }
            }

            // Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
                console.log('🗑️ All caches cleared:', cacheNames);
            }

            // Clear localStorage
            localStorage.clear();
            console.log('🗑️ localStorage cleared');

            // Clear sessionStorage
            sessionStorage.clear();
            console.log('🗑️ sessionStorage cleared');

            console.log('✅ Cache cleared successfully! Reloading...');
            setTimeout(() => window.location.reload(true), 500);
        } catch (error) {
            console.error('❌ Error clearing cache:', error);
        }
    };

    // ═══════════════════════════════════════════════════════════
    // Audio Player Management
    // ═══════════════════════════════════════════════════════════
    let currentAudio = null;
    let currentTrackInfo = null;
    let audioContextUnlocked = false;

    // Unlock audio on iOS - required for audio playback
    // iOS Safari requires user interaction before playing audio
    function unlockAudioContext() {
        if (audioContextUnlocked) return;

        // Try to create and play a silent audio to unlock iOS audio
        const silentAudio = new Audio();
        silentAudio.preload = 'auto';
        silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

        const unlockPromise = silentAudio.play();
        if (unlockPromise !== undefined) {
            unlockPromise
                .then(() => {
                    audioContextUnlocked = true;
                    silentAudio.pause();
                    silentAudio.currentTime = 0;
                    console.log('✅ iOS audio context unlocked');
                })
                .catch(err => {
                    console.log('ℹ️ Audio context unlock not needed or failed:', err.name);
                });
        }
    }

    function formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function formatDate(isoString) {
        if (!isoString) return 'نامشخص';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return 'چند دقیقه پیش';
        if (diffHours < 24) return `${diffHours} ساعت پیش`;
        if (diffDays === 1) return 'دیروز';
        if (diffDays < 7) return `${diffDays} روز پیش`;
        return date.toLocaleDateString('fa-IR');
    }

    function showPlayer(title, size) {
        const modal = document.getElementById('audioPlayerModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalDuration = document.getElementById('modalDuration');

        modalTitle.textContent = title || 'فایل صوتی';
        modalDuration.textContent = 'در حال بارگذاری...';
        modal.style.display = 'flex';
    }

    function hidePlayer() {
        const modal = document.getElementById('audioPlayerModal');
        modal.style.display = 'none';
    }

    function updatePlayPauseButton(isPlaying) {
        const playIcon = document.querySelector('.af-modal-play-icon');
        const pauseIcon = document.querySelector('.af-modal-pause-icon');

        if (playIcon && pauseIcon) {
            playIcon.style.display = isPlaying ? 'none' : 'block';
            pauseIcon.style.display = isPlaying ? 'block' : 'none';
        }
        updateCardPlayButtons();
    }

    /** Update play/pause icons on all audio cards based on current playback state */
    function updateCardPlayButtons() {
        const isPlaying = currentAudio && !currentAudio.paused;
        const currentUrl = currentTrackInfo ? currentTrackInfo.url : null;

        document.querySelectorAll('.af-card-play-btn').forEach(btn => {
            const playIcon = btn.querySelector('.af-card-play-icon');
            const pauseIcon = btn.querySelector('.af-card-pause-icon');
            if (!playIcon || !pauseIcon) return;

            const isThisTrack = btn.dataset.audioUrl === currentUrl;
            if (isThisTrack && isPlaying) {
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
            } else {
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
            }
        });
    }

    function updateProgress() {
        if (!currentAudio) return;

        const currentEl = document.getElementById('modalCurrentTime');
        const totalEl = document.getElementById('modalTotalTime');
        const progressFill = document.getElementById('modalProgressFill');

        if (currentEl) currentEl.textContent = formatTime(currentAudio.currentTime);
        if (totalEl) totalEl.textContent = formatTime(currentAudio.duration);

        const duration = currentAudio.duration;
        const progress = (duration && !isNaN(duration)) ? (currentAudio.currentTime / duration) * 100 : 0;
        if (progressFill) progressFill.style.width = `${progress}%`;
    }

    function playAudio(audioUrl, title, size) {
        // Stop current audio if playing
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        // Store track info
        currentTrackInfo = { url: audioUrl, title, size };

        // Create new audio element with mobile-friendly settings
        currentAudio = new Audio();

        // Mobile-specific settings for better compatibility
        currentAudio.preload = 'auto';  // Preload on mobile
        currentAudio.playsInline = true;  // Required for iOS to play inline
        currentAudio.crossOrigin = 'anonymous';  // Enable CORS for audio

        // Set source AFTER configuring attributes (important for iOS)
        currentAudio.src = audioUrl;

        // Show player UI
        showPlayer(title, size);

        // Setup event listeners BEFORE calling load/play
        // Update progress
        currentAudio.addEventListener('timeupdate', updateProgress);

        // Audio ended
        currentAudio.addEventListener('ended', () => {
            updatePlayPauseButton(false);
            console.log('✅ Audio finished');
        });

        // Audio error
        currentAudio.addEventListener('error', (e) => {
            console.error('❌ Audio error:', e);
            const errorMsg = currentAudio.error ?
                `خطا در پخش: ${getAudioErrorMessage(currentAudio.error.code)}` :
                'خطا در پخش فایل صوتی';
            alert(errorMsg);
            hidePlayer();
        });

        // Metadata loaded (for duration)
        currentAudio.addEventListener('loadedmetadata', () => {
            updateProgress();
            // Clear loading text
            const modalDuration = document.getElementById('modalDuration');
            if (modalDuration) {
                modalDuration.textContent = '';
            }
        });

        // iOS Safari requires load() before play() in many cases
        currentAudio.load();

        // Play audio - with better error handling for mobile
        const playPromise = currentAudio.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                updatePlayPauseButton(true);
                console.log(`▶️ Playing: ${title}`);
            }).catch(err => {
                console.error('Playback error:', err);

                // Check if it's an autoplay prevention error
                if (err.name === 'NotAllowedError') {
                    alert('لطفاً روی دکمه پخش کلیک کنید.\n(مرورگر شما نیاز به تعامل کاربر دارد)');
                    updatePlayPauseButton(false);
                } else if (err.name === 'NotSupportedError') {
                    alert('فرمت فایل صوتی پشتیبانی نمی‌شود');
                    hidePlayer();
                } else {
                    alert('خطا در پخش فایل صوتی');
                    hidePlayer();
                }
            });
        }
    }

    // Helper function to get user-friendly error messages
    function getAudioErrorMessage(errorCode) {
        const errors = {
            1: 'بارگذاری متوقف شد',  // MEDIA_ERR_ABORTED
            2: 'خطای شبکه',  // MEDIA_ERR_NETWORK
            3: 'خطای رمزگشایی',  // MEDIA_ERR_DECODE
            4: 'فرمت پشتیبانی نمی‌شود'  // MEDIA_ERR_SRC_NOT_SUPPORTED
        };
        return errors[errorCode] || 'خطای نامشخص';
    }

    function togglePlayPause() {
        if (!currentAudio) return;

        if (currentAudio.paused) {
            currentAudio.play();
            updatePlayPauseButton(true);
        } else {
            currentAudio.pause();
            updatePlayPauseButton(false);
        }
    }

    function stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            updatePlayPauseButton(false);
            hidePlayer();
        }
    }

    /** Show player bar only (no audio) so user can see play/pause UI when no files exist */
    function showPlayerPlaceholder() {
        showPlayer('فعلاً فایلی موجود نیست', 'روی یکی از جلسات کلیک کنید');
        updatePlayPauseButton(false);
    }

    async function loadAudioFiles() {
        const quickMeditations = document.querySelector('.af-quick-meditations');
        
        // Show loading message
        if (quickMeditations) {
            quickMeditations.innerHTML = '<p style="text-align: center; color: #888; padding: 2rem;">در حال بارگذاری...</p>';
        }

        try {
            const response = await fetch('/api/audio/list?limit=10');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const audioFiles = (data.success && data.audio_files) ? data.audio_files : [];

            // Update "جلسات مدیتشن" section (even 1 or 2 files)
            if (quickMeditations) {
                if (audioFiles.length > 0) {
                    const slice = audioFiles.slice(0, 3);
                    quickMeditations.innerHTML = slice.map(audio => {
                        const displayName = audio.title || audio.filename || 'فایل صوتی';
                        return `
                        <div class="af-meditation-card" data-audio-id="${audio.id}" data-audio-url="${audio.url}" data-audio-title="${displayName.replace(/"/g, '&quot;')}" data-audio-size="${audio.size || 0}">
                            <div class="af-meditation-icon">🎵</div>
                            <div class="af-meditation-info">
                                <div class="af-meditation-name">${displayName}</div>
                                <div class="af-meditation-meta">${formatDate(audio.created_at)}</div>
                            </div>
                            <button class="af-card-play-btn af-card-play-btn--meditation" data-audio-url="${audio.url}" data-audio-title="${displayName.replace(/"/g, '&quot;')}" data-audio-size="${audio.size || 0}" type="button" aria-label="پخش/مکث">
                                <svg class="af-card-play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                <svg class="af-card-pause-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                            </button>
                        </div>
                        `;
                    }).join('');

                    quickMeditations.querySelectorAll('.af-meditation-card').forEach((card, index) => {
                        card.addEventListener('click', (e) => {
                            if (e.target.closest('.af-card-play-btn')) return;
                            // Unlock audio context on first interaction (iOS requirement)
                            unlockAudioContext();
                            const url = card.dataset.audioUrl;
                            const title = card.dataset.audioTitle || card.querySelector('.af-meditation-name').textContent;
                            const audio = slice[index];
                            playAudio(url, title, audio.size);
                        });
                    });
                    quickMeditations.querySelectorAll('.af-card-play-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // Unlock audio context on first interaction (iOS requirement)
                            unlockAudioContext();
                            const url = btn.dataset.audioUrl;
                            const title = btn.dataset.audioTitle || 'فایل صوتی';
                            const size = parseInt(btn.dataset.audioSize) || 0;
                            if (currentTrackInfo && currentTrackInfo.url === url) {
                                togglePlayPause();
                            } else {
                                playAudio(url, title, size);
                            }
                        });
                    });
                } else {
                    // No audio files: show empty message
                    quickMeditations.innerHTML = '<p style="text-align: center; color: #888; padding: 2rem;">فایلی جهت نمایش وجود ندارد!</p>';
                }
            }


            if (audioFiles.length > 0) {
                console.log(`✅ Loaded ${audioFiles.length} audio files`);
            } else {
                console.log('No audio files from API; section cleared');
            }
        } catch (error) {
            console.error('❌ Error loading audio files:', error);
            // On error, show empty message
            const quickMeditations = document.querySelector('.af-quick-meditations');
            if (quickMeditations) {
                quickMeditations.innerHTML = '<p style="text-align: center; color: #888; padding: 2rem;">فایلی جهت نمایش وجود ندارد!</p>';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Tab Navigation
    // ═══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {
        const buttons = document.querySelectorAll('.af-tab-btn');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.tab;

                // Show matching tab, hide others
                document.querySelectorAll('.af-tab').forEach(panel => {
                    const match = panel.classList.contains('af-tab-' + name);
                    panel.classList.toggle('af-active', match);
                    if (match) {
                        // Re-trigger fade animation
                        panel.style.animation = 'none';
                        void panel.offsetHeight;
                        panel.style.animation = '';
                    }
                });

                // Update active state on tab buttons
                buttons.forEach(b => {
                    b.classList.toggle('af-tab-btn-active', b === btn);
                });

                // Scroll content to top
                document.querySelector('.af-content').scrollTop = 0;
            });
        });

        // Load audio files on page load
        loadAudioFiles();

        // Modal audio player controls
        const modalPlayPauseBtn = document.getElementById('modalPlayPauseBtn');
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        const modalProgressBar = document.getElementById('modalProgressBar');

        if (modalPlayPauseBtn) {
            modalPlayPauseBtn.addEventListener('click', () => {
                // Unlock audio context on first interaction (iOS requirement)
                unlockAudioContext();
                togglePlayPause();
            });
        }

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', stopAudio);
        }

        if (modalProgressBar) {
            modalProgressBar.addEventListener('click', (e) => {
                if (!currentAudio) return;
                const rect = modalProgressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                currentAudio.currentTime = percent * currentAudio.duration;
            });
        }
    });

})();