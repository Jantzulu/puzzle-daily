import { supabase } from '../lib/supabase';

const BUCKET = 'theme-assets';

export interface MediaFile {
  name: string;
  path: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface MediaEntry {
  name: string;
  isFolder: boolean;
  path: string;
  // Only for files:
  url?: string;
  size?: number;
  createdAt?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

function getMimeExt(file: File): string {
  const type = file.type;
  if (type.includes('png')) return 'png';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webp')) return 'webp';
  return 'png';
}

/**
 * Browse a directory in the bucket. Returns folders and files.
 */
export async function browseMedia(path: string = ''): Promise<MediaEntry[]> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(path, {
      limit: 500,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error || !data) return [];

    const entries: MediaEntry[] = [];

    for (const item of data) {
      if (!item.name || item.name.startsWith('.')) continue;

      if (item.id) {
        // It's a file
        const fullPath = path ? `${path}/${item.name}` : item.name;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
        entries.push({
          name: item.name,
          isFolder: false,
          path: fullPath,
          url: urlData.publicUrl,
          size: (item.metadata as Record<string, unknown>)?.size as number || 0,
          createdAt: item.created_at || '',
        });
      } else {
        // It's a folder
        const fullPath = path ? `${path}/${item.name}` : item.name;
        entries.push({
          name: item.name,
          isFolder: true,
          path: fullPath,
        });
      }
    }

    // Sort: folders first, then files
    return entries.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error('[MediaStorage] Browse error:', e);
    return [];
  }
}

/**
 * Upload a file to a specific path in the bucket.
 */
export async function uploadMedia(
  file: File,
  folderPath: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const ext = getMimeExt(file);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const filename = `${Date.now()}-${sanitizeFilename(baseName)}.${ext}`;
    const filePath = folderPath ? `${folderPath}/${filename}` : filename;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[MediaStorage] Upload failed:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return { url: urlData.publicUrl, path: filePath };
  } catch (e) {
    console.error('[MediaStorage] Upload error:', e);
    return null;
  }
}

/**
 * Upload a data URL (base64) to Supabase Storage.
 */
export async function uploadMediaDataUrl(
  dataUrl: string,
  name: string,
  folderPath: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: mime });
    const file = new File([blob], name, { type: mime });
    return uploadMedia(file, folderPath);
  } catch (e) {
    console.error('[MediaStorage] DataUrl upload error:', e);
    return null;
  }
}

/**
 * Create a folder by uploading a placeholder file (Supabase creates folders implicitly).
 */
export async function createFolder(path: string): Promise<boolean> {
  try {
    const placeholder = new Blob([''], { type: 'text/plain' });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${path}/.keep`, placeholder, { upsert: true });

    if (error) {
      console.error('[MediaStorage] Create folder failed:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[MediaStorage] Create folder error:', e);
    return false;
  }
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteMedia(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.error('[MediaStorage] Delete failed:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[MediaStorage] Delete error:', e);
    return false;
  }
}

/**
 * Get the public URL for a storage path.
 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
