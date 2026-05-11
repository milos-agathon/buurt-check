import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './SharePackSheet.css';

interface SharePackSheetProps {
  shareUrl?: string;
  providerUnavailable?: boolean;
  onCopyLink: () => void;
  onEmail: (email: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SharePackSheet({
  shareUrl,
  providerUnavailable = false,
  onCopyLink,
  onEmail,
  onDelete,
  onClose,
}: SharePackSheetProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [emailConsent, setEmailConsent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const emailReady = isValidEmail(email) && emailConsent;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section
      className="share-pack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-pack-title"
      data-testid="share-pack-sheet"
    >
      <div className="share-pack__panel">
        <div className="share-pack__header">
          <div>
            <p className="share-pack__eyebrow">{t('prebid.share.packEyebrow', 'Scoped pack share')}</p>
            <h2 id="share-pack-title">{t('prebid.share.packTitle', 'Share the Questions Pack')}</h2>
          </div>
          <button ref={closeRef} type="button" className="share-pack__close" onClick={onClose}>
            {t('common.close', 'Close')}
          </button>
        </div>

        <p className="share-pack__body">
          {t('prebid.share.body', 'Sharing creates a scoped link for this pack. It does not expose a raw report ID as an access token.')}
        </p>

        {providerUnavailable && (
          <div className="share-pack__fallback" role="status">
            <strong>{t('prebid.share.providerUnavailable', 'Email provider unavailable')}</strong>
            <span>{t('prebid.share.providerFallback', 'Use the scoped copy-link fallback below.')}</span>
          </div>
        )}

        <div className="share-pack__copy">
          {shareUrl && <code>{shareUrl}</code>}
          <button type="button" onClick={onCopyLink}>
            {t('prebid.share.copyLink', 'Copy scoped link')}
          </button>
        </div>

        <form
          className="share-pack__email"
          onSubmit={(event) => {
            event.preventDefault();
            if (emailReady) onEmail(email.trim());
          }}
        >
          <label>
            <span>{t('prebid.share.emailLabel', 'Email address')}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="share-pack__consent">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(event) => setEmailConsent(event.target.checked)}
            />
            <span>{t('prebid.share.emailConsent', 'I have permission to use this email address for this share link.')}</span>
          </label>
          <button type="submit" disabled={!emailReady}>
            {t('prebid.share.sendEmail', 'Create email share')}
          </button>
        </form>

        {onDelete && (
          <div className="share-pack__delete">
            {!deleteConfirm ? (
              <button type="button" onClick={() => setDeleteConfirm(true)}>
                {t('prebid.share.deleteStart', 'Delete or revoke access')}
              </button>
            ) : (
              <div role="group" aria-label={t('prebid.share.deleteConfirmLabel', 'Confirm delete or revoke')}>
                <p>{t('prebid.share.deleteConfirm', 'This revokes shared access for this scoped link and updates the recovery state.')}</p>
                <button type="button" onClick={onDelete}>
                  {t('prebid.share.deleteConfirmCta', 'Confirm delete or revoke')}
                </button>
                <button type="button" onClick={() => setDeleteConfirm(false)}>
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
