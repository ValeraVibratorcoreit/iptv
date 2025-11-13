from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import json
import os
import requests
from uuid import uuid4
import re

app = Flask(__name__, static_folder='.', static_url_path='/')
CORS(app) # Enable CORS for all routes

CHANNELS_FILE = 'channels.json'
FALLBACK_M3U_URL = 'https://gist.githubusercontent.com/ValeraVibratorcoreit/b5f0ffdd7372830503215c0f365ab682/raw/92d2f2cd1c6899eb391dcc806d680c3382498809/gistfile1.txt'
PROXY_SERVER_URL = 'https://valeravibrator.space/proxy/'

def load_channels():
    if os.path.exists(CHANNELS_FILE):
        with open(CHANNELS_FILE, 'r', encoding='utf-8') as f:
            try:
                channels = json.load(f)
                if not channels:
                    print("channels.json is empty. Initializing from fallback M3U.")
                    return initialize_channels_from_m3u()
                return channels
            except json.JSONDecodeError:
                print("Error decoding channels.json. Initializing from fallback M3U.")
                return initialize_channels_from_m3u()
    else:
        print("channels.json not found. Initializing from fallback M3U.")
        return initialize_channels_from_m3u()

def save_channels(channels):
    with open(CHANNELS_FILE, 'w', encoding='utf-8') as f:
        json.dump(channels, f, ensure_ascii=False, indent=4)

def parse_m3u(m3u_content):
    lines = m3u_content.split('\n')
    channels = []
    current_channel = None # Use None to indicate no channel is being processed
    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith('#EXTINF'):
            # If a channel was being processed, save it before starting a new one
            if current_channel and 'name' in current_channel and 'url' in current_channel:
                channels.append(current_channel)
            
            name_match = re.search(r',([^",]+)$|"(.+)"', line) # Prioritize non-quoted name after comma, then quoted name
            channel_name = name_match.group(1).strip() if name_match.group(1) else (name_match.group(2).strip() if name_match.group(2) else 'Unknown Channel')
            if 'tvg-name=' in channel_name:
                channel_name = re.sub(r'.*tvg-name="([^"]+)".*', r'\1', channel_name).strip()
            elif 'tvg-id=' in channel_name:
                channel_name = re.sub(r'.*tvg-id="([^"]+)".*', r'\1', channel_name).strip()
            current_channel = {'id': str(uuid4()), 'name': channel_name}
            
            # Check for inline user-agent in EXTINF
            ua_match_extinf = re.search(r'user-agent="([^"]+)"', line, re.IGNORECASE)
            if ua_match_extinf:
                # Add user_agent only if channel name contains "(Екатеринбург)"
                if "(Екатеринбург)" in channel_name:
                    current_channel['user_agent'] = ua_match_extinf.group(1).strip()

        elif current_channel and line.startswith('http'):
            url = line.strip()
            if url and url != 'http://no.url.provided':
                current_channel['url'] = url
                # No longer appending here, wait for EXTVLCOPT or next EXTINF

        elif current_channel and line.startswith('#EXTVLCOPT:http-user-agent='):
            ua_match_vlcopt = re.search(r'#EXTVLCOPT:http-user-agent=("[^"]+"|[^ ]+)', line, re.IGNORECASE)

            if ua_match_vlcopt:
                # Add user_agent only if channel name contains "(Екатеринбург)"
                if "(Екатеринбург)" in current_channel['name']:
                    current_channel['user_agent'] = ua_match_vlcopt.group(1).strip()
            
            # If we found a URL and now a User-Agent, this channel is complete
            if 'url' in current_channel and 'name' in current_channel:
                channels.append(current_channel)
                current_channel = None # Reset for next channel

    # Add the last channel if it was being processed
    if current_channel and 'name' in current_channel and 'url' in current_channel:
        channels.append(current_channel)
        
    return channels

def initialize_channels_from_m3u():
    try:
        response = requests.get(FALLBACK_M3U_URL, verify=False)
        response.raise_for_status() # Raise an exception for HTTP errors
        m3u_content = response.text
        channels = parse_m3u(m3u_content)
        if not channels:
            print("Fallback M3U is empty or has incorrect format. Adding a default channel.")
            channels.append({'id': str(uuid4()), 'name': 'Победа (fallback)', 'url': f'{PROXY_SERVER_URL}https://example.com/default_stream.m3u8'}) # Placeholder for a default stream
        save_channels(channels)
        return channels
    except requests.exceptions.RequestException as e:
        print(f"Error fetching fallback M3U: {e}")
        # If fallback fails, return a minimal default channel
        default_channel = {'id': str(uuid4()), 'name': 'Ошибка загрузки каналов', 'url': ''}
        channels = [default_channel]
        save_channels(channels)
        return channels

