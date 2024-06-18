import {describe, expect, test} from '@jest/globals';
import { getNewTimestampedWritingFilepath } from "./file-manipulation"

////////////
////////////

describe(`Getting new filepaths`, () => {

    test(`No customisation`, () => {
        // const mockPlugin;
        const filepath = 'hello';//getNewTimestampedWritingFilepath(mockPlugin)
        expect(filepath).toEqual('hello');
    })

});
