import React from 'react';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'default';
}
export const Btn: React.FC<BtnProps> = ({ variant = 'primary', children, className = '', ...props }) => (
  <button
    className={`btn ${variant === 'danger' ? 'btn-danger' : variant === 'default' ? 'btn-default' : ''} ${className}`}
    {...props}
  >
    {children}
  </button>
);

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}
export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange }) => (
  <label style={{ marginRight: 10, cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    {' '}{label}
  </label>
);

interface SelectProps {
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}
export const Select: React.FC<SelectProps> = ({ value, options, onChange, style }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    style={{ padding: 4, ...style }}
  >
    {options.map(o => (
      <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
    ))}
  </select>
);

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
}
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled = false, size = 'small' }) => {
  const w = size === 'medium' ? 40 : 36;
  const h = size === 'medium' ? 22 : 20;
  const knobSize = size === 'medium' ? 18 : 16;
  const offset = checked ? w - knobSize - 2 : 2;
  return (
    <span
      onClick={disabled ? undefined : onChange}
      title={checked ? '开' : '关'}
      style={{
        display: 'inline-block', width: w, height: h, borderRadius: h / 2,
        background: checked ? '#4caf50' : '#ccc', position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: offset,
        width: knobSize, height: knobSize, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </span>
  );
};

interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}
export const SearchInput: React.FC<SearchInputProps> = ({ placeholder = '搜索...', value, onChange }) => (
  <div className="search-box">
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}
export const ModalShell: React.FC<ModalShellProps> = ({ open, onClose, title, children, footer, maxWidth }) => {
  if (!open) return null;
  return (
    <div className="modal" style={{ display: 'block' }}>
      <div className="modal-content" style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <span className="close-btn" onClick={onClose}>&times;</span>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
