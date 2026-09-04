import { describe, it, expect } from 'vitest';
import { LeafSpinner } from '../LeafSpinner';

describe('LeafSpinner', () => {
  it('renders with default props', () => {
    const el = LeafSpinner({});
    expect(el.props.width).toBe(24);
    expect(el.props.height).toBe(24);
    expect(el.props['aria-label']).toBe('Loading');
    expect(el.props.className).toContain('animate-leaf-sway');
  });

  it('renders with custom props', () => {
    const el = LeafSpinner({ size: 32, className: 'custom-class', label: 'Processing' });
    expect(el.props.width).toBe(32);
    expect(el.props.height).toBe(32);
    expect(el.props['aria-label']).toBe('Processing');
    expect(el.props.className).toContain('custom-class');
    expect(el.props.className).toContain('animate-leaf-sway');
  });
});
