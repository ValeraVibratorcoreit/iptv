document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('videoPlayer');
    const channelList = document.getElementById('channelList');
    const loadingScreen = document.getElementById('loadingScreen');
    const channelListPanel = document.getElementById('channelListPanel');
    const osd = document.getElementById('osd');
    const channelListIndicator = document.getElementById('channelListIndicator');
    const channelErrorOverlay = document.getElementById('channelErrorOverlay');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    const m3uUrl = 'https://gist.githubusercontent.com/ValeraVibratorcoreit/8902663be76cee4ff12bb4ae60d52439/raw/02f41983b169ed5ebe823407a4aaf7a51f9f253d/gistfile1.txt';

    let hls;
    let currentNumberInput = '';
    let numberInputTimeout;
    let osdTimeout;
    let arrowNavigationTimeout;
    let availableChannels = [];
    let activeChannelIndex = 0;
    let isFullscreen = false;

    video.addEventListener('pause', () => {
        console.warn('Video paused unexpectedly. Current time:', video.currentTime, 'readyState:', video.readyState);
    });

    function hideLoadingScreen() {
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 3000); // Задержка 3 секунды
    }

    function showLoadingScreen() {
        loadingScreen.classList.remove('hidden');
        channelErrorOverlay.classList.add('hidden');
    }

    function showOsd(text) {
        osd.textContent = text;
        osd.classList.add('visible');
        clearTimeout(osdTimeout);
        osdTimeout = setTimeout(() => {
            osd.classList.remove('visible');
        }, 1500);
    }

    function showChannelError() {
        console.log('Showing channel error overlay.');
        channelErrorOverlay.classList.remove('hidden');
        hideLoadingScreen();
    }

    function hideChannelError() {
        console.log('Hiding channel error overlay.');
        channelErrorOverlay.classList.add('hidden');
    }

    function loadChannel(url) {
        console.log('loadChannel called for URL:', url);
        showLoadingScreen();
        console.log('Calling hideChannelError from loadChannel (start).');
        hideChannelError();
        if (hls) {
            hls.destroy();
        }

        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('Hls.Events.MANIFEST_PARSED fired.');
                video.muted = false;
                video.play();
                hideLoadingScreen();
                console.log('Calling hideChannelError from MANIFEST_PARSED.');
                hideChannelError();
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
                console.error('HLS.js error:', event, data);
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("fatal network error, try to recover");
                            hls.recoverMediaError();
                            console.log('Calling showChannelError (NETWORK_ERROR).');
                            showChannelError();
                            hideLoadingScreen();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("fatal media error, try to recover");
                            hls.recoverMediaError();
                            console.log('Calling showChannelError (MEDIA_ERROR).');
                            showChannelError();
                            hideLoadingScreen();
                            break;
                        case Hls.ErrorTypes.OTHER_ERROR:
                            console.error("fatal other error, cannot recover");
                            hls.destroy();
                            hideLoadingScreen();
                            console.log('Calling showChannelError (OTHER_ERROR).');
                            showChannelError();
                            break;
                        default:
                            hls.destroy();
                            hideLoadingScreen();
                            console.log('Calling showChannelError (HLS default error).');
                            showChannelError();
                            break;
                    }
                } else {
                    console.log('Calling showChannelError (HLS non-fatal error).');
                    showChannelError();
                }
            });
            hls.on(Hls.Events.BUFFER_APPENDING, function() {
                console.log('Hls.Events.BUFFER_APPENDING fired.');
                hideLoadingScreen();
            });
            hls.on(Hls.Events.BUFFER_FLUSHED, function() {
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            let loadTimeout = setTimeout(() => {
                if (video.paused || video.currentTime === 0) {
                    console.warn('Video load timeout: Hiding loading screen.');
                    hideLoadingScreen();
                    console.log('Calling showChannelError from loadTimeout.');
                    showChannelError();
                }
            }, 5000);

            video.addEventListener('loadedmetadata', function() {
                console.log('Native video loadedmetadata fired.');
                video.muted = false;
                video.play();
                hideLoadingScreen();
                console.log('Calling hideChannelError from loadedmetadata.');
                hideChannelError();
                clearTimeout(loadTimeout);
            }, { once: true });
            video.addEventListener('error', () => {
                console.error('Native video error: failed to load HLS stream.');
                hideLoadingScreen();
                console.log('Calling showChannelError from native video error.');
                showChannelError();
                clearTimeout(loadTimeout);
            }, { once: true });
            video.addEventListener('stalled', () => {
                console.warn('Native video stalled.');
                if (video.paused || video.currentTime === 0) {
                    hideLoadingScreen();
                    console.log('Calling showChannelError from stalled.');
                    showChannelError();
                    clearTimeout(loadTimeout);
                }
            });
            video.addEventListener('waiting', () => {
            });
            video.addEventListener('playing', () => {
                console.log('Native video playing fired.');
                hideLoadingScreen();
                console.log('Calling hideChannelError from playing.');
                hideChannelError();
                clearTimeout(loadTimeout);
            });
        }
    }

    async function loadM3uPlaylist() {
        console.log('loadM3uPlaylist called.');
        showLoadingScreen();
        console.log('Calling hideChannelError from loadM3uPlaylist (start).');
        hideChannelError();
        try {
            const response = await fetch(m3uUrl);
            const m3uContent = await response.text();
            availableChannels = parseM3u(m3uContent);

            if (availableChannels.length === 0) {
                // Если parseM3u вернул пустой список, это может быть прямой HLS-поток.
                // Добавляем его как один канал для воспроизведения.
                console.warn('Плейлист пуст или имеет некорректный формат. Попытка загрузить как один канал.');
                availableChannels.push({ name: "Победа", url: m3uUrl });
            }

            renderChannels(availableChannels);
            if (availableChannels.length > 0) {
                setActiveChannel(0);
                checkAllChannelsAvailability();

            } else {
                hideLoadingScreen();
                console.log('Calling showChannelError from loadM3uPlaylist (no channels).');
                showChannelError();
            }
        } catch (error) {
            console.error('Ошибка загрузки или парсинга M3U плейлиста:', error);
            hideLoadingScreen();
            console.log('Calling showChannelError from loadM3uPlaylist (catch).');
            showChannelError();
        }
    }

    function parseM3u(m3uContent) {
        const lines = m3uContent.split('\n');
        const channels = [];
        let currentChannel = {};

        for (const line of lines) {
            if (line.startsWith('#EXTINF')) {
                const nameMatch = line.match(/,(.*)$/);
                if (nameMatch && nameMatch[1]) {
                    currentChannel.name = nameMatch[1].trim();
                }
            } else if (line.startsWith('http') && currentChannel.name) {
                currentChannel.url = line.trim();
                channels.push(currentChannel);
                currentChannel = {};
            }
        }
        return channels;
    }

    function highlightChannel(index) {
        if (index < 0 || index >= availableChannels.length) {
            console.warn('Неверный номер канала для выделения:', index + 1);
            return;
        }

        activeChannelIndex = index;

        const currentActive = document.querySelector('.channel-list li.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        const newActive = channelList.children[index];
        if (newActive) {
            newActive.classList.add('active');
            newActive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function renderChannels(channelsToRender) {
        channelList.innerHTML = '';
        channelsToRender.forEach((channel, index) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<span class="channel-number">${index + 1}.</span> <span class="channel-name">${channel.name}</span> <span class="channel-status-indicator checking" id="status-${index}"></span>`;
            listItem.dataset.url = channel.url;
            listItem.dataset.channelIndex = index;
            listItem.addEventListener('click', () => {
                setActiveChannel(index);
            });
            channelList.appendChild(listItem);
        });
    }

    function setActiveChannel(index) {
        console.log('setActiveChannel called for index:', index);
        showLoadingScreen();
        console.log('Calling hideChannelError from setActiveChannel (start).');
        hideChannelError();
        if (index < 0 || index >= availableChannels.length) {
            console.warn('Неверный номер канала:', index + 1);
            hideLoadingScreen();
            console.log('Calling showChannelError from setActiveChannel (invalid index).');
            showChannelError();
            return;
        }

        activeChannelIndex = index;

        const currentActive = document.querySelector('.channel-list li.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        const newActive = channelList.children[index];
        if (newActive) {
            newActive.classList.add('active');
            loadChannel(newActive.dataset.url);
            newActive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    async function checkChannelAvailability(channelUrl, index) {
        const statusIndicator = document.getElementById(`status-${index}`);
        if (!statusIndicator) return;

        statusIndicator.classList.remove('online', 'offline');
        statusIndicator.classList.add('checking');

        try {
            const response = await fetch(channelUrl, { method: 'GET', mode: 'no-cors' });
            if (response.type === 'opaque' || response.ok) {
                statusIndicator.classList.remove('checking');
                statusIndicator.classList.add('online');
            } else {
                statusIndicator.classList.remove('checking');
                statusIndicator.classList.add('offline');
                console.warn(`Канал ${index + 1} (${channelUrl}) недоступен. Статус: ${response.status} (или opaque response)`);
            }
        } catch (error) {
            statusIndicator.classList.remove('checking');
            statusIndicator.classList.add('offline');
            console.error(`Ошибка при проверке канала ${index + 1} (${channelUrl}):`, error);
        }
    }

    function checkAllChannelsAvailability() {
        availableChannels.forEach((channel, index) => {
            if (index !== activeChannelIndex) {
                checkChannelAvailability(channel.url, index);
            }
        });
    }

    function toggleChannelListVisibility(isVisible) {
        if (isFullscreen) {
            if (isVisible === undefined) {
                channelListPanel.classList.toggle('fullscreen-visible');
            } else if (isVisible) {
                channelListPanel.classList.add('fullscreen-visible');
            } else {
                channelListPanel.classList.remove('fullscreen-visible');
            }
            if (channelListPanel.classList.contains('fullscreen-visible')) {
                channelListIndicator.style.display = 'none';
            } else {
                channelListIndicator.style.display = 'block';
            }
        } else {
            if (isVisible === undefined) {
                channelListPanel.classList.toggle('visible');
            } else if (isVisible) {
                channelListPanel.classList.add('visible');
            } else {
                channelListPanel.classList.remove('visible');
            }
            channelListIndicator.style.display = 'none';
        }
    }

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.getElementById('mainContainer').requestFullscreen().catch(err => {
                console.error("Ошибка при попытке перехода в полноэкранный режим:", err);
            });
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        isFullscreen = !!document.fullscreenElement;
        if (isFullscreen) {
            toggleChannelListVisibility(false);
        } else {
            if (window.innerWidth > 768) {
                toggleChannelListVisibility(false);
            }
            channelListIndicator.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (event) => {
        const key = event.key;

        if (isFullscreen) {
            if (key === 'ArrowLeft') {
                event.preventDefault();
                toggleChannelListVisibility(true);
            } else if (key === 'ArrowRight') {
                if (channelListPanel.classList.contains('fullscreen-visible')) {
                    event.preventDefault();
                    toggleChannelListVisibility(false);
                }
            } else if (key === 'Escape') {
                if (channelListPanel.classList.contains('fullscreen-visible')) {
                    event.preventDefault();
                    toggleChannelListVisibility(false);
                } else {
                    document.exitFullscreen();
                }
            } else if (key === 'Enter' && channelListPanel.classList.contains('fullscreen-visible')) {
                event.preventDefault();
                setActiveChannel(activeChannelIndex);
                toggleChannelListVisibility(false);
            } else if (key === 'ArrowUp' && channelListPanel.classList.contains('fullscreen-visible')) {
                event.preventDefault();
                let newIndex = activeChannelIndex - 1;
                if (newIndex < 0) newIndex = availableChannels.length - 1;
                highlightChannel(newIndex);
            } else if (key === 'ArrowDown' && channelListPanel.classList.contains('fullscreen-visible')) {
                event.preventDefault();
                let newIndex = activeChannelIndex + 1;
                if (newIndex >= availableChannels.length) newIndex = 0;
                highlightChannel(newIndex);
            } else if (key >= '0' && key <= '9') {
                currentNumberInput += key;
                showOsd(currentNumberInput);
                clearTimeout(numberInputTimeout);
                numberInputTimeout = setTimeout(() => {
                    const channelNumber = parseInt(currentNumberInput, 10);
                    if (!isNaN(channelNumber) && channelNumber > 0 && channelNumber <= availableChannels.length) {
                        setActiveChannel(channelNumber - 1);
                        toggleChannelListVisibility(false);
                    } else {
                        console.warn('Некорректный номер канала:', currentNumberInput);
                        showOsd('Некорректный номер');
                    }
                    currentNumberInput = '';
                }, 800);
            }
        } else {
            if (key === 'ArrowLeft') {
                event.preventDefault();
                toggleChannelListVisibility(true);
            } else if (key === 'ArrowRight') {
                if (channelListPanel.classList.contains('visible')) {
                    event.preventDefault();
                    toggleChannelListVisibility(false);
                }
            } else if (key === 'Escape') {
                event.preventDefault();
                toggleChannelListVisibility(false);
            } else if (key >= '0' && key <= '9') {
                currentNumberInput += key;
                showOsd(currentNumberInput);
                clearTimeout(numberInputTimeout);
                numberInputTimeout = setTimeout(() => {
                    const channelNumber = parseInt(currentNumberInput, 10);
                    if (!isNaN(channelNumber) && channelNumber > 0 && channelNumber <= availableChannels.length) {
                        setActiveChannel(channelNumber - 1);
                        toggleChannelListVisibility(false);
                    } else {
                        console.warn('Некорректный номер канала:', currentNumberInput);
                        showOsd('Некорректный номер');
                    }
                    currentNumberInput = '';
                }, 800);
            } else if (key === 'Enter') {
                if (channelListPanel.classList.contains('visible')) {
                    setActiveChannel(activeChannelIndex);
                    toggleChannelListVisibility(false);
                }
            } else if (key === 'ArrowUp') {
                if (channelListPanel.classList.contains('visible')) {
                    event.preventDefault();
                    clearTimeout(arrowNavigationTimeout);
                    arrowNavigationTimeout = setTimeout(() => {
                        let newIndex = activeChannelIndex - 1;
                        if (newIndex < 0) {
                            newIndex = availableChannels.length - 1;
                        }
                        highlightChannel(newIndex);
                    }, 200);
                }
            } else if (key === 'ArrowDown') {
                if (channelListPanel.classList.contains('visible')) {
                    event.preventDefault();
                    clearTimeout(arrowNavigationTimeout);
                    arrowNavigationTimeout = setTimeout(() => {
                        let newIndex = activeChannelIndex + 1;
                        if (newIndex >= availableChannels.length) {
                            newIndex = 0;
                        }
                        highlightChannel(newIndex);
                    }, 200);
                }
            }
        }
    });

    loadM3uPlaylist();
});
