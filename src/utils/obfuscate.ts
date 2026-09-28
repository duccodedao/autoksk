/**
 * Utility for JavaScript obfuscation and tamper-resistant runtime wrapping.
 * Obfuscates the payload so human readers cannot see the source code logic,
 * while executing 100% seamlessly when pasted into the browser console.
 */

export type ObfuscationVariant = 'standard' | 'custom_location';

export function obfuscateScript(
  rawCode: string,
  title = 'HIS RUNTIME ENCRYPTED PAYLOAD',
  variant: ObfuscationVariant = 'standard',
  locationLabel?: string
): string {
  // Step 1: UTF-8 safe Base64 encoding
  const utf8Bytes = encodeURIComponent(rawCode).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  });
  const base64Str = btoa(utf8Bytes);

  // Step 2: Key-based XOR & Base64 scrambling (distinct key per variant)
  const key = variant === 'custom_location' ? 0x6b : 0x5a;
  const keyHex = variant === 'custom_location' ? '0x6b' : '0x5a';
  const xorChars: string[] = [];
  for (let i = 0; i < base64Str.length; i++) {
    xorChars.push(String.fromCharCode(base64Str.charCodeAt(i) ^ key));
  }
  const scrambledPayload = btoa(xorChars.join(''));

  // Step 3: Chunk payload into readable formatted rows
  const chunkSize = 76;
  const chunks: string[] = [];
  for (let i = 0; i < scrambledPayload.length; i += chunkSize) {
    chunks.push(`  "${scrambledPayload.slice(i, i + chunkSize)}"`);
  }
  const payloadArrayStr = chunks.join(',\n');

  const shieldHeader =
    variant === 'custom_location'
      ? `[HIS GEO-BOUND RUNTIME SHIELD] - ${title}\n * ĐỊA PHƯƠNG ĐÃ SETUP: ${locationLabel || 'Tùy chỉnh Tỉnh/Thành - Xã/Phường'}`
      : `[HIS SECURE RUNTIME SHIELD] - ${title}\n * DANH MỤC MẶC ĐỊNH: Phường Hiệp Thành`;

  // Step 4: Self-extracting Async Runner wrapper
  return `/**
 * ============================================================================
 * ${shieldHeader}
 * BẢO MẬT MÃ NGUỒN VẬN HÀNH & CHỐNG CAN THIỆP NỘI DUNG
 * ----------------------------------------------------------------------------
 * Cảnh báo: Mã nguồn đã được mã hóa phân lớp Bytecode (${variant === 'custom_location' ? 'Geo-Locked Cipher' : 'Standard Cipher'}).
 * Sao chép toàn bộ khối mã này và Dán (Ctrl+V) vào Console F12 để thực thi.
 * ============================================================================
 */
(() => {
  "use strict";
  const _0xk = ${keyHex};
  const _0xp = [
${payloadArrayStr}
  ].join("");

  try {
    const _0xd1 = atob(_0xp);
    let _0xd2 = "";
    for (let _0xi = 0; _0xi < _0xd1.length; _0xi++) {
      _0xd2 += String.fromCharCode(_0xd1.charCodeAt(_0xi) ^ _0xk);
    }
    const _0xsrc = decodeURIComponent(
      Array.prototype.map.call(atob(_0xd2), (_0xc) => {
        return "%" + ("00" + _0xc.charCodeAt(0).toString(16)).slice(-2);
      }).join("")
    );
    const _0xexec = new (Function.prototype.constructor.bind(null))(_0xsrc);
    _0xexec();
  } catch (_0xerr) {
    console.error("%c[HIS RUNTIME ERROR] Không thể giải mã hoặc thực thi kịch bản!", "color:red;font-weight:bold;");
    console.error(_0xerr);
  }
})();`;
}
