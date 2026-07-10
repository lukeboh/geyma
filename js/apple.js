// Leitura do acervo Apple (iCloud Fotos) a partir de uma pasta local:
// pasta sincronizada pelo iCloud para Windows, export do app Fotos do macOS
// ou download feito no iCloud.com. Nada é enviado a servidor algum — apenas
// nome, tamanho e data de captura (EXIF, quando disponível) são extraídos.

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp',
  'dng', 'raw', 'cr2', 'nef', 'arw',
  'mov', 'mp4', 'm4v', 'avi', 'mpg', 'mpeg', '3gp',
]);

export function isMediaFile(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return MEDIA_EXTENSIONS.has(ext);
}

// Percorre recursivamente uma pasta escolhida via showDirectoryPicker().
export async function scanDirectoryHandle(dirHandle, onProgress) {
  const files = [];
  await walk(dirHandle, '', files);
  return processFiles(files, onProgress);
}

async function walk(dirHandle, prefix, out) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      await walk(entry, `${prefix}${entry.name}/`, out);
    } else if (isMediaFile(entry.name)) {
      const file = await entry.getFile();
      out.push({ file, path: `${prefix}${entry.name}` });
    }
  }
}

// Alternativa para navegadores sem File System Access API: <input webkitdirectory>.
export async function scanFileList(fileList, onProgress) {
  const files = [];
  for (const file of fileList) {
    if (isMediaFile(file.name)) {
      files.push({ file, path: file.webkitRelativePath || file.name });
    }
  }
  return processFiles(files, onProgress);
}

async function processFiles(files, onProgress) {
  const records = [];
  for (let i = 0; i < files.length; i++) {
    const { file, path } = files[i];
    let captureTime = null;
    if (/\.jpe?g$/i.test(file.name)) {
      captureTime = await readExifDate(file).catch(() => null);
    }
    records.push({
      id: `apple:${path}`,
      filename: file.name,
      path,
      size: file.size,
      mimeType: file.type || '',
      // Sem EXIF, usa a data de modificação do arquivo como aproximação.
      createTime: captureTime || new Date(file.lastModified).toISOString(),
      captureTimeIsExif: Boolean(captureTime),
      source: 'apple',
    });
    if (onProgress && (i % 50 === 0 || i === files.length - 1)) {
      onProgress(i + 1, files.length);
    }
  }
  return records;
}

// ---- Parser EXIF mínimo (apenas JPEG, tag DateTimeOriginal) ----

async function readExifDate(file) {
  // O bloco EXIF (APP1) fica no começo do arquivo; 128 KiB cobre a esmagadora maioria.
  const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // não é JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2);
    if (marker === 0xe1) {
      // APP1: verifica assinatura "Exif\0\0"
      const start = offset + 4;
      if (
        view.getUint32(start) === 0x45786966 && // "Exif"
        view.getUint16(start + 4) === 0x0000
      ) {
        return parseTiff(view, start + 6);
      }
    }
    if (marker === 0xda) return null; // início dos dados da imagem: sem EXIF
    offset += 2 + segmentLength;
  }
  return null;
}

function parseTiff(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949; // "II" = little-endian, "MM" = big-endian
  if (!little && byteOrder !== 0x4d4d) return null;

  const ifd0Offset = view.getUint32(tiffStart + 4, little);
  const exifIfdOffset = findTagValue(view, tiffStart, ifd0Offset, 0x8769, little);
  if (!exifIfdOffset) return null;

  const dateString = findAsciiTag(view, tiffStart, exifIfdOffset, 0x9003, little); // DateTimeOriginal
  if (!dateString) return null;

  // Formato EXIF: "YYYY:MM:DD HH:MM:SS" → ISO local
  const match = dateString.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function iterateIfd(view, tiffStart, ifdOffset, little, visit) {
  const base = tiffStart + ifdOffset;
  if (base + 2 > view.byteLength) return;
  const entryCount = view.getUint16(base, little);
  for (let i = 0; i < entryCount; i++) {
    const entry = base + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, little);
    if (visit(tag, entry)) return;
  }
}

function findTagValue(view, tiffStart, ifdOffset, wantedTag, little) {
  let value = null;
  iterateIfd(view, tiffStart, ifdOffset, little, (tag, entry) => {
    if (tag === wantedTag) {
      value = view.getUint32(entry + 8, little);
      return true;
    }
  });
  return value;
}

function findAsciiTag(view, tiffStart, ifdOffset, wantedTag, little) {
  let result = null;
  iterateIfd(view, tiffStart, ifdOffset, little, (tag, entry) => {
    if (tag !== wantedTag) return false;
    const count = view.getUint32(entry + 4, little);
    // Valores com mais de 4 bytes ficam em um offset; ASCII de data tem 20 bytes.
    const valueOffset = count > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8;
    if (valueOffset + count > view.byteLength) return true;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + valueOffset, count);
    result = new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '');
    return true;
  });
  return result;
}
