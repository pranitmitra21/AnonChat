import { createHelia } from 'https://esm.sh/helia';
import { json } from 'https://esm.sh/@helia/json';

// Global Socket Access (since we are module now, but socket.io is global script)
const socket = window.io();

// DOM Elements
const landingPage = document.getElementById('landing-page');
const dashboardPage = document.getElementById('dashboard-page');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const currentUserIdEl = document.getElementById('current-user-id');
const groupList = document.getElementById('group-list');
const messageContainer = document.getElementById('message-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const currentChatTitle = document.getElementById('current-chat-title');

// Logout functionality
// Logout functionality - Global Handler for Robustness
window.appLogout = function () {
    if (confirm('Are you sure you want to logout?')) {
        try {
            // Disconnect socket first
            if (socket) socket.disconnect();
        } catch (e) {
            // Ignore error
        }
        // Force reload to clear all state and return to login
        window.location.reload();
    }
};

// Remove old event listener code if present (or just leave it as fallback, but identifying by ID is safer)
// We rely on onclick="appLogout()" in HTML now.

const inviteInput = document.getElementById('friend-id-input');
const inviteBtn = document.getElementById('invite-btn');
const privateChatsList = document.getElementById('private-chats-list');

const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

// State
let currentUser = null;
let currentContext = { type: 'group', id: 'Public Group' }; // or { type: 'private', id: 'User#123', name: 'User' }
const privateChats = new Set(); // Stores IDs of users we have chatted with

const chatHistory = {}; // { 'id': [msgs] }
const sharedKeys = {}; // Cache shared keys: { 'userId': CryptoKey }

// --- IPFS MODULE ---
const IPFS = {
    helia: null,
    j: null,

    async init() {
        if (this.helia) return;
        try {
            this.helia = await createHelia();
            this.j = json(this.helia);
            console.log('IPFS: Node Started');

            // Update UI indicators
            updateIPFSStatus('active');
        } catch (e) {
            console.error('IPFS Start Error:', e);
            updateIPFSStatus('error');
        }
    },

    async addMessage(msgData) {
        if (!this.helia) await this.init();
        try {
            const cid = await this.j.add(msgData);
            console.log('IPFS: Message stored at', cid.toString());
            return cid.toString();
        } catch (e) {
            console.error('IPFS Add Error:', e);
            return null;
        }
    },

    async getMessage(cidString) {
        if (!this.helia) await this.init();
        try {
            // Need to parse CID string back to CID object?
            // Helia json.get takes CID object.
            // We need 'multiformats/cid' import really, but maybe we can just pass the string if library handles it? 
            // Usually need CID.parse. Let's try dynamic import or assume the string works (unlikely).
            // Let's import CID from esm.sh as well.
            const { CID } = await import('https://esm.sh/multiformats/cid');
            const cid = CID.parse(cidString);
            return await this.j.get(cid);
        } catch (e) {
            console.error('IPFS Get Error:', e);
            return null;
        }
    }
};

// Helper function to update IPFS status UI
function updateIPFSStatus(status) {
    const statusBadge = document.getElementById('ipfs-status-badge');
    const statusText = document.getElementById('ipfs-status-text');
    const indicator = document.getElementById('ipfs-status-indicator');
    const ipfsIcon = document.getElementById('ipfs-icon');
    const ipfsText = document.getElementById('ipfs-text');

    if (status === 'active') {
        if (statusBadge) {
            statusBadge.style.display = 'block';
            statusText.textContent = 'IPFS Active';
            statusText.style.color = '#2ECC71';
        }
        if (indicator) {
            indicator.style.display = 'block';
            ipfsIcon.textContent = '✓';
            ipfsText.textContent = 'IPFS Active';
            indicator.style.color = '#2ECC71';
        }
    } else if (status === 'error') {
        if (statusBadge) {
            statusBadge.style.display = 'block';
            statusText.textContent = 'IPFS Offline';
            statusText.style.color = '#E74C3C';
        }
        if (indicator) {
            indicator.style.display = 'block';
            ipfsIcon.textContent = '⚠';
            ipfsText.textContent = 'IPFS Offline';
            indicator.style.color = '#E74C3C';
        }
    } else if (status === 'initializing') {
        if (statusBadge) {
            statusBadge.style.display = 'block';
            statusText.textContent = 'IPFS Initializing...';
            statusText.style.color = '#F39C12';
        }
        if (indicator) {
            indicator.style.display = 'block';
            ipfsIcon.textContent = '⟳';
            ipfsText.textContent = 'IPFS Initializing...';
            indicator.style.color = '#F39C12';
        }
    }
}


// --- CRYPTO MODULE ---
const Crypto = {
    keyPair: null,

    async init() {
        this.keyPair = await window.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            true,
            ["deriveKey", "deriveBits"]
        );
        console.log("Crypto: Key Pair Generated");
    },

    async exportSessionKeys() {
        if (!this.keyPair) return null;
        const pub = await window.crypto.subtle.exportKey("spki", this.keyPair.publicKey);
        const priv = await window.crypto.subtle.exportKey("pkcs8", this.keyPair.privateKey);
        return {
            publicKey: this.arrayBufferToBase64(pub),
            privateKey: this.arrayBufferToBase64(priv)
        };
    },

    async importSessionKeys(keys) {
        const pubKey = await window.crypto.subtle.importKey(
            "spki",
            this.base64ToArrayBuffer(keys.publicKey),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );
        const privKey = await window.crypto.subtle.importKey(
            "pkcs8",
            this.base64ToArrayBuffer(keys.privateKey),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
        this.keyPair = { publicKey: pubKey, privateKey: privKey };
        console.log("Crypto: Keys Restored from Session");
    },

    async getPublicKeyBase64() {
        if (!this.keyPair) await this.init();
        const exportKey = await window.crypto.subtle.exportKey("spki", this.keyPair.publicKey);
        return this.arrayBufferToBase64(exportKey);
    },

    async importPublicKey(base64Key) {
        const binary = atob(base64Key);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        return await window.crypto.subtle.importKey(
            "spki",
            bytes.buffer,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );
    },

    async deriveSharedKey(otherPublicKeyBase64) {
        const otherPublicKey = await this.importPublicKey(otherPublicKeyBase64);
        const sharedBits = await window.crypto.subtle.deriveBits(
            { name: "ECDH", public: otherPublicKey },
            this.keyPair.privateKey,
            256
        );

        return await window.crypto.subtle.importKey(
            "raw",
            sharedBits,
            { name: "AES-GCM" },
            true,
            ["encrypt", "decrypt"]
        );
    },

    async encrypt(text, sharedKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            sharedKey,
            data
        );

        return {
            iv: this.arrayBufferToBase64(iv),
            content: this.arrayBufferToBase64(encrypted)
        };
    },

    async decrypt(encryptedData, sharedKey) {
        // Expecting { iv, content } (base64)
        const iv = this.base64ToArrayBuffer(encryptedData.iv);
        const content = this.base64ToArrayBuffer(encryptedData.content);

        try {
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                sharedKey,
                content
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed:", e);
            return "[Encrypted Message - Unable to Decrypt]";
        }
    },

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};

