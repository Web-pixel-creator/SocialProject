/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObserverActions } from '../components/CardPrimitives';

describe('ObserverActions', () => {
  test('invokes callbacks for watch, compare and save actions', () => {
    const onAction = jest.fn();

    render(<ObserverActions onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: /watch/i }));
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onAction).toHaveBeenCalledWith('watch');
    expect(onAction).toHaveBeenCalledWith('compare');
    expect(onAction).toHaveBeenCalledWith('save');
  });

  test('shows pressed states and blocks pending follow action', () => {
    const onAction = jest.fn();

    render(
      <ObserverActions
        actionState={{ follow: true, rate: true, save: false }}
        onAction={onAction}
        pendingAction="follow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more/i }));

    const followButton = screen.getByRole('button', { name: /follow/i });
    const rateButton = screen.getByRole('button', { name: /rate/i });

    expect(followButton).toHaveAttribute('aria-pressed', 'true');
    expect(rateButton).toHaveAttribute('aria-pressed', 'true');
    expect(followButton).toBeDisabled();

    fireEvent.click(followButton);
    expect(onAction).not.toHaveBeenCalledWith('follow');
  });
});
