const PDFJS_VERSION = '5.7.284';
const TESSERACT_VERSION = '7.0.0';

let pdfJsPromise = null;
let tesseractPromise = null;

async function loadPdfJs() {
    if (!pdfJsPromise) {
        pdfJsPromise = import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`)
            .then((pdfjs) => {
                pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
                return pdfjs;
            });
    }
    return pdfJsPromise;
}

async function loadTesseract() {
    if (!tesseractPromise) {
        tesseractPromise = import(`https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`);
    }
    return tesseractPromise;
}

function groupTextItemsIntoLines(items = []) {
    const rows = new Map();
    items.forEach((item) => {
        const y = Math.round(Number(item.transform?.[5] || 0) / 3) * 3;
        const row = rows.get(y) || [];
        row.push({ x: Number(item.transform?.[4] || 0), text: String(item.str || '') });
        rows.set(y, row);
    });

    return [...rows.entries()]
        .sort((left, right) => right[0] - left[0])
        .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(' ').trim())
        .filter(Boolean)
        .join('\n');
}

async function renderPdfPage(page, scale = 4) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
}

async function recognizeImage(image, onProgress) {
    const tesseractModule = await loadTesseract();
    const tesseract = tesseractModule.default || tesseractModule;
    const result = await tesseract.recognize(image, 'por+eng', {
        logger(message) {
            if (message.status === 'recognizing text') {
                onProgress?.({
                    stage: 'ocr',
                    progress: Math.round((message.progress || 0) * 100),
                    message: `Reading scanned invoice - ${Math.round((message.progress || 0) * 100)}%`
                });
            }
        }
    });
    return result?.data?.text || '';
}

export async function extractInvoiceFile(file, { onProgress } = {}) {
    if (!(file instanceof Blob)) throw new Error('Choose a PDF or image invoice first.');
    const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
        onProgress?.({ stage: 'ocr', progress: 0, message: 'Reading invoice image' });
        return { text: await recognizeImage(file, onProgress), method: 'ocr', pageCount: 1 };
    }

    onProgress?.({ stage: 'pdf', progress: 5, message: 'Opening PDF' });
    const pdfjs = await loadPdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const textPages = [];
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        pages.push(page);
        const content = await page.getTextContent();
        textPages.push(groupTextItemsIntoLines(content.items));
        onProgress?.({
            stage: 'pdf',
            progress: Math.round((pageNumber / pdf.numPages) * 40),
            message: `Reading PDF page ${pageNumber} of ${pdf.numPages}`
        });
    }

    const extractedText = textPages.join('\n').trim();
    if (extractedText.replace(/\s/g, '').length >= 80) {
        return { text: extractedText, method: 'pdf-text', pageCount: pdf.numPages };
    }

    const ocrPages = [];
    for (let index = 0; index < pages.length; index += 1) {
        const canvas = await renderPdfPage(pages[index]);
        ocrPages.push(await recognizeImage(canvas, (progress) => {
            const pageShare = 100 / pages.length;
            onProgress?.({
                ...progress,
                progress: Math.round((index * pageShare) + ((progress.progress || 0) / pages.length)),
                message: `${progress.message} (page ${index + 1} of ${pages.length})`
            });
        }));
    }

    return { text: ocrPages.join('\n'), method: 'ocr', pageCount: pdf.numPages };
}

export async function fingerprintInvoiceFile(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