// --- WEBRTC MODULE (Native) ---
const WebRTC = {
    peers: {}, // userId -> { conn: RTCPeerConnection, channel: RTCDataChannel }
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    },

    initPeer(targetId, initiator) {
        if (this.peers[targetId]) return this.peers[targetId];

        const conn = new RTCPeerConnection(this.config);
        const peer = { conn, channel: null, buffer: [] };
        this.peers[targetId] = peer;

        conn.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { to: targetId, signal: { candidate: event.candidate } });
            }
        };

        conn.onconnectionstatechange = () => {
            console.log(`WebRTC ${targetId}: ${conn.connectionState}`);
            if (conn.connectionState === 'disconnected' || conn.connectionState === 'failed') {
                this.closePeer(targetId);
            }
        };

        if (initiator) {
            // Initiator creates data channel
            const channel = conn.createDataChannel("chat");
            this.setupChannel(channel, peer, targetId);

            conn.createOffer()
                .then(offer => conn.setLocalDescription(offer))
                .then(() => {
                    socket.emit('signal', { to: targetId, signal: { sdp: conn.localDescription } });
                });
        } else {
            // Receiver waits for data channel
            conn.ondatachannel = (event) => {
                this.setupChannel(event.channel, peer, targetId);
            };
        }

        return peer;
    },

    setupChannel(channel, peer, targetId) {
        peer.channel = channel;
        channel.onopen = () => {
            console.log(`WebRTC Channel Open: ${targetId}`);
            // Flush buffer?
        };
        channel.onmessage = (event) => {
            console.log("WebRTC msg:", event.data);
            const msg = JSON.parse(event.data);
            // Inject into chat flow
            if (msg.type === 'chat') {
                // Simulate socket receive
                // We need to construct the msg object expected by UI
                // msg payload: { senderId, senderName, text, time, room, isPrivate: true, isSecure... }
                // The sender sent us the raw 'msgData' from sendMessage.
                // We need to wrap it or handle it.
                // Let's assume sender sends exact same object as socket 'receiveMessage'
                onReceiveMessage(msg.payload);
            }
        };
    },

    handleSignal(fromId, signal) {
        // If we don't have peer, we are receiver
        const isInitiator = !!this.peers[fromId];
        const peer = this.initPeer(fromId, false);
        const { conn } = peer;

        if (signal.sdp) {
            conn.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    if (signal.sdp.type === 'offer') {
                        return conn.createAnswer();
                    }
                })
                .then(answer => {
                    if (answer) {
                        return conn.setLocalDescription(answer).then(() => {
                            socket.emit('signal', { to: fromId, signal: { sdp: conn.localDescription } });
                        });
                    }
                });
        } else if (signal.candidate) {
            conn.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.error(e));
        }
    },

    send(targetId, payload) {
        const peer = this.peers[targetId];
        if (peer && peer.channel && peer.channel.readyState === 'open') {
            peer.channel.send(JSON.stringify({ type: 'chat', payload }));
            return true;
        }
        return false;
    },

    closePeer(targetId) {
        if (this.peers[targetId]) {
            this.peers[targetId].conn.close();
            delete this.peers[targetId];
        }
    }
};

