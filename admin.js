document.addEventListener('DOMContentLoaded', () => {
    const addChannelForm = document.getElementById('addChannelForm');
    const channelNameInput = document.getElementById('channelName');
    const channelUrlInput = document.getElementById('channelUrl');
    const existingChannelsList = document.getElementById('existingChannelsList');

    const API_BASE_URL = 'https://iptv.valeravibrator.space/api'; // Обновленный URL для Flask API на HTTPS

    let channels = [];

    // Function to load channels from the backend API
    async function loadChannels() {
        try {
            const response = await fetch(`${API_BASE_URL}/channels`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            channels = await response.json();
            renderChannels();
        } catch (error) {
            console.error('Error loading channels:', error);
            alert('Не удалось загрузить каналы. Убедитесь, что сервер запущен.');
        }
    }

    // Function to render channels in the list
    function renderChannels() {
        existingChannelsList.innerHTML = '';
        channels.forEach((channel) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div class="channel-info">
                    <span class="channel-name-display">${channel.name}</span>
                    <span class="channel-url-display">${channel.url}</span>
                </div>
                <button class="delete-btn" data-id="${channel.id}">Удалить</button>
            `;
            existingChannelsList.appendChild(listItem);
        });
    }

    // Add channel handler
    addChannelForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = channelNameInput.value.trim();
        const url = channelUrlInput.value.trim();

        if (name && url) {
            try {
                const response = await fetch(`${API_BASE_URL}/channels`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, url }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const newChannel = await response.json();
                channels.push(newChannel);
                renderChannels();
                channelNameInput.value = '';
                channelUrlInput.value = '';
                localStorage.setItem('channelsUpdatedTimestamp', Date.now()); // Signal update
            } catch (error) {
                console.error('Error adding channel:', error);
                alert('Не удалось добавить канал.');
            }
        }
    });

    // Delete channel handler (event delegation)
    existingChannelsList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('delete-btn')) {
            const channelId = event.target.dataset.id;
            if (channelId) {
                try {
                    const response = await fetch(`${API_BASE_URL}/channels/${channelId}`, {
                        method: 'DELETE',
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    channels = channels.filter(channel => channel.id !== channelId);
                    renderChannels();
                    localStorage.setItem('channelsUpdatedTimestamp', Date.now()); // Signal update
                } catch (error) {
                    console.error('Error deleting channel:', error);
                    alert('Не удалось удалить канал.');
                }
            }
        }
    });

    // Initial load
    loadChannels();
});
