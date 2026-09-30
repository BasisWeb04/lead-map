// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountyTable } from '../src/components/CountyTable';
import { DetailPanel } from '../src/components/DetailPanel';
import { buildRows } from '../src/lib/view';
import type { County, IndustryRecord } from '../src/lib/types';

afterEach(cleanup);

const counties = new Map<string, County>([
  ['04001', { fips: '04001', name: 'Alpha County', stateFips: '04', stateAbbr: 'AZ', population: 50000, inCbp: true }],
  ['04003', { fips: '04003', name: 'Beta County', stateFips: '04', stateAbbr: 'AZ', population: 20000, inCbp: false }],
]);
const industry = new Map<string, IndustryRecord>([
  ['04001', { est: 7, emp: null, empFlag: 'D', sizes: [null, null, null, null, null, null, null, null, null] }],
]);
const rows = buildRows(counties, industry, 'est', '04');

describe('county table', () => {
  it('shows withheld and absent values as text, never as 0', () => {
    render(<CountyTable rows={rows} sortKey="name" sortDir="asc" onSort={() => {}} selected={null} onSelect={() => {}} showState={false} />);
    const alpha = screen.getByRole('button', { name: 'Alpha County' }).closest('tr')!;
    const beta = screen.getByRole('button', { name: 'Beta County' }).closest('tr')!;
    expect(within(alpha).getByText('not published')).toBeTruthy();
    // establishments, employment and both rates
    expect(within(beta).getAllByText('not published')).toHaveLength(4);
    expect(within(beta).queryByText('0')).toBeNull();
  });

  it('selects a county from the keyboard-reachable name button and sorts from the header', () => {
    const onSelect = vi.fn();
    const onSort = vi.fn();
    render(<CountyTable rows={rows} sortKey="name" sortDir="asc" onSort={onSort} selected={null} onSelect={onSelect} showState={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha County' }));
    expect(onSelect).toHaveBeenCalledWith('04001');
    fireEvent.click(screen.getByRole('button', { name: /Establishments/ }));
    expect(onSort).toHaveBeenCalledWith('est');
    expect(screen.getByRole('columnheader', { name: /County/ }).getAttribute('aria-sort')).toBe('ascending');
  });

  it('detail panel spells out suppressed size classes', () => {
    render(
      <DetailPanel row={rows[0]} metric="est" industryLabel="Test" naics="238220" stateName="Arizona" sizeClasses={['1-4', '5-9', '10-19', '20-49', '50-99', '100-249', '250-499', '500-999', '1000+']} sourceLine="src" />,
    );
    expect(screen.getAllByText('not published (0 to 2)')).toHaveLength(9);
  });
});
