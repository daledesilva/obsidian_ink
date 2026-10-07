import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { InkCanvasDrawingMenu } from 'src/components/jsx-components/drawing-menu/ink-canvas-drawing-menu';

//////////
//////////

function renderMenu(props: Partial<React.ComponentProps<typeof InkCanvasDrawingMenu>> = {}) {
	return render(
		<InkCanvasDrawingMenu
			getEditor={() => undefined}
			onStoreChange={() => {}}
			{...props}
		/>,
	);
}

describe('InkCanvasDrawingMenu full screen controls', () => {
	it('shows full screen on an embed', () => {
		const onExpandClick = jest.fn();
		const { getByRole, queryByRole, unmount } = renderMenu({ onExpandClick });
		fireEvent.click(getByRole('button', { name: 'Full screen' }));
		expect(onExpandClick).toHaveBeenCalledTimes(1);
		expect(queryByRole('button', { name: 'Exit full screen' })).toBeNull();
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		unmount();
	});

	it('shows full screen on a dedicated view that is not yet full screen', () => {
		const onEnterWorkspaceChrome = jest.fn();
		const { getByRole, queryByRole, unmount } = renderMenu({ onEnterWorkspaceChrome });
		fireEvent.click(getByRole('button', { name: 'Full screen' }));
		expect(onEnterWorkspaceChrome).toHaveBeenCalledTimes(1);
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		unmount();
	});

	it('places back to the left of exit when full screen was opened from an embed', () => {
		const onExitWorkspaceChrome = jest.fn();
		const onNavigateBack = jest.fn();
		const { getByRole, queryByRole, unmount } = renderMenu({
			isWorkspaceChromeHidden: true,
			showNavigateBack: true,
			onExitWorkspaceChrome,
			onNavigateBack,
		});
		const backButton = getByRole('button', { name: 'Back' });
		const exitButton = getByRole('button', { name: 'Exit full screen' });
		expect(queryByRole('button', { name: 'Full screen' })).toBeNull();
		expect(backButton.compareDocumentPosition(exitButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		fireEvent.click(backButton);
		fireEvent.click(exitButton);
		expect(onNavigateBack).toHaveBeenCalledTimes(1);
		expect(onExitWorkspaceChrome).toHaveBeenCalledTimes(1);
		unmount();
	});

	it('shows only exit full screen when the dedicated view entered full screen itself', () => {
		const { getByRole, queryByRole, unmount } = renderMenu({
			isWorkspaceChromeHidden: true,
			onExitWorkspaceChrome: () => {},
		});
		expect(getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		expect(queryByRole('button', { name: 'Full screen' })).toBeNull();
		unmount();
	});
});
