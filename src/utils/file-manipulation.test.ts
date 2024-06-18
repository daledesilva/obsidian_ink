import {describe, expect, test} from '@jest/globals';
import { parseFilepath } from "./parseFilepath";

////////////
////////////

// describe(`Getting new filepaths`, () => {

//     const mockPlugin = jest.fn(x => 42);

//     test(`No customisation`, () => {
//         // const mockPlugin;
//         const filepath = getNewTimestampedWritingFilepath(mockPlugin)
//         expect(filepath).toEqual('hello');
//     })

// });




describe(`parseFilepath tests`, () => {

    test(`file.md`, () => {
        const result = parseFilepath('file.md');
        expect(result).toEqual({
            folderpath: '',
            basename: 'file',
            ext: 'md'
        });
    })

});
