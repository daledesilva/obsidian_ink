import { describe, expect, jest, test } from "@jest/globals";
import { getDateFilename } from "./getDateFilename";

////////////
////////////

describe(`Get formatted date filename`, () => {

    jest.useFakeTimers();

    test(`Morning`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 09:05:59'));
        const result = getDateFilename();
        expect(result).toEqual('2024.1.18 - 9.05am');
    })

    test(`Midday`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 12:00:00'));
        const result = getDateFilename();
        expect(result).toEqual('2024.1.18 - 12.00pm');
    })
    
    test(`Evening`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 23:10:10'));
        const result = getDateFilename();
        expect(result).toEqual('2024.1.18 - 23.10pm');
    })

});
