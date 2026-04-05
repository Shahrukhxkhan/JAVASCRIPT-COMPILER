import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // GitHub OAuth Config
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

  // 1. Get Auth URL
  app.get('/api/auth/github/url', (req, res) => {
    if (!GITHUB_CLIENT_ID) {
      return res.status(500).json({ error: 'GITHUB_CLIENT_ID is not configured in the environment variables.' });
    }
    const redirectUri = `${APP_URL}/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=repo`;
    res.json({ url });
  });

  // 2. Callback Handler
  app.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }, {
        headers: { Accept: 'application/json' }
      });

      const accessToken = response.data.access_token;

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_AUTH_SUCCESS', token: '${accessToken}' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub Auth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // 3. Get Project Files
  app.get('/api/project-files', (req, res) => {
    const files: { path: string, content: string }[] = [];
    const ignoreDirs = ['node_modules', '.git', 'dist', '.next'];

    function readDir(dir: string, base: string = '') {
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(base, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!ignoreDirs.includes(item)) {
            readDir(fullPath, relativePath);
          }
        } else {
          // Only include source files and config
          if (/\.(ts|tsx|json|css|html|js)$/.test(item) && item !== 'package-lock.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files.push({ path: relativePath, content });
          }
        }
      }
    }

    try {
      readDir(__dirname);
      res.json({ files });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read project files' });
    }
  });

  // 4. Push to GitHub
  app.post('/api/github/push', async (req, res) => {
    const { token, repoName, files } = req.body;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      // Get user info
      const userRes = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      const username = userRes.data.login;

      // Check if repo exists, if not create it
      try {
        await axios.get(`https://api.github.com/repos/${username}/${repoName}`, {
          headers: { Authorization: `token ${token}` }
        });
      } catch (e) {
        await axios.post('https://api.github.com/user/repos', {
          name: repoName,
          private: false,
          description: 'JS Compiler IDE Project'
        }, {
          headers: { Authorization: `token ${token}` }
        });
      }

      // Push files (Simplified: one by one)
      for (const file of files) {
        const { path: filePath, content } = file;
        
        // Get file SHA if it exists
        let sha;
        try {
          const fileRes = await axios.get(`https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`, {
            headers: { Authorization: `token ${token}` }
          });
          sha = fileRes.data.sha;
        } catch (e) {}

        await axios.put(`https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`, {
          message: `Update ${filePath}`,
          content: Buffer.from(content).toString('base64'),
          sha
        }, {
          headers: { Authorization: `token ${token}` }
        });
      }

      res.json({ success: true, url: `https://github.com/${username}/${repoName}` });
    } catch (error: any) {
      console.error('GitHub Push Error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to push to GitHub' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
