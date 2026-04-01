type ImageDimensions = {
  width: number;
  height: number;
};

const isPng = (buffer: Buffer) => {
  if (buffer.length < 24) return false;
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
};

const isJpeg = (buffer: Buffer) =>
  buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;

const getPngDimensions = (buffer: Buffer): ImageDimensions | null => {
  if (!isPng(buffer)) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
};

const getJpegDimensions = (buffer: Buffer): ImageDimensions | null => {
  if (!isJpeg(buffer)) return null;

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) {
      return null;
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }

    const isSofMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isSofMarker) {
      if (offset + 9 >= buffer.length) {
        return null;
      }

      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    offset += 2 + length;
  }

  return null;
};

export const getImageDimensions = (buffer: Buffer): ImageDimensions | null => {
  return getPngDimensions(buffer) ?? getJpegDimensions(buffer);
};
