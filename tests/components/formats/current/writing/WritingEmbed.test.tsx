import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import WritingEmbed from 'src/components/formats/current/writing/writing-embed/writing-embed';

const makePlugin = (overrides: Partial<any> = {}) => ({
  app: { 
    vault: { 
      getResourcePath: jest.fn(() => 'data:image/svg+xml,%3Csvg/%3E'),
      on: jest.fn(() => jest.fn()),
      offref: jest.fn()
    } 
  },
  settings: {},
  ...overrides,
});

const makeTFile = (): any => ({ 
  path: 'path/to/file',
  stat: { mtime: 1234567890 }
});

const wrap = (ui: React.ReactElement) => render(<JotaiProvider>{ui}</JotaiProvider>);

describe('WritingEmbed', () => {
  it('renders container element', () => {
    wrap(
      <WritingEmbed
        plugin={makePlugin() as any}
        writingFileRef={makeTFile()}
        pageData={{} as any}
        save={() => {}}
        remove={() => {}}
      />
    );

    const container = document.querySelector('.ddc_ink_writing-embed');
    expect(container).toBeInTheDocument();
  });

  describe('pending banner — file found', () => {
    const renderPending = (overrides: Partial<any> = {}) =>
      wrap(
        <WritingEmbed
          plugin={makePlugin() as any}
          writingFileRef={makeTFile()}
          save={() => {}}
          remove={() => {}}
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
        <WritingEmbed
          plugin={makePlugin() as any}
          writingFileRef={null}
          save={() => {}}
          remove={() => {}}
          isPendingPaste={true}
        />
      );
      expect(document.querySelector('.ddc_ink_pending-banner--not-found')).toBeInTheDocument();
    });

    it('does not render the resize container when file is missing', () => {
      wrap(
        <WritingEmbed
          plugin={makePlugin() as any}
          writingFileRef={null}
          save={() => {}}
          remove={() => {}}
          isPendingPaste={true}
        />
      );
      expect(document.querySelector('.ddc_ink_resize-container')).not.toBeInTheDocument();
    });
  });

  describe('file not found — not pending (isPendingPaste=false)', () => {
    it('renders the not-found banner (not null) when writingFileRef is null', () => {
      wrap(
        <WritingEmbed
          plugin={makePlugin() as any}
          writingFileRef={null}
          save={() => {}}
          remove={() => {}}
          isPendingPaste={false}
        />
      );
      expect(document.querySelector('.ddc_ink_pending-banner--not-found')).toBeInTheDocument();
    });
  });
});


