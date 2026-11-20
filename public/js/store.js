import { get } from './api.js';

export const state = {
  user: null,
  meta: null,
};

export async function loadMeta(force = false) {
  if (state.meta && !force) return state.meta;
  state.meta = await get('/meta');
  return state.meta;
}

export const meta = () => state.meta || {};
export const classes = () => meta().classes || [];
export const sections = () => meta().sections || [];
export const subjects = () => meta().subjects || [];
export const teachers = () => meta().teachers || [];

export function className(id) {
  const c = classes().find((x) => Number(x.id) === Number(id));
  return c ? c.name : '—';
}

export function navigate(path) {
  const target = '#/' + String(path).replace(/^#?\/?/, '');
  if (location.hash === target) {
    window.dispatchEvent(new Event('app:refresh'));
  } else {
    location.hash = target;
  }
}

export function refresh() {
  window.dispatchEvent(new Event('app:refresh'));
}

export const isStaff = () => state.user?.role === 'admin' || state.user?.role === 'teacher';
export const isAdmin = () => state.user?.role === 'admin';
export const isStudent = () => state.user?.role === 'student';
