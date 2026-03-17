import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Grok Route (X/Twitter Updates)
  app.get('/api/news/grok', async (req, res) => {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) {
      return res.status(200).json({ status: 'missing_key', provider: 'Grok', message: 'GROK_API_KEY is missing in Secrets.' });
    }

    const timeframe = req.query.timeframe || '24h';
    let timeText = 'the past 24 hours';
    if (timeframe === '7d') timeText = 'the past 7 days';
    if (timeframe === '30d') timeText = 'the past 30 days';

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${grokKey}`
        },
        body: JSON.stringify({
          model: 'grok-4.20-beta-0309-non-reasoning',
          messages: [
            {
              role: 'system',
              content: `You are an AI news extractor. Search X (Twitter) for the latest AI product announcements from ${timeText}. 
              Return ONLY a raw JSON array (no markdown blocks, no backticks) of 5 objects with keys: 
              "title" (Chinese), "description" (Chinese, one sentence), "source" (must be "X / Twitter"), "tags" (array of strings), "category" (must be "global").`
            },
            {
              role: 'user',
              content: `Find the 5 latest AI product announcements or viral AI tools on X from ${timeText}.`
            }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Grok API returned ${response.status}: ${errText}`);
      }
      const result = await response.json();
      
      // Parse the JSON array from Grok's response
      let text = result.choices[0].message.content.trim();
      
      // Robust JSON extraction: find the first '[' and last ']'
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        text = match[0];
      }
      
      const data = JSON.parse(text);
      res.json({ status: 'success', provider: 'Grok', data });
    } catch (error: any) {
      console.error('Grok API Error:', error);
      res.status(500).json({ status: 'error', provider: 'Grok', message: error.message || 'Failed to fetch from Grok' });
    }
  });

  // 3. Kimi Route (Domestic AI News)
  app.get('/api/news/kimi', async (req, res) => {
    const kimiKey = process.env.KIMI_API_KEY;
    if (!kimiKey) {
      return res.status(200).json({ status: 'missing_key', provider: 'Kimi', message: 'KIMI_API_KEY is missing in Secrets.' });
    }

    const timeframe = req.query.timeframe || '24h';
    let timeText = 'the past 24 hours';
    if (timeframe === '7d') timeText = 'the past 7 days';
    if (timeframe === '30d') timeText = 'the past 30 days';

    try {
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kimiKey}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            {
              role: 'system',
              content: `You are an AI news extractor. Search the web for the latest Chinese domestic AI product announcements from ${timeText}.
              Return ONLY a raw JSON array (no markdown blocks, no backticks) of 5 objects with keys: 
              "title" (Chinese), "description" (Chinese, one sentence), "source" (e.g., 微信公众号, 36Kr), "tags" (array of strings), "category" (must be "domestic").`
            },
            {
              role: 'user',
              content: `Search the web for the 5 latest Chinese domestic AI product announcements from ${timeText}.`
            }
          ]
        })
      });

      if (!response.ok) throw new Error(`Kimi API returned ${response.status}`);
      const result = await response.json();
      
      // Parse the JSON array from Kimi's response
      let text = result.choices[0].message.content.trim();
      
      // Robust JSON extraction: find the first '[' and last ']'
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        text = match[0];
      }
      
      const data = JSON.parse(text);
      res.json({ status: 'success', provider: 'Kimi', data });
    } catch (error) {
      console.error('Kimi API Error:', error);
      res.status(500).json({ status: 'error', provider: 'Kimi', message: 'Failed to fetch from Kimi' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
