document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('videoPlayer');
    const channelList = document.getElementById('channelList');
    const loadingScreen = document.getElementById('loadingScreen');
    const channelListPanel = document.getElementById('channelListPanel');
    const osd = document.getElementById('osd');
    const channelListIndicator = document.getElementById('channelListIndicator');
    const channelErrorOverlay = document.getElementById('channelErrorOverlay');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const channelCheckLogDisplay = document.getElementById('channelCheckLogDisplay'); // Новый элемент для логов

    const PROXY_SERVER_URL = '/proxy/'; // Обновленный URL для Flask Proxy
    const API_BASE_URL = 'https://iptv.valeravibrator.space/api'; // Обновленный URL для Flask API на HTTPS

    let hls;
    let currentNumberInput = '';
    let numberInputTimeout;
    let osdTimeout;
    let arrowNavigationTimeout;
    let availableChannels = [];
    let activeChannelIndex = 0;
    let isFullscreen = false;
    let isInitialLoad = true; // Флаг для первой загрузки
    let channelsToCheckCount = 0; // Счетчик для проверки доступности каналов

    video.addEventListener('pause', () => {
        console.warn('Video paused unexpectedly. Current time:', video.currentTime, 'readyState:', video.readyState);
    });

    // Restore fullscreen button event listener
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
        channelErrorOverlay.classList.remove('hidden');
        hideLoadingScreen();
    }

    function hideChannelError() {
        channelErrorOverlay.classList.add('hidden');
    }

    // Функция для логирования проверок каналов на загрузочном экране
    function logChannelCheck(message, isError = false) {
        if (channelCheckLogDisplay && isInitialLoad) { // Логируем только при первой загрузке
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            if (isError) {
                logEntry.style.color = '#ff6b6b'; // Красный цвет для ошибок
            } else {
                logEntry.style.color = '#a0a0a0'; // Серый цвет для обычных сообщений
            }
            channelCheckLogDisplay.appendChild(logEntry);
            channelCheckLogDisplay.scrollTop = channelCheckLogDisplay.scrollHeight; // Прокрутка вниз
        }
    }

    function loadChannel(url, userAgent = null) {
        console.log('loadChannel called for URL:', url, 'with User-Agent:', userAgent);
        showLoadingScreen();
        hideChannelError();
        if (hls) {
            hls.destroy();
        }

        // Если URL канала уже содержит PROXY_SERVER_URL, не добавляем его снова.
        // Иначе, добавляем прокси перед URL канала.
        const proxiedUrl = url.startsWith(PROXY_SERVER_URL) ? url : `${PROXY_SERVER_URL}${url}`;

        if (Hls.isSupported()) {
            hls = new Hls();
            // Add custom header for User-Agent if provided
            if (userAgent) {
                hls.config.pLoader = Hls.DefaultConfig.loader;
                hls.config.xhrSetup = function (xhr, url) {
                    if (url.startsWith(PROXY_SERVER_URL)) {
                        xhr.setRequestHeader('X-Proxy-User-Agent', userAgent);
                    }
                };
            }
            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('Hls.Events.MANIFEST_PARSED fired.');
                video.muted = false;
                const playPromise = video.play();

                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('Autoplay prevented with sound. Trying muted play...', error);
                        video.muted = true;
                        video.play().catch(mutedError => {
                            console.error('Muted autoplay also prevented.', mutedError);
                            hideLoadingScreen();
                            showChannelError();
                        });
                    });
                }
                hideLoadingScreen();
                hideChannelError();
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
                console.error('HLS.js error details:', event, data);
                if (data.fatal) {
                    console.error(`HLS.js fatal error type: ${data.type}, details:`, data);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("Fatal network error, trying to recover...");
                            hls.recoverMediaError();
                            hideLoadingScreen();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("Fatal media error, trying to recover...");
                            hls.recoverMediaError();
                            hideLoadingScreen();
                            break;
                        case Hls.ErrorTypes.OTHER_ERROR:
                            console.error("Fatal other error, cannot recover.");
                            hls.destroy();
                            hideLoadingScreen();
                            showChannelError();
                            break;
                        default:
                            console.error("Unknown fatal HLS.js error, destroying HLS instance.");
                            hls.destroy();
                            hideLoadingScreen();
                            showChannelError();
                            break;
                    }
                } else {
                    console.warn(`HLS.js non-fatal error type: ${data.type}, details:`, data);
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
                    showChannelError(); // Показываем ошибку для нативного плеера
                }
            }, 5000);

            video.addEventListener('loadedmetadata', function() {
                console.log('Native video loadedmetadata fired.');
                video.muted = false;
                const playPromise = video.play();

                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('Autoplay prevented with sound. Trying muted play...', error);
                        video.muted = true;
                        video.play().catch(mutedError => {
                            console.error('Muted autoplay also prevented.', mutedError);
                            hideLoadingScreen();
                            showChannelError();
                        });
                    });
                }
                hideLoadingScreen();
                hideChannelError(); // Скрываем ошибку при успешной загрузке
                clearTimeout(loadTimeout);
            }, { once: true });
            video.addEventListener('error', (event) => {
                console.error('Native video error: failed to load HLS stream.', event);
                hideLoadingScreen();
                showChannelError();
                clearTimeout(loadTimeout);
            }, { once: true });
            video.addEventListener('stalled', () => {
                console.warn('Native video stalled.');
                if (video.paused || video.currentTime === 0) {
                    hideLoadingScreen();
                    showChannelError();
                    clearTimeout(loadTimeout);
                }
            });
            video.addEventListener('waiting', () => {
            });
            video.addEventListener('playing', () => {
                console.log('Native video playing fired.');
                // No need to handle play promise here, as it's already playing.
                hideLoadingScreen();
                hideChannelError(); // Скрываем ошибку при начале воспроизведения
                clearTimeout(loadTimeout);
            });
        } else {
            // Fallback for browsers that don't support HLS.js
            console.error('HLS.js is not supported in this browser, and native HLS playback also failed.');
            hideLoadingScreen();
            showChannelError();
        }
    }

    function nextChannel() {
        console.log('nextChannel called.');
        let newIndex = activeChannelIndex + 1;
        if (newIndex >= availableChannels.length) {
            newIndex = 0;
        }
        setActiveChannel(newIndex);
        showOsd(`${newIndex + 1}. ${availableChannels[newIndex].name}`);
    }

    function previousChannel() {
        console.log('previousChannel called.');
        let newIndex = activeChannelIndex - 1;
        if (newIndex < 0) {
            newIndex = availableChannels.length - 1;
        }
        setActiveChannel(newIndex);
        showOsd(`${newIndex + 1}. ${availableChannels[newIndex].name}`);
    }

    async function loadM3uPlaylist(channelIdToRestore = null) {
        console.log('loadM3uPlaylist called. Restoring channel ID:', channelIdToRestore);
        showLoadingScreen();
        hideChannelError(); // Скрываем предыдущие ошибки перед загрузкой плейлиста
        
        // При новой загрузке плейлиста сбрасываем флаг и показываем контейнер логов
        isInitialLoad = true;
        if (channelCheckLogDisplay) {
            channelCheckLogDisplay.innerHTML = ''; // Очистка логов при новой загрузке плейлиста
            channelCheckLogDisplay.classList.remove('hidden'); // Показываем контейнер логов
        }
        logChannelCheck('Загрузка списка каналов с бэкенда...');

        try {
            const response = await fetch(`${API_BASE_URL}/channels`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const newChannels = await response.json();
            console.log('Каналы загружены с бэкенда.', newChannels);

            if (newChannels.length === 0) {
                console.warn('Список каналов пуст. Пожалуйста, добавьте каналы через админ-панель.');
                availableChannels = [];
                renderChannels([]);
                hideLoadingScreen();
                showChannelError();
                logChannelCheck('Список каналов пуст. Добавьте каналы через админ-панель.', true);
                isInitialLoad = false; // Первая загрузка завершена
                if (channelCheckLogDisplay) {
                    channelCheckLogDisplay.innerHTML = '';
                    channelCheckLogDisplay.classList.add('hidden'); // Скрываем контейнер логов и здесь
                }
                return;
            }

            availableChannels = newChannels; // Update the global availableChannels
            renderChannels(availableChannels);

            let targetIndex = 0;
            let shouldReloadStream = true;

            if (channelIdToRestore) {
                const oldActiveChannel = availableChannels[activeChannelIndex];
                targetIndex = availableChannels.findIndex(c => c.id === channelIdToRestore);
                
                if (targetIndex !== -1) {
                    // If the restored channel is found and its URL is the same, no need to force reload
                    if (oldActiveChannel && oldActiveChannel.id === channelIdToRestore && oldActiveChannel.url === availableChannels[targetIndex].url) {
                        shouldReloadStream = false;
                        console.log('Restoring existing channel without stream reload.');
                    }
                    console.log('Restoring previously active channel at index:', targetIndex);
                } else {
                    console.log('Previously active channel not found after update. Switching to first channel.');
                    targetIndex = 0; // Fallback to first channel if old one is deleted
                }
            } else if (availableChannels.length > 0) {
                targetIndex = 0; // Default to first channel if no specific channel to restore
            }

            if (availableChannels.length > 0) {
                setActiveChannel(targetIndex, shouldReloadStream);
                logChannelCheck('Начало проверки доступности всех каналов...');
                
                // Инициализируем счетчик каналов для проверки (все, кроме активного)
                channelsToCheckCount = availableChannels.length - 1;
                if (channelsToCheckCount <= 0) {
                    // Если только один канал или нет других для проверки, скрываем загрузочный экран сразу
                    setTimeout(() => {
                        hideLoadingScreen();
                        isInitialLoad = false;
                        if (channelCheckLogDisplay) {
                            channelCheckLogDisplay.innerHTML = ''; // Очищаем логи
                            channelCheckLogDisplay.classList.add('hidden'); // Скрываем контейнер логов
                        }
                    }, 1000); // Небольшая задержка, чтобы пользователь увидел сообщение
                } else {
                    checkAllChannelsAvailability();
                }
            } else {
                hideLoadingScreen();
                showChannelError(); // Если каналов нет вообще, это ошибка.
                logChannelCheck('Список каналов пуст. Добавьте каналы через админ-панель.', true);
                isInitialLoad = false; // Первая загрузка завершена
                if (channelCheckLogDisplay) {
                    channelCheckLogDisplay.innerHTML = '';
                    channelCheckLogDisplay.classList.add('hidden'); // Скрываем контейнер логов и здесь
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки каналов с бэкенда:', error);
            hideLoadingScreen();
            showChannelError(); // Если ошибка при загрузке плейлиста, это ошибка
            logChannelCheck(`Критическая ошибка загрузки плейлиста: ${error.message}`, true);
            isInitialLoad = false; // Первая загрузка завершена
            if (channelCheckLogDisplay) {
                channelCheckLogDisplay.innerHTML = '';
                channelCheckLogDisplay.classList.add('hidden'); // Скрываем контейнер логов и здесь
            }
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

    function setActiveChannel(index, forceReload = true) {
        console.log('setActiveChannel called for index:', index, 'forceReload:', forceReload);
        showLoadingScreen();
        hideChannelError(); // Скрываем предыдущие ошибки при переключении канала
        if (index < 0 || index >= availableChannels.length) {
            console.warn('Неверный номер канала:', index + 1);
            hideLoadingScreen();
            return;
        }

        if (activeChannelIndex === index && !forceReload) {
            console.log('Already on active channel and no force reload. Skipping.');
            hideLoadingScreen();
            return; // Already playing the same channel, no need to reload
        }

        activeChannelIndex = index;

        const currentActive = document.querySelector('.channel-list li.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        const newActive = channelList.children[index];
        if (newActive) {
            newActive.classList.add('active');
            logChannelCheck(`Загрузка канала: ${availableChannels[index].name} (${index + 1})`);
            loadChannel(newActive.dataset.url, availableChannels[index].user_agent);
            newActive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    async function checkChannelAvailability(channelUrl, index) {
        const statusIndicator = document.getElementById(`status-${index}`);
        if (!statusIndicator) return;

        statusIndicator.classList.remove('online', 'offline');
        statusIndicator.classList.add('checking');

        logChannelCheck(`Проверка доступности канала ${availableChannels[index].name} (${index + 1})...`);

        // Если URL канала уже содержит PROXY_SERVER_URL, не добавляем его снова.
        // Иначе, добавляем прокси перед URL канала.
        const proxiedChannelUrl = channelUrl.startsWith(PROXY_SERVER_URL) ? channelUrl : `${PROXY_SERVER_URL}${channelUrl}`;

        try {
            const fetchOptions = {};
            const channel = availableChannels[index];
            if (channel && channel.user_agent) {
                fetchOptions.headers = {
                    'X-Proxy-User-Agent': channel.user_agent
                };
            }
            const response = await fetch(proxiedChannelUrl, fetchOptions);
            if (response.type === 'opaque' || response.ok) {
                statusIndicator.classList.remove('checking');
                statusIndicator.classList.add('online');
                logChannelCheck(`Канал ${availableChannels[index].name} (${index + 1}) доступен.`);
            } else if (response.status === 502) {
                // Handle detailed proxy errors
                const errorData = await response.json();
                statusIndicator.classList.remove('checking');
                statusIndicator.classList.add('offline');
                const errorMessage = `Ошибка прокси при проверке канала ${availableChannels[index].name} (${index + 1}): ${errorData.message} (Цель: ${errorData.target})`;
                console.error(errorMessage);
                logChannelCheck(errorMessage, true);
            } else {
                statusIndicator.classList.remove('checking');
                statusIndicator.classList.add('offline');
                const errorMessage = `Канал ${availableChannels[index].name} (${index + 1}) недоступен. Статус: ${response.status}.`;
                console.warn(errorMessage);
                logChannelCheck(errorMessage, true);
            }
        } catch (error) {
            statusIndicator.classList.remove('checking');
            statusIndicator.classList.add('offline');
            const errorMessage = `Ошибка при проверке канала ${availableChannels[index].name} (${index + 1}): ${error.message}`;
            console.error(errorMessage);
            logChannelCheck(errorMessage, true);
        } finally {
            // Уменьшаем счетчик после завершения проверки (успех или ошибка)
            if (index !== activeChannelIndex) { // Учитываем только те каналы, которые активно проверяются
                channelsToCheckCount--;
            }

            // Если все проверки завершены и это первая загрузка, скрываем экран загрузки
            if (channelsToCheckCount <= 0 && isInitialLoad) {
                setTimeout(() => {
                    hideLoadingScreen();
                    isInitialLoad = false; // Сбрасываем флаг
                    if (channelCheckLogDisplay) {
                        channelCheckLogDisplay.innerHTML = ''; // Очищаем логи
                        channelCheckLogDisplay.classList.add('hidden'); // Скрываем контейнер логов
                    }
                }, 1000); // Небольшая задержка, чтобы пользователь мог увидеть финальные логи
            }
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

    document.addEventListener('keydown', (event) => {
        const key = event.key;

        if (key === 'PageUp') {
            event.preventDefault();
            nextChannel();
        } else if (key === 'PageDown') {
            event.preventDefault();
            previousChannel();
        }

        if (isFullscreen) {
            if (key === 'ArrowLeft') {
                event.preventDefault();
                if (channelListPanel.classList.contains('fullscreen-visible')) {
                    toggleChannelListVisibility(false);
                } else {
                    toggleChannelListVisibility(true);
                }
            } else if (key === 'ArrowRight') {
                event.preventDefault();
                if (channelListPanel.classList.contains('fullscreen-visible')) {
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
            } else if (key === 'ArrowUp' && !channelListPanel.classList.contains('fullscreen-visible')) {
                event.preventDefault();
                previousChannel();
            } else if (key === 'ArrowDown' && !channelListPanel.classList.contains('fullscreen-visible')) {
                event.preventDefault();
                nextChannel();
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
                }, 2000);
            }
        } else {
            if (key === 'ArrowLeft') {
                event.preventDefault();
                if (channelListPanel.classList.contains('visible')) {
                    toggleChannelListVisibility(false);
                } else {
                    toggleChannelListVisibility(true);
                }
            } else if (key === 'ArrowRight') {
                event.preventDefault();
                if (channelListPanel.classList.contains('visible')) {
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
                }, 2000);
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
                } else {
                    event.preventDefault();
                    previousChannel();
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
                } else {
                    event.preventDefault();
                    nextChannel();
                }
            }
        }
    });

    loadM3uPlaylist();

    // Remove automatic fullscreen request
    // document.getElementById('mainContainer').requestFullscreen().catch(err => {
    //     console.error("Ошибка при попытке автоматического перехода в полноэкранный режим:", err);
    // });

    // Ensure video is muted for autoplay to work initially
    video.muted = true;
    // You might want to provide a UI element to unmute the video

    // Listen for changes in localStorage from admin page
    window.addEventListener('storage', (event) => {
        if (event.key === 'channelsUpdatedTimestamp') {
            console.log('Channels updated in admin page. Reloading channels...');
            const currentPlayingChannelId = availableChannels.length > 0 && activeChannelIndex !== -1
                ? availableChannels[activeChannelIndex].id
                : null;
            
            loadM3uPlaylist(currentPlayingChannelId);
        }
    });
});
