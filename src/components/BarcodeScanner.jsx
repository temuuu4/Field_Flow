import { BrowserMultiFormatReader } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, LoadingState, SectionCard } from '../components/ui';

export default function BarcodeScanner({ onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const detectedRef = useRef(false);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('Start the camera to scan a barcode.');

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  const start = async () => {
    stop();
    detectedRef.current = false;
    setState('requesting');
    setMessage('Requesting camera permission…');

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      setMessage('Camera access is not available in this browser.');
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 });
      setState('loading');
      setMessage('Starting camera…');

      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        videoRef.current,
        (result, error, controls) => {
          if (result && !detectedRef.current) {
            detectedRef.current = true;
            controls.stop();
            controlsRef.current = null;
            setState('detected');
            setMessage(`Barcode detected: ${result.getText()}`);
            onDetected(result.getText());
          } else if (error?.name && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)) {
            setState('invalid');
            setMessage('Unsupported or invalid barcode. Try improving lighting or enter it manually.');
          } else if (!detectedRef.current) {
            setState('scanning');
            setMessage('Scanning for EAN, UPC, CODE-128, or QR…');
          }
        },
      );
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setState(denied ? 'denied' : 'unavailable');
      setMessage(denied ? 'Camera permission denied. Allow camera access or enter the barcode manually.' : 'Camera unavailable. Check whether another app is using it.');
    }
  };

  useEffect(() => {
    start();
    return () => stop();
  }, []);

  const stateIcon = {
    idle: '📷',
    requesting: '⏳',
    loading: '🔄',
    scanning: '🔍',
    detected: '✅',
    denied: '🔒',
    unavailable: '⚠️',
    invalid: '❌',
  };

  const stateLabel = {
    idle: 'READY',
    requesting: 'REQUESTING',
    loading: 'LOADING',
    scanning: 'SCANNING',
    detected: 'DETECTED',
    denied: 'DENIED',
    unavailable: 'UNAVAILABLE',
    invalid: 'INVALID',
  };

  return (
    <div className="scanner">
      <SectionCard
        title="Barcode scanner"
        subtitle="Scan sample barcodes with your device camera"
      >
        <div className="camera" style={{ position: 'relative', overflow: 'hidden', background: '#1d2529', borderRadius: 'var(--radius-lg)', aspectRatio: '4/3' }}>
          <video ref={videoRef} muted playsInline className={state === 'idle' || state === 'unavailable' || state === 'denied' ? 'camera-video hidden' : 'camera-video'} />
          <div className="scan-frame">
            <span>Align barcode inside the frame</span>
          </div>
          <span
            className={`camera-state ${state}`}
            style={{
              position: 'absolute',
              zIndex: 2,
              left: 'var(--space-4)',
              top: 'var(--space-4)',
              padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            {stateIcon[state]} {stateLabel[state] || state.toUpperCase()}
          </span>
        </div>

        <p className={`scanner-message ${state}`} style={{ minHeight: 24, margin: 'var(--space-3) 0', color: state === 'detected' ? 'var(--success)' : 'var(--muted)', fontSize: 'var(--text-sm)' }}>
          {message}
        </p>

        <button className="btn btn-primary" type="button" onClick={start}>
          {state === 'detected' ? 'Scan again' : state === 'scanning' ? 'Restart scanner' : 'Use camera scanner'}
        </button>
      </SectionCard>
    </div>
  );
}