@app.route('/proxy/<path:target_url>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def proxy_request(target_url):
    print(f"Proxying request for: {target_url}")

    # Preflight request handling for OPTIONS method
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*';
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
        response.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization';
        return response, 200

    try:
        # Normalize target_url to ensure it has '://' after scheme
        if target_url.startswith('http:/') and not target_url.startswith('http://'):
            target_url = target_url.replace('http:/', 'http://', 1)
        elif target_url.startswith('https:/') and not target_url.startswith('https://'):
            target_url = target_url.replace('https:/', 'https://', 1)

        # Ensure target_url is absolute (fallback if still not correct, though above should handle most cases)
        if not target_url.startswith('http://') and not target_url.startswith('https://'):
            target_url = 'http://' + target_url  # Default to http if no scheme provided
        
        # Parse target URL for header manipulation
        parsed_target_url = requests.utils.urlparse(target_url)

        # Prepare headers for the target request: start by copying all incoming headers
        # Exclude headers that should be handled specifically or are problematic for proxying
        excluded_incoming_headers = [
            'host', 'origin', 'user-agent', 'referer', 'content-length', 
            'transfer-encoding', 'connection', 'x-proxy-user-agent',
            'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto' # These will be set explicitly
        ]
        target_headers = {key: value for key, value in request.headers.items() 
                          if key.lower() not in excluded_incoming_headers}

        # Set Host header
        target_headers['Host'] = parsed_target_url.netloc

        # Set Origin header (always set as per latest JS proxy)
        target_headers['Origin'] = parsed_target_url.scheme + '://' + parsed_target_url.netloc

        # Set Referer header (from JS logic)
        target_headers['Referer'] = parsed_target_url.scheme + '://' + parsed_target_url.netloc + parsed_target_url.path

        # Set User-Agent (from JS logic)
        custom_user_agent = request.headers.get('X-Proxy-User-Agent') # Check for custom header first
        if custom_user_agent:
            target_headers['User-Agent'] = custom_user_agent
        else:
            target_headers['User-Agent'] = 'HlsWinkPlayer' # Fallback

        target_headers['Connection'] = 'keep-alive' # As per JS logic

        # Add X-Forwarded-For header, as used by http-proxy-middleware (xfwd: true)
        if request.remote_addr:
            target_headers['X-Forwarded-For'] = request.remote_addr
        
        # Add X-Forwarded-Host header (from xfwd: true in JS proxy)
        if request.host:
            target_headers['X-Forwarded-Host'] = request.host

        # Add X-Forwarded-Proto header (from xfwd: true in JS proxy)
        if request.scheme:
            target_headers['X-Forwarded-Proto'] = request.scheme

        # Make the actual request to the target URL
        resp = requests.request(
            method=request.method,
            url=target_url,
            headers=target_headers,
            data=request.get_data(), # Forward request body
            cookies=request.cookies, # Forward cookies
            allow_redirects=True,
            stream=True, # Stream response
            verify=False # Disable SSL verification (like secure: false in JS)
        )
        resp.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # Create Flask response and stream content
        response = Response(resp.iter_content(chunk_size=8192))

        # Copy headers from target response to Flask response, exclude problematic ones
        excluded_headers = ['content-encoding', 'transfer-encoding', 'content-length', 'connection']
        for key, value in resp.headers.items():
            if key.lower() not in excluded_headers:
                response.headers[key] = value
        
        # Force Access-Control-Allow-Origin to * for all responses (from JS onProxyRes)
        response.headers['Access-Control-Allow-Origin'] = '*';
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
        response.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization';

        # Set Content-Type fallback
        if 'Content-Type' not in response.headers:
            response.headers['Content-Type'] = resp.headers.get('Content-Type', 'application/octet-stream')

        print(f"Проксировали запрос: {request.method} {request.url} -> {target_url}, User-Agent: {target_headers.get('User-Agent')}, Referer: {target_headers.get('Referer') or 'N/A'}")
        print(f"Добавлены CORS заголовки в ответ прокси. Статус: {resp.status_code}")

        return response, resp.status_code

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error during proxy request: {e.response.status_code} - {e.response.text}")
        status_code = e.response.status_code if e.response is not None else 500
        return jsonify({
            'status': 'error',
            'message': 'Прокси-сервер не смог обработать запрос. HTTP Ошибка.',
            'details': str(e),
            'target': target_url
        }), status_code
    except requests.exceptions.ConnectionError as e:
        print(f"Connection Error during proxy request: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Прокси-сервер не смог соединиться с целевым сервером.',
            'details': str(e),
            'target': target_url
        }), 502
    except requests.exceptions.Timeout as e:
        print(f"Timeout Error during proxy request: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Прокси-сервер превысил время ожидания ответа от целевого сервера.',
            'details': str(e),
            'target': target_url
        }), 504
    except requests.exceptions.RequestException as e:
        print(f"Unhandled Request Exception during proxy request: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Прокси-сервер не смог обработать запрос. Общая ошибка.',
            'details': str(e),
            'target': target_url
        }), 500
    except Exception as e:
        print(f"Unhandled Exception in proxy_request: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Внутренняя ошибка прокси-сервера.',
            'details': str(e),
            'target': target_url
        }), 500

@app.route('/api/channels', methods=['GET'])
def get_channels():
    channels = load_channels()
    return jsonify(channels)

@app.route('/api/channels', methods=['POST'])
def add_channel():
    data = request.json
    name = data.get('name')
    url = data.get('url')

    if not name or not url:
        return jsonify({'error': 'Channel name and URL are required'}), 400

    channels = load_channels()
    new_channel = {'id': str(uuid4()), 'name': name, 'url': url}
    channels.append(new_channel)
    save_channels(channels)
    return jsonify(new_channel), 201

@app.route('/api/channels/<string:channel_id>', methods=['DELETE'])
def delete_channel(channel_id):
    channels = load_channels()
    original_length = len(channels)
    channels = [channel for channel in channels if channel['id'] != channel_id]

    if len(channels) == original_length:
        return jsonify({'error': 'Channel not found'}), 404

    save_channels(channels)
    return jsonify({'message': 'Channel deleted'}), 200

if __name__ == '__main__':
    # Initialize channels on startup if channels.json is missing or empty
    load_channels()
    app.run(debug=True, host='0.0.0.0', port=8081)
