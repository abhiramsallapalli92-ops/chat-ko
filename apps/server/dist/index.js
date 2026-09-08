"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const conversations_1 = __importDefault(require("./routes/conversations"));
const chatGateway_1 = require("./socket/chatGateway");
const prisma_1 = require("./prisma");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = process.env.PORT || 4000;
// CORS setup
app.use((0, cors_1.default)({
    origin: '*', // Allow all origins for dev/PWA accessibility
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
// Rate Limiting
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per IP per window
    message: { error: 'Too many authentication requests from this IP' },
});
// Routes
app.use('/api/auth', authLimiter, auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/conversations', conversations_1.default);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), service: 'Whisper E2EE Backend' });
});
// Socket.IO Server
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
(0, chatGateway_1.setupSocketGateway)(io);
// Initialize Prisma DB & Start Server
async function main() {
    try {
        await prisma_1.prisma.$connect();
        console.log('[Database] Connected to Prisma SQLite/PostgreSQL Database');
        server.listen(PORT, () => {
            console.log(`[Server] Whisper E2EE Server listening on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('[Server] Database connection error:', error);
        process.exit(1);
    }
}
main();
