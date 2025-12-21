const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { surface: true });
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simple dev/inline scripts, enable in strict prod if needed
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.static(path.join(__dirname, '../public')));

// In-memory storage
// users: { socketId: { id, username, socketId } }
const users = {};
const groups = {
    'Public Group': [],
    'Gaming Group': [],
    'Tech Group': []
};

function generateId(username) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 5; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${username}#${suffix}`;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', ({ username, publicKey, existingId }) => {
        // Fallback for old clients or simple string
        if (typeof username === 'object') {
            // Handle if just username was passed by mistake
        }

        // 1. Try to restore session if ID provided
        let uniqueId = existingId;

        // Validate existing ID format (Username#XXXXX)
        if (!uniqueId || !uniqueId.startsWith(username + '#')) {
            uniqueId = generateId(username);
        }

        // 2. Store user
        users[socket.id] = {
            id: uniqueId,
            username: username,
            socketId: socket.id,
            publicKey: publicKey // Store the public key
        };

        socket.emit('loginSuccess', {
            id: uniqueId,
            username: username,
            groups: Object.keys(groups)
        });

        // Default join Public Group
        socket.join('Public Group');
        socket.emit('history', groups['Public Group']);

        io.emit('userCount', Object.keys(users).length);
        console.log(`User logged in: ${uniqueId} (Restored: ${!!existingId})`);
    });

    socket.on('joinRoom', (roomName) => {
        if (users[socket.id] && groups[roomName]) {
            socket.join(roomName);
            socket.emit('joinedRoom', roomName);
            socket.emit('history', groups[roomName]);
        } else {
            socket.emit('error', 'Group does not exist');
        }
    });

    socket.on('getPublicKey', (targetId, callback) => {
        const targetSocketId = Object.keys(users).find(key => users[key].id === targetId);
        if (targetSocketId && users[targetSocketId]) {
            callback({ publicKey: users[targetSocketId].publicKey });
        } else {
            callback({ error: 'User not found' });
        }
    });

    socket.on('createGroup', (groupName) => {
        // Optional: User can provide name, or we generate ID
        const groupId = `Group#${Math.floor(1000 + Math.random() * 9000)}`;
        if (!groups[groupId]) {
            groups[groupId] = []; // Init history
        }
        socket.join(groupId);
        socket.emit('groupCreated', { id: groupId, name: groupName || groupId });
        socket.emit('history', []);
    });

    socket.on('sendMessage', ({ room, message, type, recipientId, ipfsCid, isSecure }) => {
        const sender = users[socket.id];
        if (!sender) return;

        const msgData = {
            senderId: sender.id,
            senderName: sender.id, // Changed from sender.username to sender.id for public accountability
            text: message,
            ipfsCid: ipfsCid, // Relay IPFS CID
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            room: type === 'private' ? recipientId : room
        };

        if (type === 'group') {
            if (groups[room]) {
                groups[room].push(msgData);
                if (groups[room].length > 50) groups[room].shift(); // Keep last 50
            }
            io.to(room).emit('receiveMessage', msgData);
        } else if (type === 'private') {
            // Find recipient socket
            const recipientSocketId = Object.keys(users).find(key => users[key].id === recipientId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('receiveMessage', { ...msgData, isPrivate: true, isSecure: isSecure });
                socket.emit('receiveMessage', { ...msgData, isPrivate: true, isSecure: isSecure, self: true }); // Echo back to sender
            } else {
                socket.emit('error', 'User not found or offline');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete users[socket.id];
        io.emit('userCount', Object.keys(users).length);
    });

    // WebRTC Signaling Relay
    socket.on('signal', ({ to, signal }) => {
        const targetSocketId = Object.keys(users).find(key => users[key].id === to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('signal', { from: users[socket.id].id, signal });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
