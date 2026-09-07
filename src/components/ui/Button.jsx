import { forwardRef } from 'react';

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

const sizes = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className = '', loading = false, disabled = false, children, ...props },
  ref
) {
  const classes = ['btn', variants[variant] || '', sizes[size] || '', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      <span className={loading ? 'btn-text-loading' : ''}>{children}</span>
    </button>
  );
});
