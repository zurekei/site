const WORKER_URL = 'https://contact-backend.invalid';

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
    const res = await fetch(WORKER_URL, {
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
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
