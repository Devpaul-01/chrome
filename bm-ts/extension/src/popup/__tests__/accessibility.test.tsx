/**
 * Automated accessibility tests using vitest-axe (axe-core).
 *
 * These tests verify WCAG 2.2 AA compliance by running axe-core
 * against rendered component output. They catch issues like:
 *   - Missing ARIA attributes
 *   - Incorrect roles
 *   - Color contrast violations
 *   - Missing labels and alt text
 *   - Invalid heading hierarchy
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { axe } from 'vitest-axe';

import Toast from '../components/Toast';
import HelpTooltip from '../components/HelpTooltip';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

describe('Toast – accessibility', () => {
  it('success toast has no axe violations', async () => {
    const { container } = render(
      <Toast message="Settings saved" type="success" onClose={vi.fn()} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('error toast has no axe violations', async () => {
    const { container } = render(
      <Toast message="Something went wrong" type="error" onClose={vi.fn()} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has role="alert" for screen reader announcements', () => {
    const { container } = render(
      <Toast message="Test" type="info" onClose={vi.fn()} />
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
  });

  it('close button has accessible label', () => {
    const { getByRole } = render(
      <Toast message="Test" type="info" onClose={vi.fn()} />
    );
    expect(getByRole('button', { name: /close notification/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// HelpTooltip
// ---------------------------------------------------------------------------

describe('HelpTooltip – accessibility', () => {
  it('has no axe violations in default (closed) state', async () => {
    const { container } = render(<HelpTooltip label="Helpful info" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('trigger button has accessible label', () => {
    const { getByRole } = render(<HelpTooltip label="Test" />);
    expect(getByRole('button', { name: /help/i })).toBeTruthy();
  });

  it('trigger button has aria-describedby pointing to tooltip id', () => {
    const { getByRole } = render(<HelpTooltip label="Test" id="my-tip" />);
    expect(getByRole('button', { name: /help/i })).toHaveAttribute(
      'aria-describedby',
      'my-tip'
    );
  });
});

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

describe('Spinner – accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<Spinner />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations with message', async () => {
    const { container } = render(<Spinner message="Loading contacts..." />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('wrapper has role="status" for live announcements', () => {
    const { container } = render(<Spinner />);
    const wrapper = container.querySelector('[role="status"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.tagName).toBe('DIV');
  });

  it('has screen-reader-only loading text', () => {
    const { container } = render(<Spinner />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly).toBeTruthy();
    expect(srOnly?.textContent).toContain('Loading');
  });
});
