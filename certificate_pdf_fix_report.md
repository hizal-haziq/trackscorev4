# Certificate PDF verification — 1 October 2026

Chrome confirms the capture-origin fix and QR repair. Earlier Tabbit testing was blocked by launcher exit 69; the user authorized Chrome. Linked artifacts below are fresh downloads from the changed implementation.

html2pdf centers its temporary copy before measuring canvas bounds. Capturing that copy in a fixed 794px viewport could crop content. The implementation anchors the copy/overlay before capture, waits for fonts/images and removes temporary nodes on success/failure. The QR now uses an image containing the original SVG because inline SVG rasterized blank in the PDF. The existing portrait design and Assessment Report pipeline remain.

Actual Manager downloads at viewport widths **375, 1280 and 1920px**, plus a **1440px long-company-name case**, measured **1588 × 2240 canvas pixels and one A4 page each**. PyMuPDF measured **595.28 × 841.89 points**. Visual inspection confirmed all borders, title, company, scores/rating, signature record, QR and footer. The QR decoded from the actual PDF to the fixture's public verification URL.

Vendor certificate and Assessment Report downloads succeeded; the report remained one A4 page. Root/public copies are identical. Seven focused certificate tests and the complete **167-test suite** passed. Lint/build passed; existing classic-script build warnings remain.

- [Certificate](qa/certificate-pdf.pdf) and [direct PDF rendering](qa/certificate-pdf-small.png)
- [Long-name certificate](qa/certificate-audit-long-company.pdf) and [rendering](qa/certificate-audit-long-company.png)
- [Canvas/page measurements](qa/certificate-layout-results.json), [decoded QR](qa/certificate-qr-verification.json)
- [Assessment Report](qa/button-audit-assessment-report.pdf)
- [Complete control audit and limits](button_functionality_audit_2026-10-01.md)