// --- LOGGING --- (Helper to hook into socket receive logic if mostly same)
function onReceiveMessage(msg) {
    // This calls the existing socket.on('receiveMessage') logic?
    // That logic is huge and inline. I should extract it.
    // OR I can just emit a fake socket event locally?
    // socket.listeners('receiveMessage')... tricky.
    // I will extract 'receiveMessage' logic to a shared function `handleMsg`.
    handleIncomingMessage(msg);
}

// ... existing code ...
async function performLogin(username, existingId = null, restoreKeys = null) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="btn-icon">⏳</span> Connecting...';

    try {
        if (restoreKeys) {
            await Crypto.importSessionKeys(restoreKeys);
        } else {
            await Crypto.init();
        }

        const publicKey = await Crypto.getPublicKeyBase64();

        // Start IPFS in background
        updateIPFSStatus('initializing');
        IPFS.init();

        socket.emit('login', { username, publicKey, existingId });
    } catch (err) {
        console.error("Crypto/Login Error:", err);
        loginError.textContent = "Initialization failed.";
        loginBtn.disabled = false;
        loginBtn.textContent = "Enter as Guest";
    }
}

// Auto-Restore Session on Load
window.addEventListener('DOMContentLoaded', async () => {
    const savedSession = sessionStorage.getItem('anonSession');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            console.log("Found saved session:", session.username);
            usernameInput.value = session.username; // Pre-fill

            // Auto Login
            await performLogin(session.username, session.id, session.keys);

            // Restore History
            restoreChatSession();
        } catch (e) {
            console.error("Failed to restore session", e);
            sessionStorage.removeItem('anonSession');
        }
    }
});

loginBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (username.length < 3) {
        loginError.textContent = "Username must be at least 3 characters.";
        return;
    }
    await performLogin(username);
});

