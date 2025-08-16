import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import WritingEmbed from 'src/components/formats/current/writing/writing-embed/writing-embed';

const makePlugin = (overrides: Partial<any> = {}) => ({
  app: { vault: {} },
  settings: {},
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('WritingEmbed (v1)', () => {
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


