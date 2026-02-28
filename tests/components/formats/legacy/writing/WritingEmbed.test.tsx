import React from 'react';
import { render } from '@testing-library/react';
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

describe('WritingEmbed (legacy)', () => {
  it('renders container element', () => {
    render(
      <JotaiProvider>
        <WritingEmbed
          plugin={makePlugin() as any}
          writingFileRef={makeTFile()}
          pageData={{} as any}
          save={() => {}}
          remove={() => {}}
        />
      </JotaiProvider>
    );

    const container = document.querySelector('.ddc_ink_writing-embed');
    expect(container).toBeInTheDocument();
  });
});