socket.on('loginSuccess', async (userData) => {
    currentUser = userData;
    currentUserIdEl.textContent = userData.id;

    // Save Session
    const keys = await Crypto.exportSessionKeys();
    sessionStorage.setItem('anonSession', JSON.stringify({
        id: userData.id,
        username: userData.username,
        keys: keys
    }));

    // Smooth Transition
    landingPage.classList.add('fade-out');

    setTimeout(() => {
        landingPage.classList.add('hidden');
        landingPage.classList.remove('fade-out'); // Reset for potential logout
        dashboardPage.classList.remove('hidden');
    }, 500); // 0.5s matches CSS animation duration

    // Phase 3: Start Anonymity Traffic
    startDummyTraffic();
});

// --- PERSISTENCE HELPERS ---
function saveChatSession() {
    // Save Message History
    sessionStorage.setItem('anonHistory', JSON.stringify(chatHistory));

    // Save DM List (Set -> Array)
    sessionStorage.setItem('anonDMs', JSON.stringify(Array.from(privateChats)));
}

function restoreChatSession() {
    try {
        const savedHistory = sessionStorage.getItem('anonHistory');
        const savedDMs = sessionStorage.getItem('anonDMs');

        if (savedHistory) {
            const parsed = JSON.parse(savedHistory);
            Object.assign(chatHistory, parsed); // Merge into main object
            console.log("Restored history for:", Object.keys(chatHistory));
        }

        if (savedDMs) {
            const parsed = JSON.parse(savedDMs);
            parsed.forEach(id => {
                privateChats.add(id);
                // FIX: Always use ID as the display name to ensure consistency with active session
                // Previously we extracted 'senderName' which broke the Name#ID format on refresh
                addDMToList(id, id);
            });
        }
    } catch (e) {
        console.error("Failed to restore chat history:", e);
    }
}


socket.on('error', (msg) => {
    alert(msg);
});

