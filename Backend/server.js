const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const rt = require('./lib/realtime');
const { attachAuth, socketAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// The React dev server runs on its own origin, so CORS has to allow
// credentials for the httpOnly refresh cookie to travel.
const ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',').map((s) => s.trim());

const io = new Server(server, { cors: { origin: ORIGINS, credentials: true } });
rt.bind(io);

app.set('trust proxy', 1);
app.use(cors({ origin: ORIGINS, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(attachAuth);

// ---------------------------------------------------------------------
// REAL-TIME
// The three operators of a team share one wallet, so a balance change on
// one phone has to reach the other two immediately. The socket handshake
// carries the same access token as the REST calls: a client can only
// join its own team room, never someone else's.
// ---------------------------------------------------------------------
io.use(socketAuth);

io.on('connection', (socket) => {
    const auth = socket.data.auth;

    socket.join('feed');

    if (auth.kind === 'team') {
        socket.join(`team_${auth.teamId}`);
        io.to(`team_${auth.teamId}`).emit('operator_online', { nickname: auth.nickname });
    } else if (auth.kind === 'admin') {
        socket.join('admins');
    }

    socket.on('disconnect', () => {
        if (auth.kind === 'team') {
            io.to(`team_${auth.teamId}`).emit('operator_offline', { nickname: auth.nickname });
        }
    });
});

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ status: 'THE CORE IS LISTENING', uptime: process.uptime() }));

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

// Serve the built React app in production.
const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) res.status(404).json({ error: 'NOT FOUND' });
    });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error(err);

    // A dead database surfaces as an AggregateError with an empty message,
    // which tells whoever is running the event nothing. Name it instead.
    const dbDown =
        err.code === 'ECONNREFUSED' ||
        (Array.isArray(err.errors) && err.errors.some((e) => e.code === 'ECONNREFUSED'));

    const message = dbDown
        ? 'DATABASE UNREACHABLE. CHECK DATABASE_URL AND THAT POSTGRES IS RUNNING.'
        : err.message || err.code || 'UNKNOWN FAILURE.';

    res.status(err.status || (dbDown ? 503 : 500)).json({ error: 'SYSTEM FAILURE DETECTED.', message });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`THE CORE IS LISTENING ON PORT ${PORT}`);
});
