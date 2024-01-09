import { ImageAnnotatorClient } from "@google-cloud/vision";
import { dataUriToBase64Image } from "src/utils/screenshots";

///////////
///////////

process.env.GOOGLE_APPLICATION_CREDENTIALS = '/Users/daledesilva/my-obsidian-ink-detection_key.json';

export async function fetchWriteFileTranscript(dataUri: string): Promise<string> {
    console.log('Fetching transcript!!!');
    let transcript: string = '';

    const client = new ImageAnnotatorClient();
    const request = {
        image: {content: dataUriToBase64Image(dataUri)},
    };
    await client.textDetection(request)
        .then((response) => {
            if(response.length && response[0].fullTextAnnotation) {
                transcript = response[0].fullTextAnnotation.text as string;
            }
        })
        .catch((error) => {
            console.error(error);
        });

    console.log('fetched transcript', transcript)
    return transcript;
}