// Submit button for the authentication forms.
//
// Uses the existing `Button` primitive so the visual style matches the rest
// of the application. `loading` shows a contextual label and the spinner
// from `Button`; the underlying button is `disabled` while the request is
// in flight so accidental double-submission is impossible.

import { Button } from '../ui/Button';

export function AuthSubmitButton({ children, loading, loadingLabel, disabled, type = 'submit' }) {
  return (
    <Button type={type} variant="primary" size="lg" loading={loading} disabled={disabled || loading} className="auth-submit">
      {loading && loadingLabel ? loadingLabel : children}
    </Button>
  );
}