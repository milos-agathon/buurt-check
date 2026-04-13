(function () {
  const CONSENT_KEY = 'buurtcheck_analytics_consent';

  function getLanguage() {
    const lang = document.documentElement.lang || 'en';
    return lang.toLowerCase().startsWith('nl') ? 'nl' : 'en';
  }

  function resolveTexts() {
    if (getLanguage() === 'nl') {
      return {
        title: 'Analytics',
        body: 'Sta privacyvriendelijke Google Analytics toe zodat we kunnen zien hoe de site wordt gebruikt en de ervaring kunnen verbeteren.',
        note: 'Advertentiefuncties blijven uitgeschakeld. Je keuze geldt voor buurt-check.nl en app.buurt-check.nl.',
        accept: 'Analytics toestaan',
        reject: 'Alleen essentieel',
      };
    }

    return {
      title: 'Analytics',
      body: 'Allow privacy-safe Google Analytics so we can understand how the site is used and improve the experience.',
      note: 'Advertising features stay disabled. Your choice applies across buurt-check.nl and app.buurt-check.nl.',
      accept: 'Allow analytics',
      reject: 'Essential only',
    };
  }

  function readStoredConsent() {
    const cookiePrefix = `${CONSENT_KEY}=`;
    const cookieValue = document.cookie
      .split(';')
      .map((segment) => segment.trim())
      .find((segment) => segment.startsWith(cookiePrefix));
    if (cookieValue) {
      const value = decodeURIComponent(cookieValue.slice(cookiePrefix.length));
      if (value === 'granted' || value === 'denied') {
        return value;
      }
    }

    try {
      const storedValue = localStorage.getItem(CONSENT_KEY);
      if (storedValue === 'granted' || storedValue === 'denied') {
        return storedValue;
      }
    } catch (error) {
      // Ignore storage failures and fall back to the cookie only.
    }

    return '';
  }

  function resolveCookieDomain() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'buurt-check.nl' || hostname.endsWith('.buurt-check.nl')) {
      return '.buurt-check.nl';
    }
    return '';
  }

  function persistConsent(value) {
    const cookieParts = [
      `${CONSENT_KEY}=${encodeURIComponent(value)}`,
      'Path=/',
      'Max-Age=31536000',
      'SameSite=Lax',
    ];
    const domain = resolveCookieDomain();
    if (domain) {
      cookieParts.push(`Domain=${domain}`);
    }
    if (window.location.protocol === 'https:') {
      cookieParts.push('Secure');
    }
    document.cookie = cookieParts.join('; ');

    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (error) {
      // Ignore storage failures and keep the cross-domain cookie as the source of truth.
    }
  }

  function updateGoogleConsent(value) {
    if (typeof window.gtag !== 'function') {
      return;
    }

    window.gtag('consent', 'update', {
      analytics_storage: value === 'granted' ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
    });
  }

  function buildBanner() {
    const texts = resolveTexts();
    const banner = document.createElement('section');
    banner.className = 'landing-consent-banner';
    banner.setAttribute('aria-label', texts.title);
    banner.innerHTML = `
      <div class="landing-consent-banner__content">
        <h2 class="landing-consent-banner__title"></h2>
        <p class="landing-consent-banner__body"></p>
        <p class="landing-consent-banner__note"></p>
      </div>
      <div class="landing-consent-banner__actions">
        <button type="button" class="landing-consent-banner__button landing-consent-banner__button--ghost" data-consent-choice="denied"></button>
        <button type="button" class="landing-consent-banner__button landing-consent-banner__button--primary" data-consent-choice="granted"></button>
      </div>
    `;

    banner.querySelector('.landing-consent-banner__title').textContent = texts.title;
    banner.querySelector('.landing-consent-banner__body').textContent = texts.body;
    banner.querySelector('.landing-consent-banner__note').textContent = texts.note;
    banner.querySelector('[data-consent-choice="denied"]').textContent = texts.reject;
    banner.querySelector('[data-consent-choice="granted"]').textContent = texts.accept;
    return banner;
  }

  function initConsentBanner() {
    if (!window.__landingGaMeasurementId || readStoredConsent()) {
      return;
    }

    const banner = buildBanner();
    banner.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest('[data-consent-choice]')
        : null;
      const choice = target?.getAttribute('data-consent-choice');
      if (choice !== 'granted' && choice !== 'denied') {
        return;
      }

      persistConsent(choice);
      updateGoogleConsent(choice);
      banner.remove();
    });

    document.body.appendChild(banner);
  }

  document.addEventListener('DOMContentLoaded', initConsentBanner);
}());
