// ============================================================
// Loop Solar — Socket.io Service
// ============================================================

import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

let socket = null;

export function connectSocket() {
    if (socket?.connected) return socket;
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 3000
    });
    
    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
    });
    
    socket.on('connect_error', (err) => {
        console.log('[Socket] Connection error:', err.message);
    });
    
    return socket;
}

export function getSocket() {
    if (!socket) return connectSocket();
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
