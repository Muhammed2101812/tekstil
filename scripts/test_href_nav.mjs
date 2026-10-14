import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const PORT = 8089;
const DIST_DIR = path.resolve('dist_web');

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const { data: authData } = await supabase.auth.signInWithPassword({
  email: 'reviewer@atolyedefteri.com',
  password: 'Reviewer2026!'
});
const session = authData.session;
const userId = session.user.id;

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.createReadStream(filePath).pipe(res);
  } else {
    fs.createReadStream(path.join(DIST_DIR, 'index.html')).pipe(res);
  }
});

server.listen(PORT, async () => {
  const profileDir = '/tmp/chrome_persisted_profile_test';
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profileDir}`,
    '--window-size=412,915',
  ]);
  await new Promise(r => setTimeout(r, 2000));
  try {
    const targets = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function send(m, p = {}) {
      return new Promise((res, rej) => {
        const i = id++;
        const to = setTimeout(() => rej(new Error('Timeout ' + m)), 15000);
        const h = e => {
          const d = JSON.parse(e.data);
          if (d.id === i) { clearTimeout(to); ws.removeEventListener('message', h); res(d.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: i, method: m, params: p }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      fitWindow: false,
    });

    // 1. Visit root to set localStorage
    await send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await new Promise(r => setTimeout(r, 1500));

    const captureCode = fs.readFileSync('scripts/capture_screens.mjs', 'utf8');
    const demoDbMatch = captureCode.match(/const demoDB = (\{[\s\S]*?\n    \};)/);
    const demoDBStr = demoDbMatch ? demoDbMatch[1] : '{}';

    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('sb-rocnibznifkudlsqtatj-auth-token', ${JSON.stringify(JSON.stringify(session))});
        localStorage.setItem('tekstil_local_db', JSON.stringify(${demoDBStr}));
      `
    });

    // 2. Now open /puantaj via window.location.href!
    console.log('Navigating via window.location.href = /puantaj...');
    await send('Runtime.evaluate', {
      expression: `window.location.href = '/puantaj';`
    });
    await new Promise(r => setTimeout(r, 5000));

    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('test_puantaj_href.png', Buffer.from(data, 'base64'));
    console.log('Saved test_puantaj_href.png');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }
});
