// Same-origin Pages Function (functions/api/contact.js). Deliberately a relative
// path: an absolute URL here would publish the backend's hostname to every visitor.
const ENDPOINT = '/api/contact';

document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');

  const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
  if (!turnstileToken) {
    errorMsg.classList.add('show');
    return;
  }

  btn.disabled = true;
  const originalText = btn.dataset.text;
  btn.textContent = '送信中...';
  successMsg.classList.remove('show');
  errorMsg.classList.remove('show');

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        affiliation: document.getElementById('affiliation').value,
        message: document.getElementById('message').value,
        turnstileToken,
      }),
    });

    const data = await res.json();
    if (data.success) {
      successMsg.classList.add('show');
      document.getElementById('contactForm').reset();
      if (window.turnstile) window.turnstile.reset();
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    errorMsg.classList.add('show');
    // A Turnstile token is single-use. Without resetting here, every retry after a
    // failure reuses the spent token and is rejected as a duplicate — so a transient
    // error would look permanent, and the real cause would be masked.
    if (window.turnstile) window.turnstile.reset();
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
