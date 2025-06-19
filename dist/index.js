"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cra_1 = __importDefault(require("./routes/cra"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const STATIC_DIR = path_1.default.join(__dirname, '..', 'static');
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/cra', cra_1.default);
// Serve static frontend
app.use(express_1.default.static(STATIC_DIR));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(STATIC_DIR, 'index.html'));
});
app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`CRA Eligibility Service listening on port ${PORT}`);
});
