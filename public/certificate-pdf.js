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

  window.generateCertificateHtml = function generateCertificateHtml(record) {
    const certificate = record?.certificate || {};
    const isCertSigned = Boolean(certificate.signedDate && certificate.signedBy);

    if (!isCertSigned) {
      throw new Error('Certificate PDF is available only after the certificate has been signed by an authorized signatory.');
    }

    const companyName = record.companyName || 'Telematics Customer';
    const deviceModel = record.deviceModel || 'Not recorded';
    const certificateNumber = certificate.certificateNumber || 'Not assigned';

    const score = record.totalScore === null || record.totalScore === undefined
      ? 'Not recorded'
      : Number(record.totalScore).toFixed(2);

    const stars = Math.max(0, Math.min(5, Number(record.starsCount) || 0));
    const starDisplay = `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;

    return `
      <div style="
        width: 794px;
        min-height: 1123px;
        box-sizing: border-box;
        padding: 28px;
        background: #F8FAFC;
        color: #0F172A;
        font-family: Arial, Helvetica, sans-serif;
        position: relative;
      ">

        <!-- OUTER FRAME -->
        <div style="
          width: 100%;
          min-height: 1067px;
          box-sizing: border-box;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          position: relative;
          overflow: hidden;
        ">

          <!-- TOP ACCENT -->
          <div style="
            height: 8px;
            width: 100%;
            background: #F58220;
          "></div>

          <!-- DECORATIVE CORNERS -->
          <div style="
            position: absolute;
            top: 30px;
            left: 30px;
            width: 55px;
            height: 55px;
            border-top: 3px solid #F58220;
            border-left: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            top: 30px;
            right: 30px;
            width: 55px;
            height: 55px;
            border-top: 3px solid #F58220;
            border-right: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            bottom: 30px;
            left: 30px;
            width: 55px;
            height: 55px;
            border-bottom: 3px solid #F58220;
            border-left: 3px solid #F58220;
          "></div>

          <div style="
            position: absolute;
            bottom: 30px;
            right: 30px;
            width: 55px;
            height: 55px;
            border-bottom: 3px solid #F58220;
            border-right: 3px solid #F58220;
          "></div>


          <!-- HEADER -->
          <div style="
            text-align: center;
            padding: 58px 65px 28px;
          ">

            <div style="
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 3px;
              color: #F58220;
              text-transform: uppercase;
            ">
              Malaysian Institute of Road Safety Research
            </div>

            <div style="
              font-size: 42px;
              font-weight: 900;
              letter-spacing: 4px;
              color: #0F172A;
              margin-top: 8px;
            ">
              MIROS
            </div>

            <div style="
              width: 70px;
              height: 3px;
              background: #F58220;
              margin: 12px auto;
            "></div>

            <div style="
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 2.5px;
              color: #64748B;
              text-transform: uppercase;
            ">
              TrackScore Digital Evaluation System
            </div>
          </div>


          <!-- CERTIFICATE TITLE -->
          <div style="
            text-align: center;
            padding: 24px 65px 0;
          ">

            <div style="
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 4px;
              color: #64748B;
              text-transform: uppercase;
            ">
              Official Certificate
            </div>

            <div style="
              font-size: 36px;
              font-weight: 900;
              letter-spacing: 1px;
              color: #0F172A;
              margin-top: 8px;
            ">
              CERTIFICATE OF EVALUATION
            </div>

            <div style="
              margin: 15px auto 0;
              display: inline-block;
              padding: 8px 22px;
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
            padding: 42px 75px 28px;
          ">

            <div style="
              font-size: 16px;
              color: #64748B;
              letter-spacing: 0.4px;
            ">
              This is to certify that
            </div>

            <div style="
              font-size: 31px;
              font-weight: 900;
              color: #0F172A;
              margin: 13px 0 9px;
              line-height: 1.2;
            ">
              ${escapeCertificateHtml(companyName)}
            </div>

            <div style="
              width: 100px;
              height: 2px;
              background: #F58220;
              margin: 14px auto 17px;
            "></div>

            <div style="
              font-size: 15px;
              color: #475569;
              line-height: 1.7;
            ">
              has successfully completed the official
              <strong style="color:#0F172A;">TrackScore</strong>
              telematics device evaluation for
            </div>

            <div style="
              font-size: 21px;
              font-weight: 800;
              color: #1E293B;
              margin-top: 10px;
            ">
              ${escapeCertificateHtml(deviceModel)}
            </div>
          </div>


          <!-- SCORE SECTION -->
          <div style="
            margin: 8px 65px 30px;
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            border: 1px solid #CBD5E1;
            background: #FFFFFF;
          ">

            <!-- SCORE -->
            <div style="
              padding: 22px 24px;
              border-right: 1px solid #E2E8F0;
            ">

              <div style="
                font-size: 10px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.5px;
                text-transform: uppercase;
              ">
                Evaluation Score
              </div>

              <div style="
                margin-top: 7px;
                font-size: 30px;
                font-weight: 900;
                color: #0F172A;
              ">
                ${escapeCertificateHtml(score)}
                <span style="
                  font-size: 14px;
                  color: #94A3B8;
                  font-weight: 600;
                ">
                  / 5.00
                </span>
              </div>

              <div style="
                margin-top: 5px;
                font-size: 20px;
                letter-spacing: 3px;
                color: #F58220;
              ">
                ${starDisplay}
              </div>
            </div>


            <!-- RATING -->
            <div style="
              padding: 22px 24px;
            ">

              <div style="
                font-size: 10px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.5px;
                text-transform: uppercase;
              ">
                Evaluation Rating
              </div>

              <div style="
                margin-top: 8px;
                font-size: 19px;
                font-weight: 900;
                color: #166534;
              ">
                ${escapeCertificateHtml(record.ratingLabel || 'Evaluated')}
              </div>

              <div style="
                margin-top: 8px;
                font-size: 11px;
                color: #64748B;
              ">
                Issued
              </div>

              <div style="
                margin-top: 2px;
                font-size: 12px;
                font-weight: 700;
                color: #334155;
              ">
                ${formatCertificateDate(certificate.signedDate)}
              </div>
            </div>
          </div>


          <!-- DESCRIPTION -->
          <div style="
            margin: 0 78px;
            padding: 0 0 30px;
            text-align: center;
          ">

            <div style="
              font-size: 11px;
              line-height: 1.8;
              color: #64748B;
            ">
              This certificate records the official TrackScore evaluation outcome
              and is issued subject to verification and endorsement by the
              Director General Office (DGO).
            </div>
          </div>


          <!-- SIGNATURE / RECORD -->
          <div style="
            margin: 0 65px;
            padding-top: 25px;
            border-top: 1px solid #CBD5E1;
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 40px;
          ">

            <!-- SIGNATURE -->
            <div>

              <div style="
                height: 42px;
                border-bottom: 1px solid #475569;
                margin-bottom: 8px;
              "></div>

              <div style="
                font-size: 13px;
                font-weight: 900;
                color: #0F172A;
              ">
                ${escapeCertificateHtml(certificate.signedBy)}
              </div>

              <div style="
                margin-top: 3px;
                font-size: 11px;
                font-weight: 600;
                color: #64748B;
              ">
                Director General Office (DGO)
              </div>

              <div style="
                margin-top: 5px;
                font-size: 10px;
                color: #94A3B8;
              ">
                Signed: ${formatCertificateDate(certificate.signedDate)}
              </div>
            </div>


            <!-- RECORD -->
            <div>

              <div style="
                font-size: 10px;
                font-weight: 800;
                color: #64748B;
                letter-spacing: 1.3px;
                text-transform: uppercase;
                margin-bottom: 10px;
              ">
                Certificate Record
              </div>

              <div style="
                display: grid;
                grid-template-columns: 65px 1fr;
                row-gap: 6px;
                font-size: 10px;
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
          </div>


          <!-- FOOTER -->
          <div style="
            position: absolute;
            left: 65px;
            right: 65px;
            bottom: 28px;
            padding-top: 10px;
            border-top: 1px solid #E2E8F0;
            text-align: center;
            font-size: 8px;
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
})();