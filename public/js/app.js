import { get, post } from './api.js';
import { state, loadMeta, navigate } from './store.js';
import { setPageMeta, icon, esc, roleLabel, avatar, toast } from './ui.js';

import * as dashboard from './views/dashboard.js?v=12';
import * as students from './views/students.js?v=12';
import * as teachers from './views/teachers.js?v=12';
import * as classesView from './views/classes.js?v=12';
import * as sections from './views/sections.js?v=12';
import * as attendance from './views/attendance.js?v=12';
import * as grades from './views/grades.js?v=12';
import * as timetable from './views/timetable.js?v=12';
import * as announcements from './views/announcements.js?v=12';
import * as fees from './views/fees.js?v=12';
import * as reports from './views/reports.js?v=12';
import * as settings from './views/settings.js?v=12';

/* ── Route table ────────────────────────────────────────── */

const ROUTES = [
  { path: 'dashboard', roles: ['admin', 'teacher', 'student'], view: dashboard },
  { path: 'students/:id', roles: ['admin', 'teacher', 'student'], view: students },
  { path: 'students', roles: ['admin', 'teacher'], view: students },
  { path: 'teachers', roles: ['admin'], view: teachers },
  { path: 'classes', roles: ['admin', 'teacher'], view: classesView },
  { path: 'sections', roles: ['admin', 'teacher', 'student'], view: sections },
  { path: 'attendance', roles: ['admin', 'teacher', 'student'], view: attendance },
  { path: 'grades', roles: ['admin', 'teacher', 'student'], view: grades },
  { path: 'timetable', roles: ['admin', 'teacher', 'student'], view: timetable },
  { path: 'announcements', roles: ['admin', 'teacher', 'student'], view: announcements },
  { path: 'fees', roles: ['admin', 'teacher', 'student'], view: fees },
  { path: 'reports', roles: ['admin', 'teacher'], view: reports },
  { path: 'settings', roles: ['admin', 'teacher', 'student'], view: settings },
];

const NAV = {
  admin: [
    { section: 'Overview' },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { section: 'Academics' },
    { key: 'students', label: 'Students', icon: 'students' },
    { key: 'teachers', label: 'Teachers', icon: 'teacher' },
    { key: 'classes', label: 'Classes', icon: 'classes' },
    { key: 'sections', label: 'Sections', icon: 'sections' },
    { key: 'attendance', label: 'Attendance', icon: 'attendance' },
    { key: 'grades', label: 'Grades', icon: 'grades' },
    { key: 'timetable', label: 'Timetable', icon: 'timetable' },
    { section: 'School' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements' },
    { key: 'fees', label: 'Fees', icon: 'fees' },
    { key: 'reports', label: 'Reports', icon: 'reports' },
    { section: 'Account' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
  teacher: [
    { section: 'Overview' },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { section: 'Teaching' },
    { key: 'classes', label: 'My classes', icon: 'classes' },
    { key: 'sections', label: 'Sections', icon: 'sections' },
    { key: 'students', label: 'Students', icon: 'students' },
    { key: 'attendance', label: 'Attendance', icon: 'attendance' },
    { key: 'grades', label: 'Grades', icon: 'grades' },
    { key: 'timetable', label: 'Timetable', icon: 'timetable' },
    { section: 'School' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements' },
    { key: 'fees', label: 'Fee status', icon: 'fees' },
    { section: 'Account' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
  student: [
    { section: 'Overview' },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { section: 'My academics' },
    { key: 'grades', label: 'My results', icon: 'grades' },
    { key: 'attendance', label: 'My attendance', icon: 'attendance' },
    { key: 'timetable', label: 'Timetable', icon: 'timetable' },
    { section: 'School' },
    { key: 'sections', label: 'Sections', icon: 'sections' },
    { key: 'fees', label: 'My fees', icon: 'fees' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements' },
    { section: 'Account' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
};

/* Student "My attendance" is rendered by the attendance view */
let renderToken = 0;
let booted = false;

/* ── Login ──────────────────────────────────────────────── */

const loginScreen = document.getElementById('login');
const appScreen = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-submit');

function showLogin(message = '') {
  appScreen.hidden = true;
  loginScreen.hidden = false;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
  setTimeout(() => document.getElementById('login-email')?.focus(), 120);
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    showLoginError('Enter your email and password.');
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';
  try {
    const { user } = await post('/auth/login', { email, password });
    state.user = user;
    await loadMeta(true);
    enterApp();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign in';
  }
});

document.querySelectorAll('.chip[data-email]').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.getElementById('login-email').value = chip.dataset.email;
    document.getElementById('login-password').value = chip.dataset.password;
    loginError.hidden = true;
  });
});

document.getElementById('toggle-password')?.addEventListener('click', (e) => {
  const input = document.getElementById('login-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  e.currentTarget.style.color = show ? 'var(--primary)' : '';
});

document.getElementById('login-year').textContent = new Date().getFullYear();

/* ── App shell ──────────────────────────────────────────── */

function enterApp() {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  document.body.style.background = 'var(--bg)';

  paintUser();
  buildNav(state.user.role);

  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    location.replace('#/dashboard');
  }
  renderRoute();
}

function replaceAvatar(id, html) {
  const current = document.getElementById(id);
  if (current) current.outerHTML = html.replace('<div class="', `<div id="${id}" class="`);
}

function paintUser() {
  const u = state.user;
  if (!u) return;
  const color = u.color || '#4f46e5';
  replaceAvatar('sidebar-avatar', avatar(u.name, color, '', u.photo));
  replaceAvatar('topbar-avatar', avatar(u.name, color, 'sm', u.photo));
  const name = document.getElementById('sidebar-name');
  if (name) name.textContent = u.name;
  const role = document.getElementById('sidebar-role');
  if (role) {
    role.textContent = roleLabel(u.role)
      + (u.class_name ? ` · ${u.class_name}` : u.section_name ? ` · ${u.section_name}` : '');
  }
  const term = document.getElementById('sidebar-term');
  if (term) term.textContent = state.meta?.term || 'Current term';
  const now = new Date();
  const date = document.getElementById('topbar-date');
  if (date) {
    date.textContent = now.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}

function buildNav(role) {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV[role].map((item) => {
    if (item.section) return `<div class="nav__section">${esc(item.section)}</div>`;
    const target = item.href || item.key;
    return `<button class="nav__link" data-nav="${esc(target)}" data-key="${esc(item.key)}">
      ${icon(item.icon)}<span>${esc(item.label)}</span>
    </button>`;
  }).join('');

  nav.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.nav);
      closeSidebar();
    });
  });
}

