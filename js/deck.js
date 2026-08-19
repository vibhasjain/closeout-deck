/**
 * Closeout Copilot Deck
 * Navigation: Arrow keys (desktop), Vertical scroll (mobile)
 */

(function() {
    'use strict';

    // Elements
    const slides = document.querySelectorAll('.slide');
    const progressBar = document.getElementById('progressBar');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // Deck nav chrome is built here, never in page markup, so every deck —
    // current and future — gets identical navigation from one definition.
    const slideNavGroup = buildNavGroup();
    const slideDots = slideNavGroup.firstElementChild;

    // State
    let currentSlide = 0;
    const totalSlides = slides.length;
    let isAnimating = false;
    let isMobile = window.innerWidth <= 768;

    // Initialize
    function init() {
        createDots();
        updateUI();
        bindEvents();
        checkMobile();
        setupLogoFallbacks();
        setupHeroVideoPingPong();
    }

    // Setup ping-pong (forward/reverse) playback for hero video
    function setupHeroVideoPingPong() {
        const heroVideo = document.querySelector('.hero-video');
        if (!heroVideo) return;

        let playingForward = true;
        let reverseInterval = null;

        // Use timeupdate to detect when video reaches the end (more reliable than 'ended')
        heroVideo.addEventListener('timeupdate', () => {
            if (playingForward && heroVideo.duration && heroVideo.currentTime >= heroVideo.duration - 0.1) {
                // Video reached the end while playing forward, start reverse
                heroVideo.pause();
                playingForward = false;
                playBackward();
            }
        });

        function playBackward() {
            if (reverseInterval) clearInterval(reverseInterval);

            const step = 1 / 30; // ~30fps step
            reverseInterval = setInterval(() => {
                if (heroVideo.currentTime <= 0.05) {
                    clearInterval(reverseInterval);
                    reverseInterval = null;
                    heroVideo.currentTime = 0;
                    playingForward = true;
                    heroVideo.play().catch(() => {});
                } else {
                    heroVideo.currentTime = Math.max(0, heroVideo.currentTime - step);
                }
            }, 1000 / 30);
        }

        // Ensure video plays on mobile (may need user interaction)
        heroVideo.play().catch(() => {
            // Autoplay blocked, try to play on first interaction
            document.addEventListener('touchstart', () => {
                heroVideo.play();
            }, { once: true });
        });
    }

    // Setup fallbacks for logo images that fail to load
    function setupLogoFallbacks() {
        const logoImages = document.querySelectorAll('.logo-card__img');

        logoImages.forEach(img => {
            const fallback = img.nextElementSibling;
            if (!fallback || !fallback.classList.contains('logo-card__fallback')) return;

            // Handle load error
            img.addEventListener('error', () => {
                img.classList.add('hidden');
                fallback.classList.add('visible');
            });

            // Check if image is already broken (cached error state)
            if (img.complete && img.naturalWidth === 0) {
                img.classList.add('hidden');
                fallback.classList.add('visible');
            }
        });
    }

    // Build the shared deck nav. Replaces any nav markup a page still carries,
    // so page-level copies can't drift from this one.
    function buildNavGroup() {
        let group = document.querySelector('.slide-nav-group');
        if (!group) {
            group = document.createElement('div');
            group.className = 'slide-nav-group';
            document.body.appendChild(group);
        }
        group.innerHTML = '<div class="slide-dots"></div>';
        return group;
    }

    // Create navigation dots
    function createDots() {
        for (let i = 0; i < totalSlides; i++) {
            const dot = document.createElement('button');
            dot.classList.add('slide-dot');
            dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
            dot.setAttribute('data-slide', i + 1);
            dot.addEventListener('click', () => goToSlide(i));
            slideDots.appendChild(dot);
        }
    }

    // Update UI elements
    function updateUI() {
        // Update progress bar
        const progress = ((currentSlide + 1) / totalSlides) * 100;
        progressBar.style.width = `${progress}%`;

        // Update dots
        const dots = slideDots.querySelectorAll('.slide-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlide);
        });

        // Update nav buttons
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === totalSlides - 1;

        // Hide nav arrows on first slide (title slide)
        const navArrows = document.querySelector('.nav-arrows');
        if (navArrows) {
            navArrows.classList.toggle('nav-arrows--hidden', currentSlide === 0);
        }

        // Update slides (desktop only)
        if (!isMobile) {
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === currentSlide);
            });
        }
    }

    // Go to specific slide
    function goToSlide(index) {
        if (isAnimating || index === currentSlide) return;
        if (index < 0 || index >= totalSlides) return;

        isAnimating = true;
        currentSlide = index;
        updateUI();

        if (isMobile) {
            slides[index].scrollIntoView({ behavior: 'smooth' });
        }

        setTimeout(() => {
            isAnimating = false;
        }, 500);
    }

    // Flash arrow animation
    function flashArrow(btn) {
        if (!btn || btn.disabled) return;
        btn.classList.remove('nav-arrow--flash');
        // Trigger reflow to restart animation
        void btn.offsetWidth;
        btn.classList.add('nav-arrow--flash');
        // Remove class after animation completes
        setTimeout(() => {
            btn.classList.remove('nav-arrow--flash');
        }, 600);
    }

    // Next slide
    function nextSlide() {
        if (currentSlide < totalSlides - 1) {
            goToSlide(currentSlide + 1);
        }
    }

    // Previous slide
    function prevSlide() {
        if (currentSlide > 0) {
            goToSlide(currentSlide - 1);
        }
    }

    // Handle keyboard navigation
    function handleKeydown(e) {
        const p = (e.composedPath && e.composedPath()[0]) || e.target;
        if (p && (p.tagName === 'INPUT' || p.tagName === 'TEXTAREA' || p.isContentEditable)) return;
        if (isMobile) return;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case ' ':
            case 'PageDown':
                e.preventDefault();
                flashArrow(nextBtn);
                nextSlide();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
                e.preventDefault();
                flashArrow(prevBtn);
                prevSlide();
                break;
            case 'Home':
                e.preventDefault();
                goToSlide(0);
                break;
            case 'End':
                e.preventDefault();
                goToSlide(totalSlides - 1);
                break;
        }
    }

    // Handle wheel events (desktop)
    let wheelTimeout;
    function handleWheel(e) {
        if (isMobile) return;

        clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
            if (e.deltaY > 0) {
                nextSlide();
            } else if (e.deltaY < 0) {
                prevSlide();
            }
        }, 50);
    }

    // Handle touch swipe (for hybrid devices)
    let touchStartY = 0;
    let touchEndY = 0;

    function handleTouchStart(e) {
        if (isMobile) return;
        touchStartY = e.changedTouches[0].screenY;
    }

    function handleTouchEnd(e) {
        if (isMobile) return;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }

    function handleSwipe() {
        const diff = touchStartY - touchEndY;
        const threshold = 50;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }

    // Handle scroll on mobile
    let scrollTimeout;
    function handleScroll() {
        if (!isMobile) return;

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            // Find which slide is most visible
            let maxVisible = 0;
            let visibleSlide = 0;

            slides.forEach((slide, index) => {
                const rect = slide.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
                const visiblePercent = visibleHeight / viewportHeight;

                if (visiblePercent > maxVisible) {
                    maxVisible = visiblePercent;
                    visibleSlide = index;
                }
            });

            if (visibleSlide !== currentSlide) {
                currentSlide = visibleSlide;
                updateUI();
            }
        }, 100);
    }

    // Check if mobile
    function checkMobile() {
        const wasMobile = isMobile;
        isMobile = window.innerWidth <= 768;

        if (wasMobile !== isMobile) {
            if (!isMobile) {
                // Switched to desktop
                document.body.style.overflow = 'hidden';
                updateUI();
            } else {
                // Switched to mobile
                document.body.style.overflow = '';
                slides.forEach(slide => slide.classList.add('active'));
            }
        }
    }

    // Bind events
    function bindEvents() {
        // Keyboard
        document.addEventListener('keydown', handleKeydown);

        // Mouse wheel (desktop)
        document.addEventListener('wheel', handleWheel, { passive: true });

        // Touch (for hybrid devices on desktop mode)
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });

        // Scroll (mobile)
        window.addEventListener('scroll', handleScroll, { passive: true });

        // Resize
        window.addEventListener('resize', checkMobile);

        // Navigation buttons
        prevBtn.addEventListener('click', () => {
            prevSlide();
            prevBtn.blur();
        });
        nextBtn.addEventListener('click', () => {
            nextSlide();
            nextBtn.blur();
        });
    }

    // Start
    init();
})();
