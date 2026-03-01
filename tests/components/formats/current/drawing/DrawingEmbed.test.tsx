import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { DrawingEmbed } from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';

const makeEmbedSettings = () => ({ embedDisplay: { width: 400, aspectRatio: 1.6 }, viewBox: { x: 0, y: 0, width: 100, height: 100 } });
const makeTFile = (): any => ({ path: 'Ink/Drawing/test.svg', stat: { mtime: 1234567890 } });

const wrap = (ui: React.ReactElement) => render(<JotaiProvider>{ui}</JotaiProvider>);

describe('DrawingEmbed', () => {
  it('shows not found message when embeddedFile is null and not pending', () => {
    wrap(
      <DrawingEmbed
        embeddedFile={null}
        embedSettings={makeEmbedSettings() as any}
        saveSrcFile={(_pageData: any) => ({})}
        remove={() => {}}
        partialEmbedFilepath={'missing.svg'}
      />
    );

    expect(document.body.textContent).toContain('missing.svg');
  });

  describe('pending banner — file found', () => {
    const renderPending = (overrides: Partial<any> = {}) =>
      wrap(
        <DrawingEmbed
          embeddedFile={makeTFile()}
          embedSettings={makeEmbedSettings() as any}
          saveSrcFile={(_pageData: any) => ({})}
          remove={() => {}}
          partialEmbedFilepath={'Ink/Drawing/test.svg'}
          isPendingPaste={true}
          resolveAsReference={overrides.resolveAsReference ?? jest.fn()}
          resolveAsDuplicate={overrides.resolveAsDuplicate ?? jest.fn()}
        />
      );

    it('renders the pending banner', () => {
      renderPending();
      expect(document.querySelector('.ddc_ink_pending-banner')).toBeInTheDocument();
    });

    it('renders the preview (resize container) beneath the banner', () => {
      renderPending();
      expect(document.querySelector('.ddc_ink_resize-container')).toBeInTheDocument();
    });

    it('calls resolveAsReference when "Reference existing file" is clicked', () => {
      const resolveAsReference = jest.fn();
      const { getByText } = renderPending({ resolveAsReference });
      fireEvent.click(getByText('Reference existing file'));
      expect(resolveAsReference).toHaveBeenCalledTimes(1);
    });

    it('calls resolveAsDuplicate when "Make duplicate" is clicked', () => {
      const resolveAsDuplicate = jest.fn();
      const { getByText } = renderPending({ resolveAsDuplicate });
      fireEvent.click(getByText('Make duplicate'));
      expect(resolveAsDuplicate).toHaveBeenCalledTimes(1);
    });
  });

  describe('pending banner — file not found (isPendingPaste=true)', () => {
    it('renders the not-found banner variant', () => {
      wrap(
        <DrawingEmbed
          embeddedFile={null}
          embedSettings={makeEmbedSettings() as any}
          saveSrcFile={(_pageData: any) => ({})}
          remove={() => {}}
          partialEmbedFilepath={'missing.svg'}
          isPendingPaste={true}
        />
      );
      expect(document.querySelector('.ddc_ink_pending-banner--not-found')).toBeInTheDocument();
    });

    it('does not render the resize container when file is missing', () => {
      wrap(
        <DrawingEmbed
          embeddedFile={null}
          embedSettings={makeEmbedSettings() as any}
          saveSrcFile={(_pageData: any) => ({})}
          remove={() => {}}
          partialEmbedFilepath={'missing.svg'}
          isPendingPaste={true}
        />
      );
      expect(document.querySelector('.ddc_ink_resize-container')).not.toBeInTheDocument();
    });
  });

  describe('file not found — not pending (isPendingPaste=false)', () => {
    it('renders the existing red not-found box (not the pending banner)', () => {
      wrap(
        <DrawingEmbed
          embeddedFile={null}
          embedSettings={makeEmbedSettings() as any}
          saveSrcFile={(_pageData: any) => ({})}
          remove={() => {}}
          partialEmbedFilepath={'missing.svg'}
          isPendingPaste={false}
        />
      );
      // The existing red not-found box should appear, not the pending banner
      expect(document.querySelector('.ddc_ink_pending-banner')).not.toBeInTheDocument();
      expect(document.body.textContent).toContain('missing.svg');
    });
  });
});


