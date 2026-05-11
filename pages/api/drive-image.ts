import type { NextApiRequest, NextApiResponse } from 'next';
import sharp from 'sharp';

/**
 * Server-side proxy for Google Drive images.
 * Avoids CORS / ORB blocking that occurs when fetching Drive URLs client-side.
 *
 * Handles:
 *   - Small files served directly via export=view
 *   - Large files behind Google's confirmation gate (uc?export=view returns HTML)
 *     → retried via drive.usercontent.google.com with confirm=t
 *   - Auto-rotation (EXIF orientation) via sharp for JPEG/PNG
 *
 * Note: HEIC/AVIF files from iPhones cannot be served to web browsers without
 * format conversion. If you have HEIC images, convert them to JPEG first.
 *
 * Usage: /api/drive-image?id=<GOOGLE_DRIVE_FILE_ID>
 */

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
};

function detectMime(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  return null; // unknown / not a web-safe image (e.g. HEIC, AVIF)
}

async function fetchRawBuffer(id: string): Promise<Buffer> {
  // Attempt 1: standard view URL (works for most files)
  const viewUrl = `https://drive.google.com/uc?export=view&id=${id}`;
  const first = await fetch(viewUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });

  if (first.ok) {
    const ct = first.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) {
      return Buffer.from(await first.arrayBuffer());
    }
    // Google returned a confirmation HTML page — fall through to download URL.
  }

  // Attempt 2: download URL for large files / virus-scan gated files
  const dlUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const second = await fetch(dlUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });

  if (!second.ok) {
    throw new Error(`Drive download failed with status ${second.status}`);
  }
  return Buffer.from(await second.arrayBuffer());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing Google Drive file id' });
  }

  try {
    const raw = await fetchRawBuffer(id);
    const mime = detectMime(raw);

    if (!mime) {
      // Not a web-safe format (likely HEIC from iPhone).
      // Convert to JPEG via sharp — works on Vercel (libvips with HEIC support).
      // Falls back gracefully if local sharp binary lacks HEIC support.
      try {
        const jpeg = await sharp(raw).rotate().jpeg({ quality: 88 }).toBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.status(200).send(jpeg);
      } catch {
        return res.status(415).json({
          error:
            'Unsupported image format (likely HEIC). Please convert this photo to JPEG and re-upload.',
        });
      }
    }

    // For web-safe formats, use sharp only for EXIF auto-rotation.
    // Skip re-encoding GIFs (sharp drops animation).
    let output = raw;
    if (mime === 'image/jpeg' || mime === 'image/png') {
      try {
        output = await sharp(raw).rotate().toBuffer();
      } catch {
        // Ignore — serve original if sharp rotation fails
      }
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to fetch image: ${message}` });
  }
}
