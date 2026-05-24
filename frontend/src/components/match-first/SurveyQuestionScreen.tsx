import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import './MatchFirstLanding.css';
import './SurveyShell.css';

interface SurveyQuestionScreenProps {
  progressLabel: string;
  currentStep: number;
  totalSteps: number;
  eyebrowLabel: string;
  title: string;
  helperText: string | null;
  validationId: string;
  showValidation: boolean;
  validationText: string;
  validationRef: RefObject<HTMLParagraphElement | null>;
  syncErrorText?: string | null;
  showBack: boolean;
  backLabel: string;
  nextLabel: string;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
}

export default function SurveyQuestionScreen({
  progressLabel,
  currentStep,
  totalSteps,
  eyebrowLabel,
  title,
  helperText,
  validationId,
  showValidation,
  validationText,
  validationRef,
  syncErrorText,
  showBack,
  backLabel,
  nextLabel,
  children,
  onBack,
  onNext,
}: SurveyQuestionScreenProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [currentStep, title]);

  return (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-shell-title">
      <div className="match-first-landing__content">
        <progress
          className="survey-question__progress"
          role="progressbar"
          aria-label={progressLabel}
          max={totalSteps}
          value={currentStep}
        />
        <p className="match-first-landing__body">{progressLabel}</p>

        <p className="match-first-landing__eyebrow">{eyebrowLabel}</p>
        <h1 id="match-survey-shell-title" ref={titleRef} tabIndex={-1}>{title}</h1>
        {helperText && <p className="match-first-landing__body">{helperText}</p>}

        {children}

        {showValidation && (
          <p
            id={validationId}
            ref={validationRef}
            className="match-first-landing__validation"
            role="alert"
            tabIndex={-1}
          >
            {validationText}
          </p>
        )}
        {syncErrorText && (
          <p className="match-first-landing__validation" role="alert">
            {syncErrorText}
          </p>
        )}
        <div className="match-first-landing__actions">
          {showBack && (
            <button type="button" className="match-first-landing__address-link" onClick={onBack}>
              {backLabel}
            </button>
          )}
          <button type="button" className="match-first-landing__cta" onClick={onNext}>
            {nextLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
