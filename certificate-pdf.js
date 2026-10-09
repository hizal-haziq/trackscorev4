(function () {
  function escapeCertificateHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (match) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[match]));
  }

  function formatCertificateDate(value) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  // Standalone standard QR Code generator (Byte Mode, EC Level L, ISO/IEC 18004 compliant)
  function generateQrSvg(text, cellSize = 2) {
    const PAD0 = 0xEC;
    const PAD1 = 0x11;
    const RS_BLOCK_TABLE = [
      [1, 26, 19], [1, 26, 16],
      [1, 44, 34], [1, 44, 28],
      [1, 70, 55], [1, 70, 44],
      [1, 100, 80], [2, 50, 32],
      [1, 134, 108], [2, 67, 43],
      [2, 86, 68], [4, 43, 27],
      [2, 98, 78], [4, 49, 31],
      [2, 121, 97], [2, 60, 38, 2, 61, 39],
      [2, 146, 116], [3, 58, 36, 2, 59, 37],
      [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44]
    ];
    const QRMath = {
      glog: (n) => { if (n < 1) throw new Error("glog"); return QRMath.LOG_TABLE[n]; },
      gexp: (n) => { while (n < 0) n += 255; while (n >= 255) n -= 255; return QRMath.EXP_TABLE[n]; },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function polynomial(num, shift) {
      let offset = 0;
      while (offset < num.length && num[offset] === 0) offset++;
      const _num = new Array(num.length - offset + shift);
      for (let i = 0; i < num.length - offset; i++) _num[i] = num[i + offset];
      return {
        get: (i) => _num[i],
        getLength: () => _num.length,
        multiply: (e) => {
          const res = new Array(_num.length + e.getLength() - 1).fill(0);
          for (let i = 0; i < _num.length; i++) {
            for (let j = 0; j < e.getLength(); j++) {
              res[i + j] ^= QRMath.gexp(QRMath.glog(_num[i]) + QRMath.glog(e.get(j)));
            }
          }
          return polynomial(res, 0);
        },
        mod: (e) => {
          if (_num.length - e.getLength() < 0) return polynomial(_num, 0);
          const ratio = QRMath.glog(_num[0]) - QRMath.glog(e.get(0));
          const numCopy = [..._num];
          for (let i = 0; i < e.getLength(); i++) {
            numCopy[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
          }
          return polynomial(numCopy, 0).mod(e);
        }
      };
    }

    function createBuffer() {
      const buffer = [];
      let length = 0;
      return {
        put: (num, len) => {
          for (let i = 0; i < len; i++) {
            const bit = ((num >>> (len - i - 1)) & 1) === 1;
            if (length === buffer.length * 8) buffer.push(0);
            if (bit) buffer[buffer.length - 1] |= (0x80 >>> (length % 8));
            length++;
          }
        },
        getLengthInBits: () => length,
        getBuffer: () => buffer
      };
    }

    const len = text.length;
    let type = 4;
    if (len > 55) type = 6;
    if (len > 95) type = 8;
    if (len > 140) type = 10;

    const rawBlocks = RS_BLOCK_TABLE[((type - 1) * 2)];
    const rsBlocks = [];
    for (let i = 0; i < rawBlocks.length; i += 3) {
      for (let j = 0; j < rawBlocks[i]; j++) {
        rsBlocks.push({ totalCount: rawBlocks[i + 1], dataCount: rawBlocks[i + 2] });
      }
    }

    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }

    const buffer = createBuffer();
    buffer.put(4, 4);
    buffer.put(bytes.length, 8);
    for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.getLengthInBits() % 8 !== 0) buffer.put(0, 1);
    while (buffer.getLengthInBits() < totalDataCount * 8) {
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() < totalDataCount * 8) buffer.put(PAD1, 8);
    }

    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
      offset += dcCount;

      let rsPoly = polynomial([1], 0);
      for (let i = 0; i < ecCount; i++) rsPoly = rsPoly.multiply(polynomial([1, QRMath.gexp(i)], 0));
      const rawPoly = polynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }

    const finalData = [];
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) finalData.push(dcdata[r][i]);
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) finalData.push(ecdata[r][i]);
      }
    }

    const moduleCount = type * 4 + 17;
    const modules = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(null));

    function setPos(row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || moduleCount <= col + c) continue;
          modules[row + r][col + c] = ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4));
        }
      }
    }
    setPos(0, 0);
    setPos(moduleCount - 7, 0);
    setPos(0, moduleCount - 7);

    const patternPositions = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][type] || [];
    for (let i = 0; i < patternPositions.length; i++) {
      for (let j = 0; j < patternPositions.length; j++) {
        const row = patternPositions[i];
        const col = patternPositions[j];
        if (modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
          }
        }
      }
    }

    for (let r = 8; r < moduleCount - 8; r++) {
      if (modules[r][6] === null) modules[r][6] = (r % 2 === 0);
    }
    for (let c = 8; c < moduleCount - 8; c++) {
      if (modules[6][c] === null) modules[6][c] = (c % 2 === 0);
    }

    // Type info (EC L=1, mask=0)
    const d = 0x77c4;
    for (let i = 0; i < 15; i++) {
      const mod = ((d >> i) & 1) === 1;
      if (i < 6) modules[i][8] = mod;
      else if (i < 8) modules[i + 1][8] = mod;
      else modules[moduleCount - 15 + i][8] = mod;
      if (i < 8) modules[8][moduleCount - i - 1] = mod;
      else if (i < 9) modules[8][15 - i] = mod;
      else modules[8][15 - i - 1] = mod;
    }
    modules[moduleCount - 8][8] = true;

    let inc = -1;
    let row = moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < finalData.length) {
              dark = (((finalData[byteIndex] >>> bitIndex) & 1) === 1);
            }
            if ((row + (col - c)) % 2 === 0) dark = !dark;
            modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }

    const margin = 3;
    const size = moduleCount * cellSize + margin * 2;
    let rects = "";
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (modules[r][c]) {
          rects += '<rect x="' + (c * cellSize + margin) + '" y="' + (r * cellSize + margin) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#0F172A"/>';
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#FFFFFF"/>' + rects + '</svg>';
  }

  window.generateCertificateHtml = function generateCertificateHtml(record = {}) {
    const certificate = { ...(record?.certificate || {}) };
    const companyName = record?.companyName || 'Not recorded';
    const deviceModel = record?.deviceModel || 'Not recorded';
    const certificateNumber = certificate.certificateNumber || 'Not assigned';

    const score = record.totalScore === null || record.totalScore === undefined
      ? 'Not recorded'
      : Number(record.totalScore).toFixed(2);

    const stars = Math.max(0, Math.min(5, Number(record.starsCount) || 0));
    const starDisplay = `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;

    // Build authoritative verification URL & QR Code
    const verifyBase = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://trackscore.my';
    const verificationUrl = `${verifyBase}/verify-certificate.html?cert=${encodeURIComponent(certificateNumber)}`;
    const qrSvg = certificate.certificateNumber ? generateQrSvg(verificationUrl, 2) : null;

    // Responsive font size for recipient company name to prevent any vertical overflow on long company names
    const companyFontSize = companyName.length > 60 ? '19px' : (companyName.length > 35 ? '22px' : '26px');

    return `
      <div id="trackscore-certificate-document" style="
        width: 794px;
        height: 1120px;
        max-height: 1120px;
        box-sizing: border-box;
        padding: 24px;
        background: #F8FAFC;
        color: #0F172A;
        font-family: Arial, Helvetica, sans-serif;
        position: relative;
        overflow: hidden;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      ">

        <!-- OUTER FRAME -->
        <div style="
          width: 100%;
          height: 1072px;
          max-height: 1072px;
          box-sizing: border-box;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          position: relative;
          overflow: hidden;
        ">

          <!-- TOP ACCENT -->
          <div style="
            height: 6px;
            width: 100%;
            background: #F58220;
          "></div>

          <!-- DECORATIVE CORNERS -->
          <div style="
            position: absolute;
            top: 20px;
            left: 20px;
            width: 45px;
            height: 45px;
            border-top: 3px solid #F58220;
            border-left: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            top: 20px;
            right: 20px;
            width: 45px;
            height: 45px;
            border-top: 3px solid #F58220;
            border-right: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            bottom: 20px;
            left: 20px;
            width: 45px;
            height: 45px;
            border-bottom: 3px solid #F58220;
            border-left: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            bottom: 20px;
            right: 20px;
            width: 45px;
            height: 45px;
            border-bottom: 3px solid #F58220;
            border-right: 3px solid #F58220;
          "></div>


          <!-- HEADER -->
          <div style="
            text-align: center;
            padding: 36px 60px 14px;
          ">
            <div style="
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 2.5px;
              color: #F58220;
              text-transform: uppercase;
            ">
              Malaysian Institute of Road Safety Research
            </div>

            <div style="
              font-size: 38px;
              font-weight: 900;
              letter-spacing: 4px;
              color: #0F172A;
              margin-top: 5px;
            ">
              MIROS
            </div>

            <div style="
              width: 60px;
              height: 3px;
              background: #F58220;
              margin: 9px auto;
            "></div>

            <div style="
              font-size: 10.5px;
              font-weight: 700;
              letter-spacing: 2px;
              color: #64748B;
              text-transform: uppercase;
            ">
              TrackScore Digital Evaluation System
            </div>
          </div>


          <!-- CERTIFICATE TITLE -->
          <div style="
            text-align: center;
            padding: 12px 60px 0;
          ">
            <div style="
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 3.5px;
              color: #64748B;
              text-transform: uppercase;
            ">
              Official Certificate
            </div>

            <div style="
              font-size: 31px;
              font-weight: 900;
              letter-spacing: 1px;
              color: #0F172A;
              margin-top: 5px;
            ">
              CERTIFICATE OF EVALUATION
            </div>

            <div style="
              margin: 10px auto 0;
              display: inline-block;
              padding: 5px 18px;
              border: 1px solid #CBD5E1;
              background: #F8FAFC;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 1.5px;
              color: #475569;
            ">
              NO. ${escapeCertificateHtml(certificateNumber)}
            </div>
          </div>


          <!-- MAIN CERTIFICATION TEXT -->
          <div style="
            text-align: center;
            padding: 26px 60px 16px;
          ">
            <div style="
              font-size: 14.5px;
              color: #64748B;
              letter-spacing: 0.3px;
            ">
              This is to certify that
            </div>

            <div style="
              font-size: ${companyFontSize};
              font-weight: 900;
              color: #0F172A;
              margin: 8px 0 6px;
              line-height: 1.25;
            ">
              ${escapeCertificateHtml(companyName)}
            </div>

            <div style="
              width: 80px;
              height: 2px;
              background: #F58220;
              margin: 9px auto 11px;
            "></div>

            <div style="
              font-size: 13.5px;
              color: #475569;
              line-height: 1.55;
            ">
              has successfully completed the official
              <strong style="color:#0F172A;">TrackScore</strong>
              telematics device evaluation for
            </div>

            <div style="
              font-size: 18px;
              font-weight: 800;
              color: #1E293B;
              margin-top: 7px;
            ">
              ${escapeCertificateHtml(deviceModel)}
            </div>
          </div>


          <!-- SCORE SECTION -->
          <div style="
            margin: 4px 60px 20px;
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            border: 1px solid #CBD5E1;
            background: #FFFFFF;
          ">
            <!-- SCORE -->
            <div style="
              padding: 14px 20px;
              border-right: 1px solid #E2E8F0;
            ">
              <div style="
                font-size: 9px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.5px;
                text-transform: uppercase;
              ">
                Evaluation Score
              </div>

              <div style="
                margin-top: 5px;
                font-size: 25px;
                font-weight: 900;
                color: #0F172A;
              ">
                ${escapeCertificateHtml(score)}
                <span style="
                  font-size: 13px;
                  color: #94A3B8;
                  font-weight: 600;
                ">
                  / 5.00
                </span>
              </div>

              <div style="
                margin-top: 3px;
                font-size: 17px;
                letter-spacing: 2.5px;
                color: #F58220;
              ">
                ${starDisplay}
              </div>
            </div>

            <!-- RATING -->
            <div style="
              padding: 14px 20px;
            ">
              <div style="
                font-size: 9px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.5px;
                text-transform: uppercase;
              ">
                Evaluation Rating
              </div>

              <div style="
                margin-top: 5px;
                font-size: 15px;
                font-weight: 900;
                color: #166534;
              ">
                ${escapeCertificateHtml(record.ratingLabel || 'Evaluated')}
              </div>

              <div style="
                margin-top: 5px;
                font-size: 10px;
                color: #64748B;
              ">
                Issued
              </div>

              <div style="
                margin-top: 2px;
                font-size: 11px;
                font-weight: 700;
                color: #334155;
              ">
                ${formatCertificateDate(certificate.signedDate)}
              </div>
            </div>
          </div>


          <!-- DESCRIPTION -->
          <div style="
            margin: 0 65px;
            padding: 0 0 16px;
            text-align: center;
          ">
            <div style="
              font-size: 10px;
              line-height: 1.55;
              color: #64748B;
            ">
              This certificate records the official TrackScore evaluation outcome
              and is issued subject to verification and endorsement by the
              Director General Office (DGO).
            </div>
          </div>


          <!-- SIGNATURE, RECORD & QR SECTION (BALANCED 3-COLUMN LAYOUT) -->
          <div style="
            margin: 0 60px;
            padding-top: 16px;
            border-top: 1px solid #CBD5E1;
            display: grid;
            grid-template-columns: 1.15fr 0.95fr 0.7fr;
            gap: 20px;
            align-items: start;
          ">

            <!-- SIGNATURE -->
            <div>
              <div style="
                height: 36px;
                border-bottom: 1px solid #475569;
                margin-bottom: 7px;
              "></div>

              <div style="
                font-size: 11.5px;
                font-weight: 900;
                color: #0F172A;
                line-height: 1.25;
              ">
                ${escapeCertificateHtml(certificate.signedBy || 'Not recorded')}
              </div>

              <div style="
                margin-top: 2px;
                font-size: 10px;
                font-weight: 600;
                color: #64748B;
              ">
                Director General Office (DGO)
              </div>

              <div style="
                margin-top: 3px;
                font-size: 9px;
                color: #94A3B8;
              ">
                Signed: ${formatCertificateDate(certificate.signedDate)}
              </div>
            </div>


            <!-- RECORD -->
            <div>
              <div style="
                font-size: 9px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.2px;
                text-transform: uppercase;
                margin-bottom: 7px;
              ">
                Certificate Record
              </div>

              <div style="
                display: grid;
                grid-template-columns: 55px 1fr;
                row-gap: 4px;
                font-size: 9px;
              ">
                <div style="color:#94A3B8;">Prepared</div>
                <div style="font-weight:700;color:#334155;">
                  ${formatCertificateDate(certificate.preparedDate)}
                </div>

                <div style="color:#94A3B8;">Printed</div>
                <div style="font-weight:700;color:#334155;">
                  ${formatCertificateDate(certificate.printedDate)}
                </div>

                <div style="color:#94A3B8;">Delivered</div>
                <div style="font-weight:700;color:#334155;">
                  ${formatCertificateDate(certificate.sentToCustomerDate)}
                </div>

                <div style="color:#94A3B8;">Method</div>
                <div style="font-weight:700;color:#334155;">
                  ${escapeCertificateHtml(certificate.deliveryMethod || 'Not recorded')}
                </div>
              </div>
            </div>

            <!-- QR CODE VERIFICATION BOX -->
            <div style="
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            ">
              <a href="${escapeCertificateHtml(verificationUrl)}" target="_blank" style="text-decoration:none;" title="Verify Certificate Online">
                <div style="
                  width: 68px;
                  height: 68px;
                  padding: 3px;
                  background: #FFFFFF;
                  border: 1px solid #CBD5E1;
                  border-radius: 4px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                ">
                  ${qrSvg ? `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}" alt="Certificate verification QR code" style="display:block;width:100%;height:100%;" />` : 'No certificate record'}
                </div>
              </a>
              <div style="
                font-size: 7.5px;
                font-weight: 800;
                color: #F58220;
                margin-top: 3px;
                letter-spacing: 0.8px;
                text-transform: uppercase;
              ">
                Scan to Verify
              </div>
              <div style="
                font-size: 7px;
                color: #64748B;
              ">
                Official MIROS Registry
              </div>
            </div>
          </div>


          <!-- FOOTER -->
          <div style="
            position: absolute;
            left: 60px;
            right: 60px;
            bottom: 18px;
            padding-top: 7px;
            border-top: 1px solid #E2E8F0;
            text-align: center;
            font-size: 7.5px;
            letter-spacing: 1px;
            color: #94A3B8;
            text-transform: uppercase;
          ">
            TrackScore Digital Assessor Matrix
            &nbsp; • &nbsp;
            Official MIROS Verification Record
          </div>

        </div>
      </div>
    `;
  };

  /**
   * Authoritative Certificate PDF Download Function
   * Reuses the exact, proven Assessment Report PDF pipeline:
   * 1. Loads html2pdf.bundle.min.js on-demand
   * 2. Renders into a dedicated off-screen fixed-dimension target (794px x 1120px)
   * 3. Resets scroll offsets (scrollY: 0, scrollX: 0) to avoid any viewport scroll cropping
   * 4. Enforces fixed windowWidth (794) and windowHeight (1120) to decouple from client screen size
   * 5. Anchors html2pdf's temporary copy before canvas bounds are measured
   * 6. Configures A4 portrait with 0 margin, fitting 100% onto exactly one complete page
   * 6. Automatically removes temporary DOM elements upon completion
   */
  window.downloadTrackScoreCertificatePdf = async function downloadTrackScoreCertificatePdf(record, customFilename) {
    if (!record) {
      throw new Error('Certificate record is required to generate PDF.');
    }

    if (typeof window.generateCertificateHtml !== 'function') {
      throw new Error('Certificate generator template is not loaded.');
    }

    // Ensure html2pdf engine is loaded
    if (typeof window.loadHtml2Pdf === 'function') {
      await window.loadHtml2Pdf();
    } else if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.async = true;
        script.onload = () => resolve(window.html2pdf);
        script.onerror = (err) => reject(new Error('Failed to load html2pdf library: ' + err.message));
        document.head.appendChild(script);
      });
    }

    // Create dedicated off-screen render container with exact fixed certificate dimensions
    const container = document.createElement('div');
    container.id = 'certificate-pdf-render';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '794px';
    container.style.height = '1120px';
    container.style.zIndex = '-9999';
    container.style.overflow = 'hidden';
    container.style.background = '#FFFFFF';
    container.style.boxSizing = 'border-box';
    container.setAttribute('aria-hidden', 'true');
    container.innerHTML = window.generateCertificateHtml(record);

    document.body.appendChild(container);

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const certEl = container.firstElementChild;
      const cleanCertNo = String(record.certificate?.certificateNumber || record._id || record.id || 'CERT').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = customFilename || `TrackScore_Certificate_${cleanCertNo}.pdf`;

      // Proven Report PDF options adapted for full A4 certificate
      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          windowWidth: 794,
          windowHeight: 1120
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      // html2pdf centers its own copy in the current browser viewport. If
      // html2canvas then clones it into our fixed 794px viewport, the previously
      // measured left offset crops the page. Anchor the copy BEFORE toCanvas()
      // measures it, rather than changing dimensions in html2canvas's onclone.
      const worker = window.html2pdf().set(opt).from(certEl).toContainer();
      const renderCopy = await worker.get('container');
      Object.assign(renderCopy.style, {
        width: '794px',
        height: '1120px',
        left: '0',
        right: 'auto',
        top: '0',
        margin: '0',
        transform: 'none',
        boxSizing: 'border-box'
      });
      Object.assign(renderCopy.parentElement.style, {
        width: '794px',
        height: '1120px',
        right: 'auto',
        bottom: 'auto'
      });

      try {
        // Wait for any template images as well as fonts before rasterization.
        await Promise.all(Array.from(renderCopy.querySelectorAll('img'), (image) => {
          if (image.complete) {
            if (!image.naturalWidth) throw new Error('A certificate image could not be loaded.');
            return Promise.resolve();
          }
          return new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', () => reject(new Error('A certificate image could not be loaded.')), { once: true });
          });
        }));
        await worker.save();
      } finally {
        // html2pdf removes its overlay on success; remove it on failure too.
        renderCopy.parentElement?.remove();
      }
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };
})();
