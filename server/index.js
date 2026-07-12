import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import parseRouter from './routes/parse.js';
import scheduleRouter from './routes/schedule.js';
import chatRouter from './routes/chat.js';
import historyRouter from './routes/history.js';
import userdataRouter from './routes/userdata.js';
import debugRouter from './routes/debug.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '28mb' })); // headroom over the 20MB image limit for base64 overhead

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(process.env.FEATHERLESS_API_KEY && process.env.FEATHERLESS_API_KEY !== 'paste-your-key-here'),
    visionModel: process.env.VISION_MODEL || 'google/gemma-3-27b-it',
    reasoningModel: process.env.REASONING_MODEL || 'deepseek-ai/DeepSeek-V4-Pro',
  });
});

app.use('/api', parseRouter);
app.use('/api', scheduleRouter);
app.use('/api', chatRouter);
app.use('/api', historyRouter);
app.use('/api', userdataRouter);
app.use('/api', debugRouter);

// Central error handler: every failure reaches the client as { error, code }.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large — max 20MB.', code: 'IMAGE_TOO_LARGE' });
  }
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  if (status >= 500) console.error(`[${code}]`, err.message);
  res.status(status).json({ error: err.message, code });
});

app.listen(PORT, () => {
  console.log(`Circa server listening on http://localhost:${PORT}`);
});