// Chat Logic
function addMessage(msg) {
    const div = document.createElement('div');
    const isSelf = msg.senderId === currentUser.id;

    div.classList.add('message');
    div.classList.add(isSelf ? 'sent' : 'received');

    let textContent = msg.text;

    // Safety check for Object rendering [object Object]
    if (typeof msg.text === 'object') {
        if (msg.text.iv && msg.text.content) {
            textContent = '🔒 Encrypted Message';
        } else {
            textContent = JSON.stringify(msg.text);
        }
    }

    div.innerHTML = `
        <div class="content">
            ${textContent}
        </div>
        <div class="meta">
            <span>${isSelf ? 'You' : msg.senderName}</span>
            <span>${msg.time}</span>
        </div>
    `;

    messageContainer.appendChild(div);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

socket.on('history', (messages) => {
    // Only clear and show if it matches current context (which it should if we just joined)
    // Actually we cleared before joining, so just append.
    if (currentContext.type === 'group') {
        chatHistory[currentContext.id] = messages;
        messageContainer.innerHTML = '';
        messages.forEach(msg => addMessage(msg));
    }
});

const dmList = document.getElementById('dm-list');

// ... (DOM Elements)

// ...

// Separate handler for incoming messages (used by both Socket and WebRTC)
async function handleIncomingMessage(msg) {
    let chatKey;
    let finalMsg = msg;

    try {
        // Attempt decryption immediately for private secure messages
        if (msg.isPrivate && msg.isSecure && !msg.self) {
            finalMsg = await processIncomingMessage(msg);
        }
    } catch (e) {
        console.error("Pre-storage decryption failed:", e);
    }

    if (finalMsg.isPrivate) {
        chatKey = finalMsg.senderId === currentUser.id ? finalMsg.room : finalMsg.senderId;

        if (!chatHistory[chatKey]) chatHistory[chatKey] = [];
        chatHistory[chatKey].push(finalMsg);

        // FIX: Always use the chatKey (Unique ID: Username#XXXXX) as the display name.
        // This ensures both sender and receiver see "Name#ID" in the sidebar/header.
        const PARTNER_NAME = chatKey;

        addDMToList(chatKey, PARTNER_NAME);

        // Track Private Chat
        privateChats.add(chatKey);
        saveChatSession(); // SAVE

        if (currentContext.type === 'private' && currentContext.id === chatKey) {
            if (!finalMsg.self) addMessage(finalMsg);
        } else {
            const dmItem = document.querySelector(`.dm-item[data-id="${chatKey}"]`);
            if (dmItem) {
                let badge = dmItem.querySelector('.notification-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'notification-badge';
                    badge.textContent = '1';
                    dmItem.appendChild(badge);
                } else {
                    badge.textContent = parseInt(badge.textContent) + 1;
                }
            }
        }
    } else {
        chatKey = finalMsg.room;
        if (!chatHistory[chatKey]) chatHistory[chatKey] = [];
        chatHistory[chatKey].push(finalMsg);

        if (currentContext.type === 'group' && currentContext.id === finalMsg.room) {
            addMessage(finalMsg);
        }

        // Save public/group history too? Maybe heavier, but useful.
        saveChatSession();
    }
}

socket.on('receiveMessage', handleIncomingMessage);

socket.on('signal', (data) => {
    WebRTC.handleSignal(data.from, data.signal);
});

// --- DUMMY TRAFFIC (Phase 3) ---
function startDummyTraffic() {
    setInterval(() => {
        if (!currentUser) return;
        // Send a fake encrypted packet to a random ID
        // In real world, we'd send to server to relay to random.
        // Here we just emit a 'dummy' event to keep connection active/noisy
        const dummyPayload = new Uint8Array(256); // 256 bytes noise
        window.crypto.getRandomValues(dummyPayload);

        // We use a custom event that server ignores or logs
        // Or we could send a 'sendMessage' to a non-existent room to look real?
        // Let's send a 'ping' frame disguised as data
        socket.emit('dummy', {
            data: Array.from(dummyPayload), // JSON overhead, but fine for prototype
            timestamp: Date.now()
        });
        // console.log("Sent dummy traffic");
    }, 45000 + Math.random() * 30000); // Every 45-75 seconds
}

function addDMToList(id, name) {
    // Check if exists
    let exists = document.querySelector(`.dm-item[data-id="${id}"]`);
    if (exists) return;

    const li = document.createElement('li');
    li.classList.add('dm-item');
    li.classList.add('group-item'); // Reuse group-item styling
    li.setAttribute('data-id', id);
    li.textContent = `💬 ${name || id}`; // Show name with icon

    // Allow closing/removing? For now just simple list.
    li.addEventListener('click', () => {
        console.log('DM Item clicked:', id, name);

        // Remove badge
        const badge = li.querySelector('.notification-badge');
        if (badge) {
            console.log('Removing badge');
            badge.remove();
        }

        // Switch
        console.log('Calling switchChat with:', 'private', id, name || id);
        switchChat('private', id, name || id);

        // Update Active
        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.dm-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        console.log('Activated DM item');
    });

    dmList.appendChild(li);
    console.log('Added DM to list:', id, name); // Debug log
}

// Switching logic existing... update it to clear active states of both lists

// Sending Messages
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    if (currentContext.type === 'group') {
        try {
            // Store group message on IPFS
            const msgData = {
                text: text,
                sender: currentUser.id,
                room: currentContext.id,
                timestamp: Date.now()
            };

            const cid = await IPFS.addMessage(msgData);

            socket.emit('sendMessage', {
                room: currentContext.id,
                message: text,
                ipfsCid: cid,
                type: 'group'
            });

            messageInput.value = '';
        } catch (e) {
            console.error('IPFS Error (Group):', e);
            // Fallback: send without IPFS if it fails
            socket.emit('sendMessage', {
                room: currentContext.id,
                message: text,
                type: 'group'
            });
            messageInput.value = '';
        }
    } else {
        // Private Message - E2EE
        const recipientId = currentContext.id;

        try {
            let sharedKey = sharedKeys[recipientId];
            if (!sharedKey) {
                // Fetch Public Key
                const response = await new Promise(resolve => {
                    socket.emit('getPublicKey', recipientId, resolve);
                });

                if (response.error || !response.publicKey) {
                    addMessage({ text: "Error: Could not establish secure connection.", senderName: "System", time: "", isSystem: true });
                    return;
                }

                sharedKey = await Crypto.deriveSharedKey(response.publicKey);
                sharedKeys[recipientId] = sharedKey;
            }

            const encrypted = await Crypto.encrypt(text, sharedKey);

            // Store on IPFS
            const cid = await IPFS.addMessage(encrypted);

            // Optimistic UI: Display plaintext message immediately
            const sentMsg = {
                senderId: currentUser.id,
                senderName: currentUser.username,
                text: text, // Plaintext for self
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                ipfsCid: cid,
                isPrivate: true,
                room: recipientId,
                isSecure: true,
                self: true
            };
            addMessage(sentMsg);
            // Save to history self
            if (!chatHistory[recipientId]) chatHistory[recipientId] = [];
            chatHistory[recipientId].push(sentMsg);

            privateChats.add(recipientId);
            saveChatSession(); // SAVE


            const payload = {
                senderId: currentUser.id,
                senderName: currentUser.username,
                text: encrypted, // Encrypted for wire
                ipfsCid: cid,
                time: sentMsg.time,
                room: recipientId, // For receiver, room is me (sender)? No, logic is tricky.
                // In socket logic: io.to(recipient).emit(..., { ...msgData, isPrivate: true })
                // msgData.room is recipientId.
                isPrivate: true,
                isSecure: true,
                self: false
            };

            // TRY WEBRTC FIRST
            if (WebRTC.send(recipientId, payload)) {
                console.log("Sent via P2P");
            } else {
                console.log("Fallback to Relay");
                // Fallback to socket
                socket.emit('sendMessage', {
                    recipientId: recipientId,
                    message: encrypted,
                    ipfsCid: cid,
                    type: 'private',
                    isSecure: true
                });
            }
            // Init peer for future if not exists
            WebRTC.initPeer(recipientId, true);

            messageInput.value = '';

        } catch (e) {
            console.error("Encryption Error", e);
            alert("Failed to encrypt message.");
        }
    }
}

