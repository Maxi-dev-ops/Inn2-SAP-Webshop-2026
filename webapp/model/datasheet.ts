export interface DatasheetData {
    name: string;
    material: string;
    price: number | null | undefined;
    currency: string;
    description: string;
    pictureUrl: string;
}

export interface DatasheetLabels {
    title: string;
    subtitle: string;
    articleNo: string;
    listPrice: string;
    description: string;
    printButton: string;
}

/** Escapes HTML special characters */
export function escHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Builds a printable HTML datasheet for a product. The result is opened in a new window
 */
export function buildDatasheetHtml(oData: DatasheetData, oLabels: DatasheetLabels): string {
    const sName = escHtml(oData.name);
    const sMat = escHtml(oData.material);
    const sPrice = oData.price !== undefined && oData.price !== null
        ? escHtml(`${Number(oData.price).toFixed(2)} ${oData.currency}`)
        : "–";
    const sDesc = escHtml(oData.description);
    const sImgSrc = escHtml(oData.pictureUrl);

    const sTitle = escHtml(oLabels.title);
    const sSubtitle = escHtml(oLabels.subtitle);
    const sArticleNo = escHtml(oLabels.articleNo);
    const sListPrice = escHtml(oLabels.listPrice);
    const sDescHeading = escHtml(oLabels.description);
    const sPrintButton = escHtml(oLabels.printButton);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${sTitle}</title>
        <style>
            body           { font-family: Arial, sans-serif; margin: 40px; color: #1a2b4a; }
            h1             { font-size: 1.6rem; margin-bottom: 4px; }
            .sub           { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
            table          { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
            td             { padding: 8px 12px; border: 1px solid #e2e8f0; }
            td:first-child { font-weight: 600; width: 180px; background: #f8fafc; }
            img            { max-width: 280px; max-height: 280px; object-fit: contain; display: block; margin: 0 auto 24px; }
            .desc          { font-size: 0.9rem; line-height: 1.6; color: #374151; }
            .printBtn      { display: block; margin: 0 auto 24px; padding: 10px 24px; font-size: 1rem;
                            background: #0a6ed1; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
            @media print { .printBtn { display: none; } }
        </style>
    </head>
    <body>
        <button class="printBtn" onclick="window.print()">${sPrintButton}</button>
        ${sImgSrc ? `<img src="${sImgSrc}" alt="${sName}"/>` : ""}
        <h1>${sName}</h1>
        <div class="sub">${sSubtitle}</div>
        <table>
            <tr><td>${sArticleNo}</td><td>${sMat}</td></tr>
            <tr><td>${sListPrice}</td><td>${sPrice}</td></tr>
        </table>
        ${sDesc ? `<div class="desc"><strong>${sDescHeading}</strong><p>${sDesc}</p></div>` : ""}
    </body>
    </html>`;
}
