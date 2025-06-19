import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import craRouter from './routes/cra';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const STATIC_DIR = path.join(__dirname, '..', 'static');

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/cra', craRouter);

// Serve static frontend
app.use(express.static(STATIC_DIR));
app.get('*', (_req: express.Request, res: express.Response) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CRA Eligibility Service listening on port ${PORT}`);
});
