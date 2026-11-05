/**
 * Reads a hex color: "#rgb", "#rrggbb" or "#rrggbbaa", with or without the "#".
 * @param {string} value The color.
 * @returns {{r: number, g: number, b: number, a: number} | null} Channels 0 to 255 and the opacity
 * 0 to 100, or null when the value is not a hex color.
 */
export function parseHex(value) {
  let digits = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(
    (value || "").trim()
  )?.[1];
  if (!digits) {
    return null;
  }
  if (digits.length === 3) {
    digits = digits.replace(/./g, "$&$&");
  }
  const byte = (index) => parseInt(digits.substr(index, 2), 16);
  return {
    r: byte(0),
    g: byte(2),
    b: byte(4),
    a: digits.length === 8 ? Math.round((byte(6) / 255) * 100) : 100
  };
}

/**
 * Writes a color the way crColorRow stores it: "#rrggbb", or "#rrggbbaa" below full opacity.
 * @param {{r: number, g: number, b: number}} rgb Channels 0 to 255.
 * @param {number} opacity The opacity, 0 to 100.
 * @returns {string} The lowercase hex color.
 */
export function formatHex({ r, g, b }, opacity = 100) {
  const pair = (byte) => Math.round(byte).toString(16).padStart(2, "0");
  const hex = `#${pair(r)}${pair(g)}${pair(b)}`;
  return opacity >= 100 ? hex : hex + pair((Math.max(0, opacity) / 100) * 255);
}

/**
 * @param {number} h Hue, 0 to 360.
 * @param {number} s Saturation, 0 to 1.
 * @param {number} v Brightness, 0 to 1.
 * @returns {{r: number, g: number, b: number}} Channels 0 to 255.
 */
export function hsvToRgb(h, s, v) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return { r: channel(5), g: channel(3), b: channel(1) };
}

/**
 * @param {{r: number, g: number, b: number}} rgb Channels 0 to 255.
 * @returns {{h: number, s: number, v: number}} Hue 0 to 360, saturation and brightness 0 to 1.
 */
export function rgbToHsv({ r, g, b }) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const spread = max - Math.min(red, green, blue);
  let hue = 0;
  if (spread) {
    if (max === red) {
      hue = ((green - blue) / spread) % 6;
    } else if (max === green) {
      hue = (blue - red) / spread + 2;
    } else {
      hue = (red - green) / spread + 4;
    }
  }
  return { h: (hue * 60 + 360) % 360, s: max ? spread / max : 0, v: max };
}
