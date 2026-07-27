// @vitest-environment jsdom
//
// The boundary exists so one broken component can't blank the whole page.
// These tests assert the two properties that matter: sibling content keeps
// rendering, and remounting on a new key clears a latched error (which is how
// switching tabs recovers a crashed screen).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Boom() { throw new Error('kaboom from a tab'); }
function Fine() { return <div>tab rendered fine</div>; }

const swallow = (e) => e.preventDefault();

let container, root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // React rethrows caught errors as a window 'error' event so browser devtools
  // still see them; jsdom then dumps the stack to stderr. These throws are the
  // point of the test, so keep the output readable.
  window.addEventListener('error', swallow);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  window.removeEventListener('error', swallow);
  container.remove();
  root = undefined;
  vi.restoreAllMocks();
});

const render = (ui) => {
  if (!root) root = createRoot(container);
  act(() => root.render(ui));
};

describe('ErrorBoundary', () => {
  it('renders children untouched when nothing throws', () => {
    render(<ErrorBoundary label="Leasing"><Fine /></ErrorBoundary>);

    expect(container.textContent).toContain('tab rendered fine');
    expect(container.textContent).not.toContain('hit an error');
  });

  it('adds no wrapper element in the healthy case', () => {
    // The tab content sits in a flex container that full-bleed screens (Map,
    // Registry) size themselves against. An extra div here would break them.
    render(<ErrorBoundary label="Map"><Fine /></ErrorBoundary>);

    expect(container.children.length).toBe(1);
    expect(container.firstElementChild.tagName).toBe('DIV');
    expect(container.firstElementChild.textContent).toBe('tab rendered fine');
  });

  it('catches a render error and names the screen instead of blanking', () => {
    render(<ErrorBoundary label="Leasing"><Boom /></ErrorBoundary>);

    expect(container.textContent).toContain('Leasing hit an error');
    expect(container.textContent).toContain('kaboom from a tab');
    expect(container.querySelectorAll('button').length).toBe(2); // try again + reload
  });

  it('keeps sibling chrome alive when the wrapped screen throws', () => {
    render(
      <div>
        <nav>sidebar nav</nav>
        <ErrorBoundary label="Leasing"><Boom /></ErrorBoundary>
      </div>,
    );

    // The whole tree used to unmount here — this is the grey-screen guard.
    expect(container.textContent).toContain('sidebar nav');
    expect(container.textContent).toContain('Leasing hit an error');
  });

  it('recovers when the key changes, the way switching tabs does', () => {
    render(<ErrorBoundary key="leasing" label="Leasing"><Boom /></ErrorBoundary>);
    expect(container.textContent).toContain('Leasing hit an error');

    render(<ErrorBoundary key="loans" label="Loans"><Fine /></ErrorBoundary>);
    expect(container.textContent).toContain('tab rendered fine');
    expect(container.textContent).not.toContain('hit an error');
  });

  it('clears the error when Try again is pressed', () => {
    let shouldThrow = true;
    const Flaky = () => (shouldThrow ? <Boom /> : <Fine />);

    render(<ErrorBoundary label="Leasing"><Flaky /></ErrorBoundary>);
    expect(container.textContent).toContain('Leasing hit an error');

    shouldThrow = false;
    const tryAgain = [...container.querySelectorAll('button')].find(b => b.textContent === 'Try again');
    act(() => tryAgain.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.textContent).toContain('tab rendered fine');
  });
});
