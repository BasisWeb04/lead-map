// @vitest-environment jsdom
// End-to-end render of the app on the real processed data; the map file is served from node_modules.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';

const require = createRequire(import.meta.url);
const atlas = readFileSync(require.resolve('us-atlas/counties-10m.json'), 'utf8');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(atlas, { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('app', () => {
  it('opens on Arizona with 15 counties in both the table and the map', async () => {
    const { container } = render(<App />);
    await screen.findByRole('button', { name: 'Maricopa County' });
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(16);
    await waitFor(() => expect(container.querySelectorAll('path.lm-county')).toHaveLength(15));
    expect(screen.getByText('Demo with public Census data.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Built by Ethan Chacko' }).getAttribute('href')).toBe('https://ethanchacko.com');
  });

  it('shows the Maricopa detail with the golden count and computed rate', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Maricopa County' }));
    const panel = screen.getByRole('region', { name: /Maricopa County, AZ/ });
    expect(within(panel).getByText('1,558')).toBeTruthy();
    expect(within(panel).getByText('23,816')).toBeTruthy();
    expect(within(panel).getByText('3.42')).toBeTruthy();
    expect(within(panel).getByText(/of 15, by establishments per 10,000 residents/)).toBeTruthy();
  });

  it('shows Greenlee as a true zero for plumbing, not as not published', async () => {
    render(<App />);
    const row = (await screen.findByRole('button', { name: 'Greenlee County' })).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[0].textContent).toBe('0');
    expect(cells[1].textContent).toBe('0');
  });
});
