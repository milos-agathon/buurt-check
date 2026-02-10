import { useState, useEffect, useRef } from 'react';
import BuildingAnimation from './BuildingAnimation';
import './LoadingScreen.css';

interface LoadingScreenProps {
  address: string;
  progressText?: string;
}

const PROGRESS_MESSAGES = [
  'Finding building...',
  'Loading 3D model...',
  'Checking noise levels...',
  'Sampling air quality...',
  'Analyzing climate stress...',
  'Computing sunlight...',
];

export default function LoadingScreen({ address, progressText }: LoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (progressText) return;

    intervalRef.current = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % PROGRESS_MESSAGES.length);
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [progressText]);

  const displayText = progressText || PROGRESS_MESSAGES[messageIndex];

  return (
    <div className="loading-screen" data-testid="loading-screen">
      <h2 className="loading-screen__address">{address}</h2>
      <div className="loading-screen__animation">
        <BuildingAnimation />
      </div>
      <div className="loading-screen__progress">
        <div className="loading-screen__dot" />
        <p className="loading-screen__text">{displayText}</p>
      </div>
      <div className="loading-screen__bar-track">
        <div className="loading-screen__bar-fill" />
      </div>
    </div>
  );
}
