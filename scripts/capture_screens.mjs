import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const PORT = 8089;
const DIST_DIR = path.resolve('dist_web');

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: 'reviewer@atolyedefteri.com',
  password: 'Reviewer2026!'
});

if (authError || !authData.session) {
  console.error('Failed to sign in to Supabase:', authError);
  process.exit(1);
}

const session = authData.session;
const userId = session.user.id;
console.log('Signed in successfully as:', session.user.email, 'ID:', userId);

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.ico': 'image/x-icon',
      '.ttf': 'font/ttf',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(DIST_DIR, 'index.html')).pipe(res);
  }
});

server.listen(PORT, async () => {
  console.log(`SPA Server running at http://localhost:${PORT}`);
  try {
    await runCapture();
  } catch (err) {
    console.error('Capture failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});

async function runCapture() {
  const profileDir = '/tmp/chrome_capture_profile_' + Date.now();
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profileDir}`,
    '--window-size=412,915',
    '--hide-scrollbars',
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const targets = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    console.log('Connecting to target:', pageTarget.title, pageTarget.webSocketDebuggerUrl);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let nextId = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timeout = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 15000);
        const onMsg = (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === id) {
            clearTimeout(timeout);
            ws.removeEventListener('message', onMsg);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // Emulate modern high-res mobile device (1080x2400)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      fitWindow: false,
    });

    console.log('Navigating to root...');
    await send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await new Promise(r => setTimeout(r, 2000));

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const ym = `${curYear}-${curMonth}`;
    const orgId = 'org-demo-1';

    const demoDB = {
      organizations: [{
        id: orgId,
        name: 'Özkan Tekstil Atölyesi',
        logo_url: null,
        settings: {
          hourlyWageMethod: 'ortalama_takvim',
          overtimeMultiplier: 1.5,
          holidayOvertimeMultiplier: 2.0,
          deductLate: false,
          deductEarlyLeave: true,
          deductSickLeave: true,
          sickLeaveFirstTwoDaysEmployer: false,
          weekRestPenalty: false,
          paydayOfMonth: 5,
          attendanceReminderTime: '18:30',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      org_members: [{
        id: 'mem-1',
        org_id: orgId,
        user_id: userId,
        role: 'owner',
        created_at: new Date().toISOString(),
      }],
      org_invites: [],
      departments: [
        { id: 'dep-1', org_id: orgId, name: 'Dikiş Hattı 1', color: '#3B82F6', sort_order: 1, updated_at: new Date().toISOString() },
        { id: 'dep-2', org_id: orgId, name: 'Dikiş Hattı 2', color: '#10B981', sort_order: 2, updated_at: new Date().toISOString() },
        { id: 'dep-3', org_id: orgId, name: 'Kesimhane', color: '#F59E0B', sort_order: 3, updated_at: new Date().toISOString() },
        { id: 'dep-4', org_id: orgId, name: 'Ütü & Paketleme', color: '#8B5CF6', sort_order: 4, updated_at: new Date().toISOString() },
      ],
      schedule_days: [
        { id: 'sd-1', org_id: orgId, weekday: 1, is_workday: true, start_time: '08:00', end_time: '18:30', breaks: [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-2', org_id: orgId, weekday: 2, is_workday: true, start_time: '08:00', end_time: '18:30', breaks: [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-3', org_id: orgId, weekday: 3, is_workday: true, start_time: '08:00', end_time: '18:30', breaks: [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-4', org_id: orgId, weekday: 4, is_workday: true, start_time: '08:00', end_time: '18:30', breaks: [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-5', org_id: orgId, weekday: 5, is_workday: true, start_time: '08:00', end_time: '18:30', breaks: [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-6', org_id: orgId, weekday: 6, is_workday: false, start_time: '08:00', end_time: '13:00', breaks: [], department_id: null, updated_at: new Date().toISOString() },
        { id: 'sd-7', org_id: orgId, weekday: 7, is_workday: false, start_time: '08:00', end_time: '18:00', breaks: [], department_id: null, updated_at: new Date().toISOString() },
      ],
      calendar_events: [],
      employees: [
        { id: 'emp-1', org_id: orgId, department_id: 'dep-1', full_name: 'Ahmet Yılmaz', phone: '0532 111 22 33', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2023-01-15', end_date: null, active: true, notes: 'Usta Dikişçi', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'emp-2', org_id: orgId, department_id: 'dep-1', full_name: 'Fatma Demir', phone: '0533 222 33 44', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2023-04-10', end_date: null, active: true, notes: 'Overlok Uzmanı', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'emp-3', org_id: orgId, department_id: 'dep-2', full_name: 'Mehmet Kaya', phone: '0535 333 44 55', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2023-06-01', end_date: null, active: true, notes: 'Reçmeci', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'emp-4', org_id: orgId, department_id: 'dep-4', full_name: 'Ayşe Çelik', phone: '0536 444 55 66', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2023-02-20', end_date: null, active: true, notes: 'Son Ütücü', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'emp-5', org_id: orgId, department_id: 'dep-3', full_name: 'Ali Koç', phone: '0537 555 66 77', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2022-11-05', end_date: null, active: true, notes: 'Kesimci', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'emp-6', org_id: orgId, department_id: 'dep-4', full_name: 'Zeynep Şahin', phone: '0538 666 77 88', tc_no: null, iban: null, birth_date: null, address: null, photo_url: null, start_date: '2024-01-08', end_date: null, active: true, notes: 'Paketleme ve Sevkiyat', emergency_contact: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ],
      employee_salaries: [
        { id: 'sal-1', org_id: orgId, employee_id: 'emp-1', amount: 35000, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
        { id: 'sal-2', org_id: orgId, employee_id: 'emp-2', amount: 32000, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
        { id: 'sal-3', org_id: orgId, employee_id: 'emp-3', amount: 33500, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
        { id: 'sal-4', org_id: orgId, employee_id: 'emp-4', amount: 31000, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
        { id: 'sal-5', org_id: orgId, employee_id: 'emp-5', amount: 38000, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
        { id: 'sal-6', org_id: orgId, employee_id: 'emp-6', amount: 29000, effective_from: '2024-01-01', note: 'Aylık Net', created_at: new Date().toISOString() },
      ],
      attendance: [
        { id: 'att-1', org_id: orgId, employee_id: 'emp-1', day: today, status: 'geldi', arrival_time: '08:00', leave_time: '18:30', late_minutes: 0, early_leave_minutes: 0, note: null, updated_at: new Date().toISOString() },
        { id: 'att-2', org_id: orgId, employee_id: 'emp-2', day: today, status: 'geldi', arrival_time: '08:05', leave_time: '18:30', late_minutes: 0, early_leave_minutes: 0, note: null, updated_at: new Date().toISOString() },
        { id: 'att-3', org_id: orgId, employee_id: 'emp-3', day: today, status: 'geldi', arrival_time: '08:00', leave_time: '20:30', late_minutes: 0, early_leave_minutes: 0, note: '+2 saat mesai', updated_at: new Date().toISOString() },
        { id: 'att-4', org_id: orgId, employee_id: 'emp-4', day: today, status: 'geldi', arrival_time: '08:00', leave_time: '18:30', late_minutes: 0, early_leave_minutes: 0, note: null, updated_at: new Date().toISOString() },
        { id: 'att-5', org_id: orgId, employee_id: 'emp-5', day: today, status: 'geldi', arrival_time: '07:55', leave_time: '18:30', late_minutes: 0, early_leave_minutes: 0, note: null, updated_at: new Date().toISOString() },
        { id: 'att-6', org_id: orgId, employee_id: 'emp-6', day: today, status: 'yillik_izin', arrival_time: null, leave_time: null, late_minutes: 0, early_leave_minutes: 0, note: 'Yıllık izinli', updated_at: new Date().toISOString() },
      ],
      attendance_days: [{ id: `attd-${today}`, org_id: orgId, day: today, confirmed: true, updated_at: new Date().toISOString() }],
      overtime: [
        { id: 'ot-1', org_id: orgId, employee_id: 'emp-3', day: today, hours: 2, kind: 'hafta_ici', multiplier: 1.5, calendar_event_id: null, note: 'Sipariş yetiştirme', client_ref: 'ref-1', updated_at: new Date().toISOString() },
      ],
      debts: [
        { id: 'debt-1', org_id: orgId, employee_id: 'emp-1', type: 'avans', amount: 5000, given_at: today, installments: 1, start_month: ym, description: 'Haftalık avans', client_ref: 'ref-d1', updated_at: new Date().toISOString() },
        { id: 'debt-2', org_id: orgId, employee_id: 'emp-2', type: 'avans', amount: 3500, given_at: today, installments: 1, start_month: ym, description: 'Avans ödemesi', client_ref: 'ref-d2', updated_at: new Date().toISOString() },
        { id: 'debt-3', org_id: orgId, employee_id: 'emp-5', type: 'borc', amount: 10000, given_at: today, installments: 2, start_month: ym, description: 'Taşınma borcu', client_ref: 'ref-d3', updated_at: new Date().toISOString() },
      ],
      debt_payments: [
        { id: 'dp-1', org_id: orgId, debt_id: 'debt-1', employee_id: 'emp-1', amount: 2000, paid_at: today, method: 'elden', payroll_item_id: null, note: 'Kısmi elden tahsilat' },
      ],
      leave_adjustments: [],
      payrolls: [
        { id: `pay-${ym}`, org_id: orgId, year: curYear, month: Number(curMonth), status: 'taslak', finalized_at: null, note: null, updated_at: new Date().toISOString() },
      ],
      payroll_items: [
        { id: 'pi-1', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-1', base_salary: 35000, hourly_rate: 155.5, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 0, overtime_pay: 0, bonus: 2000, extra_cut: 0, debt_cut: 3000, debt_override: null, net_payable: 34000, paid_amount: 0, updated_at: new Date().toISOString() },
        { id: 'pi-2', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-2', base_salary: 32000, hourly_rate: 142.2, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 0, overtime_pay: 0, bonus: 0, extra_cut: 0, debt_cut: 3500, debt_override: null, net_payable: 28500, paid_amount: 0, updated_at: new Date().toISOString() },
        { id: 'pi-3', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-3', base_salary: 33500, hourly_rate: 148.8, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 8, overtime_pay: 1785.6, bonus: 1500, extra_cut: 0, debt_cut: 0, debt_override: null, net_payable: 36785.6, paid_amount: 0, updated_at: new Date().toISOString() },
        { id: 'pi-4', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-4', base_salary: 31000, hourly_rate: 137.7, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 0, overtime_pay: 0, bonus: 0, extra_cut: 0, debt_cut: 0, debt_override: null, net_payable: 31000, paid_amount: 0, updated_at: new Date().toISOString() },
        { id: 'pi-5', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-5', base_salary: 38000, hourly_rate: 168.8, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 0, overtime_pay: 0, bonus: 3000, extra_cut: 0, debt_cut: 5000, debt_override: null, net_payable: 36000, paid_amount: 0, updated_at: new Date().toISOString() },
        { id: 'pi-6', org_id: orgId, payroll_id: `pay-${ym}`, employee_id: 'emp-6', base_salary: 29000, hourly_rate: 128.8, planned_days: 22, actual_days: 22, absence_cut: 0, late_cut: 0, early_leave_cut: 0, overtime_hours: 0, overtime_pay: 0, bonus: 0, extra_cut: 0, debt_cut: 0, debt_override: null, net_payable: 29000, paid_amount: 0, updated_at: new Date().toISOString() },
      ],
      salary_payments: [],
    };

    // Helper to capture a tab screen
    async function captureTab(tabName, paraTab, outputFileName) {
      console.log(`Setting tab: ${tabName}, paraTab: ${paraTab || 'none'}...`);
      await send('Runtime.evaluate', {
        expression: `
          localStorage.setItem('sb-rocnibznifkudlsqtatj-auth-token', ${JSON.stringify(JSON.stringify(session))});
          localStorage.setItem('tekstil_local_db', ${JSON.stringify(JSON.stringify(demoDB))});
          localStorage.setItem('initial_tab', '${tabName}');
          ${paraTab ? `localStorage.setItem('para_tab', '${paraTab}');` : ''}
        `
      });
      console.log(`Navigating for ${outputFileName}...`);
      await send('Page.navigate', { url: `http://localhost:${PORT}/(tabs)` });
      await new Promise(r => setTimeout(r, 4500));
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(outputFileName, Buffer.from(data, 'base64'));
      console.log(`Saved screenshot: ${outputFileName}`);
    }

    // Capture 5 core screens!
    await captureTab('index', null, 'raw_screen_1_bugun.png');
    await captureTab('puantaj', null, 'raw_screen_2_puantaj.png');
    await captureTab('personel', null, 'raw_screen_3_personel.png');
    await captureTab('para', 'avans', 'raw_screen_4_para.png');
    await captureTab('para', 'maas', 'raw_screen_5_bordro.png');

    console.log('All 5 core screens captured successfully!');
  } finally {
    chrome.kill();
  }
}
