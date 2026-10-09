// Compact standalone QR code generator (MIT License, Kazuhiko Arase)
// Generates standard QR Code Type 1-10 matrix as SVG

function createQrCode(typeNumber, errorCorrectionLevel) {
  const PAD0 = 0xEC;
  const PAD1 = 0x11;

  let _typeNumber = typeNumber;
  let _errorCorrectionLevel = errorCorrectionLevel; // 1: L, 0: M, 3: Q, 2: H
  let _modules = null;
  let _moduleCount = 0;
  let _dataCache = null;
  const _dataList = [];

  const _this = {};

  function addData(data) {
    const text = String(data);
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        const code2 = 0x10000 + (((code & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (code2 >> 18), 0x80 | ((code2 >> 12) & 0x3f), 0x80 | ((code2 >> 6) & 0x3f), 0x80 | (code2 & 0x3f));
      }
    }
    _dataList.push({
      mode: 4, // 8-bit byte mode
      data: bytes,
      getLength: () => bytes.length,
      write: (buffer) => {
        for (let i = 0; i < bytes.length; i++) {
          buffer.put(bytes[i], 8);
        }
      }
    });
    _dataCache = null;
  }

  function isDark(row, col) {
    if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
      throw new Error(row + "," + col);
    }
    return _modules[row][col];
  }

  function getModuleCount() {
    return _moduleCount;
  }

  // Polynomial & Galois Field Math
  const QRMath = {
    glog: (n) => {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: (n) => {
      while (n < 0) n += 255;
      while (n >= 255) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
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

  // RS Blocks Table (Types 1-10, EC Level L=1, M=0)
  const RS_BLOCK_TABLE = [
    // 1
    [1, 26, 19], [1, 26, 16],
    // 2
    [1, 44, 34], [1, 44, 28],
    // 3
    [1, 70, 55], [1, 70, 44],
    // 4
    [1, 100, 80], [2, 50, 32],
    // 5
    [1, 134, 108], [2, 67, 43],
    // 6
    [2, 86, 68], [4, 43, 27],
    // 7
    [2, 98, 78], [4, 49, 31],
    // 8
    [2, 121, 97], [2, 60, 38, 2, 61, 39],
    // 9
    [2, 146, 116], [3, 58, 36, 2, 59, 37],
    // 10
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44]
  ];

  function getRsBlocks(typeNumber, errorCorrectionLevel) {
    const row = ((typeNumber - 1) * 2) + (errorCorrectionLevel === 1 ? 0 : 1);
    const raw = RS_BLOCK_TABLE[row];
    const list = [];
    for (let i = 0; i < raw.length; i += 3) {
      const count = raw[i];
      const totalCount = raw[i + 1];
      const dataCount = raw[i + 2];
      for (let j = 0; j < count; j++) {
        list.push({ totalCount, dataCount });
      }
    }
    return list;
  }

  function createBuffer() {
    const buffer = [];
    let length = 0;
    return {
      get: (i) => ((buffer[Math.floor(i / 8)] >>> (7 - (i % 8))) & 1) === 1,
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

  function createBytes(buffer, rsBlocks) {
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
      for (let i = 0; i < dcdata[r].length; i++) {
        dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
      }
      offset += dcCount;

      let rsPoly = polynomial([1], 0);
      for (let i = 0; i < ecCount; i++) {
        rsPoly = rsPoly.multiply(polynomial([1, QRMath.gexp(i)], 0));
      }
      const rawPoly = polynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }

    const totalCodeCount = rsBlocks.reduce((sum, b) => sum + b.totalCount, 0);
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) data[index++] = dcdata[r][i];
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) data[index++] = ecdata[r][i];
      }
    }
    return data;
  }

  function createData(typeNumber, errorCorrectionLevel, dataList) {
    const rsBlocks = getRsBlocks(typeNumber, errorCorrectionLevel);
    const buffer = createBuffer();
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), 8); // Type 1-9 byte length indicator = 8 bits
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw new Error("Code length overflow. (" + buffer.getLengthInBits() + ">" + (totalDataCount * 8) + "bit)");
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.getLengthInBits() % 8 !== 0) buffer.put(0, 1);
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  }

  function setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || _moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || _moduleCount <= col + c) continue;
        if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
          _modules[row + r][col + c] = true;
        } else {
          _modules[row + r][col + c] = false;
        }
      }
    }
  }

  function setupTimingPattern() {
    for (let r = 8; r < _moduleCount - 8; r++) {
      if (_modules[r][6] !== null) continue;
      _modules[r][6] = (r % 2 === 0);
    }
    for (let c = 8; c < _moduleCount - 8; c++) {
      if (_modules[6][c] !== null) continue;
      _modules[6][c] = (c % 2 === 0);
    }
  }

  function setupPositionAdjustPattern() {
    const pos = [6, 18, 22, 26, 30, 34][_typeNumber - 1] || [];
    const patternPositions = [
      [],
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50]
    ][_typeNumber] || [];

    for (let i = 0; i < patternPositions.length; i++) {
      for (let j = 0; j < patternPositions.length; j++) {
        const row = patternPositions[i];
        const col = patternPositions[j];
        if (_modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            _modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
          }
        }
      }
    }
  }

  function setupTypeInfo(test, maskPattern) {
    const data = (_errorCorrectionLevel << 3) | maskPattern;
    let bits = data << 10;
    while (QRMath.glog(bits) >= QRMath.glog(0x537)) {
      bits ^= (0x537 << (QRMath.glog(bits) - QRMath.glog(0x537)));
    }
    const d = ((data << 10) | bits) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((d >> i) & 1) === 1);
      if (i < 6) _modules[i][8] = mod;
      else if (i < 8) _modules[i + 1][8] = mod;
      else _modules[_moduleCount - 15 + i][8] = mod;
      if (i < 8) _modules[8][_moduleCount - i - 1] = mod;
      else if (i < 9) _modules[8][15 - i - 1 + 1] = mod;
      else _modules[8][15 - i - 1] = mod;
    }
    _modules[_moduleCount - 8][8] = !test;
  }

  function getMask(maskPattern, i, j) {
    switch (maskPattern) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
      default: throw new Error("mask:" + maskPattern);
    }
  }

  function mapData(data, maskPattern) {
    let inc = -1;
    let row = _moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;

    for (let col = _moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (_modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            }
            const mask = getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            _modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || _moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  function make() {
    _moduleCount = _typeNumber * 4 + 17;
    _modules = new Array(_moduleCount);
    for (let row = 0; row < _moduleCount; row++) {
      _modules[row] = new Array(_moduleCount).fill(null);
    }
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(_moduleCount - 7, 0);
    setupPositionProbePattern(0, _moduleCount - 7);
    setupPositionAdjustPattern();
    setupTimingPattern();
    setupTypeInfo(true, 0);
    const data = createData(_typeNumber, _errorCorrectionLevel, _dataList);
    mapData(data, 0);
    setupTypeInfo(false, 0);
  }

  _this.addData = addData;
  _this.make = make;
  _this.getModuleCount = getModuleCount;
  _this.isDark = isDark;

  _this.createSvgTag = (cellSize = 2, margin = 4) => {
    const size = _moduleCount * cellSize + margin * 2;
    let rects = "";
    for (let r = 0; r < _moduleCount; r++) {
      for (let c = 0; c < _moduleCount; c++) {
        if (_this.isDark(r, c)) {
          const x = c * cellSize + margin;
          const y = r * cellSize + margin;
          rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#0F172A"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#FFFFFF"/>${rects}</svg>`;
  };

  return _this;
}

export function generateQrSvg(text, cellSize = 2) {
  // Select appropriate type (length based)
  const len = text.length;
  let type = 4; // up to 60 bytes
  if (len > 55) type = 6; // up to 106 bytes
  if (len > 95) type = 8; // up to 154 bytes
  if (len > 140) type = 10;

  const qr = createQrCode(type, 1); // 1 = EC Level L
  qr.addData(text);
  qr.make();
  return qr.createSvgTag(cellSize, 4);
}

const svg = generateQrSvg('https://trackscore.my/verify-certificate.html?cert=TS-CERT-2026-7849');
console.log('Generated QR SVG length:', svg.length);
console.log('Sample:', svg.substring(0, 150));