function markNav(segment) {
  document.querySelectorAll('.nav__link').forEach((btn) => {
    const key = btn.dataset.key;
    const active = key === segment || (segment === 'students' && key === 'students');
    btn.classList.toggle('is-active', active);
  });
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('is-open');
  document.getElementById('sidebar-overlay').classList.add('is-open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('is-open');
  document.getElementById('sidebar-overlay').classList.remove('is-open');
}

document.getElementById('menu-toggle').addEventListener('click', openSidebar);
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

document.getElementById('logout').addEventListener('click', async () => {
  try { await post('/auth/logout', {}); } catch { /* ignore */ }
  state.user = null;
  state.meta = null;
  showLogin();
  location.hash = '';
  toast('You have been signed out.', 'info');
});

/* ── Routing ────────────────────────────────────────────── */

function parseHash() {
  let raw = location.hash.replace(/^#\/?/, '').trim();
  if (!raw) raw = 'dashboard';
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const segment = parts[0];
  const key = segment === 'students' && parts[1] ? 'students/:id' : segment;
  return {
    key,
    params: parts.slice(1),
    segment,
    query: new URLSearchParams(queryPart),
  };
}

function findRoute(key) {
  return ROUTES.find((r) => r.path === key) || null;
}

async function renderRoute() {
  if (!state.user) return;
  const { key, params, segment } = parseHash();
  const route = findRoute(key);

  if (!route || !route.roles.includes(state.user.role)) {
    navigate('dashboard');
    return;
  }

  const token = ++renderToken;
  const view = document.getElementById('view');
  markNav(segment);
  setPageMeta('Loading…', '');
  view.style.opacity = '.55';

  try {
    await route.view.render(view, params);
    if (token !== renderToken) return;
    view.style.opacity = '1';
    view.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (err) {
    if (token !== renderToken) return;
    view.style.opacity = '1';
    if (err.status === 401) return;
    view.innerHTML = `<div class="card"><div class="empty">
      <div class="empty__icon">${icon('alert')}</div>
      <h4>Could not load this page</h4>
      <p>${esc(err.message || 'Please try again.')}</p>
      <button class="btn btn--soft mt-2" id="retry-view">${icon('refresh')} Try again</button>
    </div></div>`;
    document.getElementById('retry-view')?.addEventListener('click', () => renderRoute());
  }
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('app:refresh', renderRoute);
window.addEventListener('user:updated', paintUser);
window.addEventListener('auth:expired', () => {
  if (!state.user) return;
  state.user = null;
  state.meta = null;
  showLogin('Your session expired. Please sign in again.');
});

/* ── Boot ───────────────────────────────────────────────── */

(async function boot() {
  if (booted) return;
  booted = true;
  try {
    const { user } = await get('/auth/me');
    state.user = user;
    await loadMeta(true);
    enterApp();
  } catch {
    showLogin();
  }
})();
