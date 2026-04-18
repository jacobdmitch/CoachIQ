import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayerActionMenu from '../PlayerActionMenu';

const athlete = {
  id: 'a1',
  first_name: 'Jane',
  last_name: 'Doe',
  jersey_number: 7,
};
const anchor = { x: 200, y: 200 };

function renderMenu(overrides = {}) {
  const props = {
    anchor,
    athlete,
    isOnField: true,
    onLogStat: jest.fn(),
    onSubOut:  jest.fn(),
    onSubIn:   jest.fn(),
    onClose:   jest.fn(),
    ...overrides,
  };
  return { props, ...render(<PlayerActionMenu {...props} />) };
}

describe('PlayerActionMenu: field mode', () => {
  test('renders header with jersey number and player name', () => {
    renderMenu();
    expect(screen.getByText('#7 Jane Doe')).toBeInTheDocument();
  });

  test('renders all stat actions plus Sub Out', () => {
    renderMenu();
    for (const label of ['Goal', 'Assist', 'Shot', 'GB', 'Turnover', 'Caused TO', 'Save', 'Penalty']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Sub Out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sub In' })).not.toBeInTheDocument();
  });

  test('clicking a stat action calls onLogStat with the key and closes', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Goal' }));
    expect(props.onLogStat).toHaveBeenCalledWith('GOAL');
    expect(props.onClose).toHaveBeenCalled();
  });

  test('clicking Sub Out calls onSubOut and closes', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sub Out' }));
    expect(props.onSubOut).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('PlayerActionMenu: bench mode', () => {
  test('renders only Sub In', () => {
    renderMenu({ isOnField: false });
    expect(screen.getByRole('button', { name: 'Sub In' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sub Out' })).not.toBeInTheDocument();
  });

  test('clicking Sub In calls onSubIn and closes', () => {
    const { props } = renderMenu({ isOnField: false });
    fireEvent.click(screen.getByRole('button', { name: 'Sub In' }));
    expect(props.onSubIn).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('PlayerActionMenu: dismissal', () => {
  test('pressing Escape calls onClose', () => {
    const { props } = renderMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  test('renders a menu landmark with accessible label', () => {
    renderMenu();
    expect(screen.getByRole('menu', { name: /Actions for #7 Jane Doe/ })).toBeInTheDocument();
  });
});

describe('PlayerActionMenu: missing name fields', () => {
  test('tolerates missing jersey_number and renders name only', () => {
    renderMenu({ athlete: { id: 'a2', first_name: 'Ava', last_name: 'Li' } });
    expect(screen.getByText('Ava Li')).toBeInTheDocument();
  });

  test('falls back to "Player" when name fields are all empty', () => {
    renderMenu({ athlete: { id: 'a3' } });
    expect(screen.getByText('Player')).toBeInTheDocument();
  });
});
