// Same-origin Pages Function (functions/api/contact.js). Deliberately a relative
// path: an absolute URL here would publish the backend's hostname to every visitor.
const ENDPOINT = '/api/contact';

const T = {
  ja: {
    back: "← 指標一覧",
    title: "お問い合わせ",
    lead: "ズレ計についてのご質問、データの誤りご指摘、見通し値・実績値の修正提案などはこちらから。",
    labelName: "お名前",
    labelEmail: "メールアドレス",
    labelAffiliation: "所属・肩書",
    labelMessage: "お問い合わせ内容",
    phName: "例：山田 太郎",
    phEmail: "example@email.com",
    phAffiliation: "例：○○大学 経済学部（任意）",
    phMessage: "ご質問・ご指摘をご記入ください",
    submit: "送信する",
    submitting: "送信中...",
    success: "✓ お問い合わせを受け付けました。ご返信までお待たせする場合がございます。",
    error: "× 送信に失敗しました。時間をおいて再度お試しください。",
    footerIndex: "指標一覧へ",
    footerCorrections: "訂正履歴",
    footerAbout: "このサイトについて",
  },
  en: {
    back: "← Indicators",
    title: "Contact",
    lead: "Questions about this site, corrections to the data, and proposed revisions to forecast or actual figures all go here.",
    labelName: "Name",
    labelEmail: "Email",
    labelAffiliation: "Affiliation or title",
    labelMessage: "Message",
    phName: "e.g. Taro Yamada",
    phEmail: "example@email.com",
    phAffiliation: "e.g. University of Tokyo, Faculty of Economics (optional)",
    phMessage: "Your question or correction",
    submit: "Send",
    submitting: "Sending...",
    success: "✓ Your message has been received. A reply may take some time.",
    error: "× Sending failed. Please try again later.",
    footerIndex: "Indicators",
    footerCorrections: "Corrections",
    footerAbout: "About this site",
  },
};

let lang = "ja";

function applyI18n() {
  const t = T[lang];
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  const ph = (id, text) => { document.getElementById(id).placeholder = text; };

  set("t-back", t.back);
  set("contact-title", t.title);
  set("contact-lead", t.lead);
  // The red asterisk lives inside the label, so replace the markup rather than the
  // text — textContent alone would drop the required-field marker.
  document.getElementById("label-name").innerHTML = `${t.labelName}<span>*</span>`;
  document.getElementById("label-email").innerHTML = `${t.labelEmail}<span>*</span>`;
  document.getElementById("label-affiliation").textContent = t.labelAffiliation;
  document.getElementById("label-message").innerHTML = `${t.labelMessage}<span>*</span>`;
  ph("name", t.phName);
  ph("email", t.phEmail);
  ph("affiliation", t.phAffiliation);
  ph("message", t.phMessage);
  set("successMsg", t.success);
  set("errorMsg", t.error);
  set("t-footer-index", t.footerIndex);
  set("t-footer-corrections", t.footerCorrections);
  set("t-footer-about", t.footerAbout);

  // dataset.text is what the submit handler restores after a send, so it has to
  // follow the language too — otherwise the button reverts to the previous one.
  const btn = document.getElementById("submitBtn");
  btn.dataset.text = t.submit;
  if (!btn.disabled) btn.textContent = t.submit;

  document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
  document.getElementById("lang-en").classList.toggle("active", lang === "en");
  document.documentElement.lang = lang;
}

document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; applyI18n(); });
document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; applyI18n(); });

applyI18n();

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
  btn.textContent = T[lang].submitting;
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
