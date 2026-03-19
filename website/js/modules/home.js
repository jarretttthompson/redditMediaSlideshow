export function initCalendarForm() {
  const form = document.getElementById('calendarSubmitForm');
  const msg = document.getElementById('calendarSubmitMessage');
  if (!form || !msg) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Sending…';
    msg.style.color = 'inherit';

    const body = new URLSearchParams();
    new FormData(form).forEach((v, k) => body.append(k, v));

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body,
        redirect: 'follow',
      });
      const data = await res.json();
      msg.textContent = data.message;
      msg.style.color = data.success ? '#7fdb7f' : '#ff7f7f';
      if (data.success) form.reset();
    } catch {
      msg.textContent = 'Network error — check your connection and try again.';
      msg.style.color = '#ff7f7f';
    }
  });
}
