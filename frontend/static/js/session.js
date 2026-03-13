/**
 * session.js — Oturum yönetimi (localStorage tabanlı, sunucu yok)
 *
 * Kullanım:
 *   import { session } from './session.js';
 *   session.get()       → sicil no string veya null
 *   session.set(sicil)  → kaydeder
 *   session.clear()     → siler
 */

const KEY = 'qc_session_user';

export const session = {
  get()         { return localStorage.getItem(KEY) || null; },
  set(sicil)    { localStorage.setItem(KEY, sicil.trim()); },
  clear()       { localStorage.removeItem(KEY); },
};
