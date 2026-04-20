(function () {
  const SITE_LANGUAGE_KEY = 'buurtcheck_lang';
  const APP_LANGUAGE_KEY = 'i18nextLng';
  const SUPPORTED_LANGUAGES = ['nl', 'en'];

  function normalizeLanguage(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('nl')) return 'nl';
    if (trimmed.startsWith('en')) return 'en';
    return null;
  }

  function readStoredLanguage(key) {
    try {
      return normalizeLanguage(window.localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function resolveInitialLanguage() {
    return readStoredLanguage(SITE_LANGUAGE_KEY)
      || readStoredLanguage(APP_LANGUAGE_KEY)
      || normalizeLanguage(document.documentElement.dataset.language)
      || normalizeLanguage(document.documentElement.lang)
      || 'nl';
  }

  function persistLanguage(language) {
    try {
      window.localStorage.setItem(SITE_LANGUAGE_KEY, language);
      window.localStorage.setItem(APP_LANGUAGE_KEY, language);
    } catch {
      // Ignore storage failures and keep the current view working.
    }
  }

  function syncLanguageGroups(language) {
    document.querySelectorAll('[data-lang-group]').forEach((group) => {
      const variants = Array.from(group.children).filter((node) => node.hasAttribute('data-lang'));
      const preferred = variants.find((node) => normalizeLanguage(node.getAttribute('data-lang')) === language)
        || variants.find((node) => normalizeLanguage(node.getAttribute('data-lang')) === 'nl')
        || variants[0];

      variants.forEach((node) => {
        node.hidden = node !== preferred;
      });

      if (preferred) {
        group.dataset.activeLang = preferred.getAttribute('data-lang') || language;
      } else {
        group.removeAttribute('data-active-lang');
      }
    });
  }

  function syncLanguageControls(language) {
    document.querySelectorAll('[data-language-choice]').forEach((button) => {
      const isActive = button.getAttribute('data-language-choice') === language;
      button.dataset.active = isActive ? 'true' : 'false';
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function syncLanguageLabels(language) {
    document.querySelectorAll('[data-language-label-nl][data-language-label-en]').forEach((element) => {
      const label = language === 'nl'
        ? element.getAttribute('data-language-label-nl')
        : element.getAttribute('data-language-label-en');
      if (label) {
        element.setAttribute('aria-label', label);
      }
    });
  }

  function syncMetadata(language) {
    const pageRoot = document.querySelector('.legal-page');
    if (!(pageRoot instanceof HTMLElement)) {
      return;
    }

    const title = pageRoot.dataset[`pageTitle${language === 'nl' ? 'Nl' : 'En'}`];
    if (title) {
      document.title = title;
    }

    const description = pageRoot.dataset[`pageDescription${language === 'nl' ? 'Nl' : 'En'}`];
    const meta = document.querySelector('meta[name="description"]');
    if (description && meta instanceof HTMLMetaElement) {
      meta.setAttribute('content', description);
    }
  }

  function applyLanguage(language) {
    const normalized = SUPPORTED_LANGUAGES.includes(language) ? language : 'nl';
    document.documentElement.lang = normalized;
    document.documentElement.dataset.language = normalized;
    if (document.body) {
      document.body.lang = normalized;
      document.body.dataset.language = normalized;
    }

    document.querySelectorAll('[data-language-root]').forEach((node) => {
      node.lang = normalized;
    });

    syncLanguageGroups(normalized);
    syncLanguageControls(normalized);
    syncLanguageLabels(normalized);
    syncMetadata(normalized);
    persistLanguage(normalized);
  }

  function activateLanguageButton(button, options) {
    const nextLanguage = normalizeLanguage(button?.getAttribute('data-language-choice'));
    if (!nextLanguage) {
      return;
    }

    applyLanguage(nextLanguage);

    if (options?.focus) {
      button.focus();
    }
  }

  function getLanguageButtons() {
    return Array.from(document.querySelectorAll('[data-language-choice]'));
  }

  function moveLanguageSelection(currentButton, direction) {
    const buttons = getLanguageButtons();
    const currentIndex = buttons.indexOf(currentButton);
    if (currentIndex === -1 || buttons.length === 0) {
      return;
    }

    const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
    activateLanguageButton(buttons[nextIndex], { focus: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyLanguage(resolveInitialLanguage());

    getLanguageButtons().forEach((button, index, buttons) => {
      button.addEventListener('click', () => activateLanguageButton(button));

      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveLanguageSelection(button, 1);
          return;
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveLanguageSelection(button, -1);
          return;
        }

        if (event.key === 'Home') {
          event.preventDefault();
          activateLanguageButton(buttons[0], { focus: true });
          return;
        }

        if (event.key === 'End') {
          event.preventDefault();
          activateLanguageButton(buttons[buttons.length - 1], { focus: true });
          return;
        }

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          activateLanguageButton(button, { focus: true });
        }
      });
    });
  });
}());