async function processIncomingMessage(msg) {
    console.log("Processing Incoming:", msg);
    // If it's a group info message or plain text
    if (!msg.isSecure) {
        console.log("Msg not secure, returning.");
        return msg;
    }

    // It's secure.
    // Msg.message is { iv, content } (or text is?)
    // In server: msgData.text = message. So msg.text is the encrypted object.

    // Who is the other party?
    // If I received it, sender is the other party.
    // If I sent it (self), recipient is the other party (msg.room is recipientId).
    const otherPartyId = msg.self ? msg.room : msg.senderId;
    console.log("Other Party ID:", otherPartyId);

    let sharedKey = sharedKeys[otherPartyId];
    if (!sharedKey) {
        console.log("Shared key missing, fetching...");
        const response = await new Promise(resolve => {
            socket.emit('getPublicKey', otherPartyId, resolve);
        });
        if (response.publicKey) {
            console.log("Got public key, deriving...");
            sharedKey = await Crypto.deriveSharedKey(response.publicKey);
            sharedKeys[otherPartyId] = sharedKey;
        } else {
            console.log("Failed to get public key for", otherPartyId, response);
        }
    }

    if (sharedKey && msg.text && msg.text.iv && msg.text.content) {
        try {
            console.log("Decrypting...");
            const decryptedText = await Crypto.decrypt(msg.text, sharedKey);
            console.log("Decrypted:", decryptedText);
            return { ...msg, text: decryptedText };
        } catch (e) {
            console.error("Decryption threw error:", e);
            return { ...msg, text: "🔒 Decryption Error: " + e.message };
        }
    } else {
        console.log("Skipping decryption. SharedKey:", !!sharedKey, "HasText:", !!msg.text);
        let reason = "Unknown";
        if (!sharedKey) reason = "Shared Key Missing (Could not derive from " + otherPartyId + ")";
        else if (!msg.text) reason = "Message Text Missing";
        else if (!msg.text.iv) reason = "Previously Encrypted Format Invalid";

        return { ...msg, text: "🔒 Decryption Skipped: " + reason };
    }

    return msg;
}

// Modify socket.on('receiveMessage') to generic handling?
// Actually I modified inside the specific block above, but 'receiveMessage' handler is huge.
// I should wrap the listener.

// Re-implementing the socket.on('receiveMessage') to be cleaner and async-aware
// Because I only replaced a chunk above, I need to make sure I didn't break functionality.
// The chunk above was inside the existing 'receiveMessage'. 
// It converts `addMessage(msg)` to `process...then(addMessage)`.
// But `receiveMessage` isn't async.


sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Room Switching (Groups)
groupList.addEventListener('click', (e) => {
    if (e.target.classList.contains('group-item')) {
        const roomName = e.target.getAttribute('data-room');
        switchChat('group', roomName, roomName);

        // Update UI
        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
    }
});

// Private Chat Invitation
// Private Chat / Join Group Logic
inviteBtn.addEventListener('click', () => {
    const inputId = inviteInput.value.trim();
    if (!inputId) return;

    // Check if it's a group ID (Group#...)
    if (inputId.startsWith('Group#')) {
        const groupName = inputId;

        // Add to list if not present
        let exists = false;
        document.querySelectorAll('.group-item').forEach(el => {
            if (el.getAttribute('data-room') === groupName) exists = true;
        });

        if (!exists) {
            const li = document.createElement('li');
            li.classList.add('group-item');
            li.setAttribute('data-room', groupName);
            li.textContent = groupName;
            groupList.appendChild(li);
        }

        switchChat('group', groupName, groupName);

        // Update UI
        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`[data-room="${groupName}"]`).classList.add('active');

    } else {
        // Private Chat
        if (inputId === currentUser.id) {
            alert("You cannot chat with yourself.");
            return;
        }
        addPrivateChatToList(inputId, "Unknown");
        switchChat('private', inputId, inputId);
    }
    inviteInput.value = '';
});

// Create Private Group
const createGroupBtn = document.getElementById('create-group-btn');
createGroupBtn.addEventListener('click', () => {
    socket.emit('createGroup');
});

socket.on('groupCreated', (groupData) => {
    const li = document.createElement('li');
    li.classList.add('group-item');
    li.setAttribute('data-room', groupData.id);
    li.textContent = groupData.name;
    groupList.appendChild(li);

    switchChat('group', groupData.id, groupData.name);

    document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
    li.classList.add('active');
});

function addPrivateChatToList(id, name) {
    if (privateChats.has(id)) return;
    privateChats.add(id);

    const el = document.createElement('div');
    el.classList.add('private-chat-item');
    el.textContent = `${name} (${id})`;
    el.onclick = () => switchChat('private', id, name);
    privateChatsList.prepend(el);
}

function switchChat(type, id, title) {
    console.log('switchChat called:', { type, id, title });
    console.log('chatHistory for id:', id, chatHistory[id]);

    currentContext = { type, id, name: title };
    currentChatTitle.textContent = title;
    messageContainer.innerHTML = ''; // Clear messages

    // Load from local history
    if (chatHistory[id]) {
        console.log('Loading', chatHistory[id].length, 'messages from history');
        chatHistory[id].forEach(msg => addMessage(msg));
    } else {
        console.log('No chat history found for id:', id);
    }

    if (type === 'group') {
        socket.emit('joinRoom', id);
    }
}

// Sidebar Functionality
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('sidebar-resizer');
const toggleBtn = document.getElementById('sidebar-toggle');
let isResizing = false;

// Toggle
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    // Ensure button text rotates correctly via CSS
});

// Minimized Chat Trigger (Expand Sidebar)
const minimizedTrigger = document.getElementById('minimized-chat-trigger');
if (minimizedTrigger) {
    minimizedTrigger.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
    });
}

// Resizing
resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    // Calculate new width
    const newWidth = e.clientX;

    // Constraints: Min 180px (readable), Max 450px (feasible)
    // If they want nicely small, use toggle. Dragging should keep it readable.
    if (newWidth > 180 && newWidth < 450) {
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
        }
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
    }
});

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');

    if (isLight) {
        themeToggle.innerHTML = '<span class="theme-icon">🌙</span> Dark Mode';
    } else {
        themeToggle.innerHTML = '<span class="theme-icon">☀️</span> Light Mode';
    }
});

// Emoji Picker
emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
});

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add('hidden');
    }
});

// Emoji selection
document.querySelectorAll('.emoji-item').forEach(emoji => {
    emoji.addEventListener('click', () => {
        const emojiChar = emoji.textContent;
        messageInput.value += emojiChar;
        messageInput.focus();
        // Don't close picker so user can add multiple emojis
    });
});
