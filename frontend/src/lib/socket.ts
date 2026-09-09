import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './api'

let socket: Socket | null = null

/**
 * One socket per tab, authenticated with the same access token as the REST
 * calls. The server decides which rooms the connection may join, so a team
 * can only ever receive its own wallet updates.
 */
export function connectSocket(): Socket {
  if (socket?.connected) return socket

  socket = io({
    auth: { token: getAccessToken() },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  })

  // After a token refresh the old handshake credential is stale, so
  // re-arm it before every reconnect attempt.
  socket.io.on('reconnect_attempt', () => {
    if (socket) socket.auth = { token: getAccessToken() }
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
