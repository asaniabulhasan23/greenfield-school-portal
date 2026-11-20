import { post, del } from '../api.js';
import { state, refresh } from '../store.js';
import {
  esc, icon, avatar, roleLabel, pageHead, setPageMeta, formFields, toast,
} from '../ui.js';

/* Crop the chosen image to a centred square and shrink it to 512px JPEG. */
function squarePhoto(file, size = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    image.src = url;
  });
}

export async function render(root) {
  const u = state.user;
  const school = state.meta?.school || {};
  setPageMeta('Settings', 'Your profile, security and school details');

  root.innerHTML = `
    ${pageHead('Settings', 'Profile, password and school information')}

    <div class="grid grid--2-1">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Your profile</h3><p>How you appear across the portal</p></div></div>
        <div class="card__body">
          <div class="profile">
            ${avatar(u.name, u.color, 'xl', u.photo)}
            <div class="profile__main">
              <h2 style="font-size:20px">${esc(u.name)}</h2>
              <div class="profile__meta">
                <span>${icon('shield')} ${esc(roleLabel(u.role))}</span>
                ${u.class_name ? `<span>${icon('classes')} ${esc(u.class_name)}</span>` : ''}
                ${u.section_name ? `<span>${icon('sections')} ${esc(u.section_name)}</span>` : ''}
                <span>${icon('mail')} ${esc(u.email)}</span>
                ${u.phone ? `<span>${icon('phone')} ${esc(u.phone)}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="photo-editor">
            <div id="photo-preview">${avatar(u.name, u.color, 'lg', u.photo)}</div>
            <div class="grow">
              <strong style="font-size:13px">Profile photo</strong>
              <p class="small muted" style="margin:3px 0 10px;line-height:1.5">
                Use a clear, recent photo. It is cropped to a square and resized automatically.
              </p>
              <div class="inline" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn--sm btn--primary" id="photo-upload">${icon('camera')} ${u.photo ? 'Change photo' : 'Upload photo'}</button>
                ${u.photo ? `<button class="btn btn--sm btn--ghost" id="photo-remove" style="color:#b91c1c">${icon('trash')} Remove</button>` : ''}
              </div>
            </div>
            <input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" hidden>
          </div>

          <div class="divider"></div>

          <dl class="kv">
            <dt>Account type</dt><dd>${esc(roleLabel(u.role))}</dd>
            <dt>Email</dt><dd>${esc(u.email)}</dd>
            <dt>Phone</dt><dd>${esc(u.phone || '—')}</dd>
            ${u.role === 'student' ? `<dt>Class</dt><dd>${esc(u.class_name || 'Unassigned')}</dd>` : ''}
            ${u.section_name ? `<dt>Section</dt><dd>${esc(u.section_name)}</dd>` : ''}
            ${u.role === 'teacher' ? `<dt>Staff portal</dt><dd>Teaching staff</dd>` : ''}
            <dt>Term</dt><dd>${esc(state.meta?.term || '—')}</dd>
          </dl>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div class="grow"><h3>School details</h3><p>Greenfield Academy</p></div></div>
        <div class="card__body">
          <dl class="kv" style="grid-template-columns:90px 1fr">
            <dt>School</dt><dd>${esc(school.name || 'Greenfield Academy')}</dd>
            <dt>Motto</dt><dd>${esc(school.motto || '—')}</dd>
            <dt>Address</dt><dd>${esc(school.address || '—')}</dd>
            <dt>Phone</dt><dd>${esc(school.phone || '—')}</dd>
            <dt>Email</dt><dd style="word-break:break-word">${esc(school.email || '—')}</dd>
          </dl>
          <div class="divider"></div>
          <div class="note">
            Need to change your name, class or contact details? Contact the school office and an administrator will update your record.
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--2 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Change password</h3><p>Use at least 6 characters</p></div></div>
        <div class="card__body">
          <form id="password-form">
            ${formFields([
    { name: 'current', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password', full: true },
    { name: 'next', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', full: true },
    { name: 'confirm', label: 'Confirm new password', type: 'password', required: true, autocomplete: 'new-password', full: true },
  ])}
            <div class="inline" style="margin-top:16px;justify-content:flex-end">
              <button class="btn btn--primary" type="submit">${icon('key')} Update password</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div class="grow"><h3>Session</h3><p>Signed in on this device</p></div></div>
        <div class="card__body">
          <div class="note">
            Your session is protected with an HTTP-only cookie and expires after 7 days of inactivity.
            Sign out if you are using a shared device.
          </div>
          <div class="inline" style="margin-top:16px;justify-content:space-between">
            <span class="badge badge--green">Session active</span>
            <button class="btn btn--danger" id="settings-logout">${icon('logout')} Sign out</button>
          </div>
        </div>
      </div>
    </div>`;

  const fileInput = document.getElementById('photo-file');

  document.getElementById('photo-upload')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      return toast('Choose a JPEG, PNG or WebP image.', 'error');
    }
    if (file.size > 8 * 1024 * 1024) {
      return toast('That image is too large. Choose one under 8 MB.', 'error');
    }
    const button = document.getElementById('photo-upload');
    if (button) {
      button.disabled = true;
      button.textContent = 'Uploading…';
    }
    try {
      const data = await squarePhoto(file);
      const result = await post('/profile/photo', { data });
      state.user = result.user;
      window.dispatchEvent(new Event('user:updated'));
      toast('Profile photo updated.');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      if (button) {
        button.disabled = false;
        button.innerHTML = `${icon('camera')} ${u.photo ? 'Change photo' : 'Upload photo'}`;
      }
    }
  });

  document.getElementById('photo-remove')?.addEventListener('click', async () => {
    try {
      await del('/profile/photo');
      state.user = { ...state.user, photo: null };
      window.dispatchEvent(new Event('user:updated'));
      toast('Profile photo removed.', 'info');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (!data.current || !data.next) return toast('Fill in every password field.', 'error');
    if (data.next !== data.confirm) return toast('The new passwords do not match.', 'error');
    if (data.next.length < 6) return toast('New password must be at least 6 characters.', 'error');
    try {
      await post('/auth/password', { current: data.current, next: data.next });
      form.reset();
      toast('Password updated successfully.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('settings-logout')?.addEventListener('click', () => {
    document.getElementById('logout')?.click();
  });
}
