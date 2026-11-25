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
		expect(queryByRole('button', { name: 'Locate' })).toBeNull();
		unmount();
	});

	it('shows full screen then locate on a dedicated view that is not yet full screen', () => {
		const onEnterWorkspaceChrome = jest.fn();
		const onLocateFile = jest.fn();
		const { getByRole, queryByRole, unmount } = renderMenu({
			onEnterWorkspaceChrome,
			onLocateFile,
		});
		const fullScreenButton = getByRole('button', { name: 'Full screen' });
		const locateButton = getByRole('button', { name: 'Locate' });
		expect(fullScreenButton.compareDocumentPosition(locateButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		fireEvent.click(fullScreenButton);
		fireEvent.click(locateButton);
		expect(onEnterWorkspaceChrome).toHaveBeenCalledTimes(1);
		expect(onLocateFile).toHaveBeenCalledTimes(1);
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		unmount();
	});

	it('shows only exit full screen when opened from an embed', () => {
		const onExitWorkspaceChrome = jest.fn();
		const { getByRole, queryByRole, unmount } = renderMenu({
			isWorkspaceChromeHidden: true,
			onExitWorkspaceChrome,
		});
		fireEvent.click(getByRole('button', { name: 'Exit full screen' }));
		expect(onExitWorkspaceChrome).toHaveBeenCalledTimes(1);
		expect(queryByRole('button', { name: 'Full screen' })).toBeNull();
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		expect(queryByRole('button', { name: 'Locate' })).toBeNull();
		unmount();
	});

	it('shows only exit full screen when the dedicated view entered full screen itself', () => {
		const { getByRole, queryByRole, unmount } = renderMenu({
			isWorkspaceChromeHidden: true,
			onExitWorkspaceChrome: () => {},
			onLocateFile: () => {},
		});
		expect(getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
		expect(queryByRole('button', { name: 'Back' })).toBeNull();
		expect(queryByRole('button', { name: 'Full screen' })).toBeNull();
		expect(queryByRole('button', { name: 'Locate' })).toBeNull();
		unmount();
	});
});
