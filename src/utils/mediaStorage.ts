import { supabase } from '../lib/supabase';

const BUCKET = 'sprites';

export type MediaFolder = 'characters' | 'enemies' | 'tiles' | 'effects' | 'misc';

export const MEDIA_FOLDERS: { key: MediaFolder; label: string; icon: string }[] = [
  { key: 'characters', label: 'Characters', icon: '⚔️' },
  { key: 'enemies', label: 'Enemies', icon: '👹' },
  { key: 'tiles', label: 'Tiles', icon: '🧱' },
  { key: 'effects', label: 'Effects', icon: '✨' },
  { key: 'misc', label: 'Misc', icon: '📁' },
];

export interface MediaFile {
  name: string;
  path: string;
  url: string;
  size: number;
  createdAt: string;
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
 * Upload a file to Supabase Storage.
 * Path: {userId}/{folder}/{timestamp}-{filename}
 */
export async function uploadMedia(
  file: File,
  folder: MediaFolder,
  userId: string
): Promise<{ url: string; path: string } | null> {
  try {
    const ext = getMimeExt(file);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const filename = `${Date.now()}-${sanitizeFilename(baseName)}.${ext}`;
    const filePath = `${userId}/${folder}/${filename}`;

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
  folder: MediaFolder,
  userId: string
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
    return uploadMedia(file, folder, userId);
  } catch (e) {
    console.error('[MediaStorage] DataUrl upload error:', e);
    return null;
  }
}

/**
 * List all files in a folder for a specific user.
 * If userId is omitted, lists all users' files in that folder.
 */
export async function listMedia(folder: MediaFolder, userId?: string): Promise<MediaFile[]> {
  try {
    if (userId) {
      return listFolder(`${userId}/${folder}`);
    }

    // List all user directories, then list each user's folder
    const { data: users, error } = await supabase.storage.from(BUCKET).list('', { limit: 100 });
    if (error || !users) return [];

    const results: MediaFile[] = [];
    for (const userDir of users) {
      if (userDir.id) continue; // skip files at root level
      const files = await listFolder(`${userDir.name}/${folder}`);
      results.push(...files);
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e) {
    console.error('[MediaStorage] List error:', e);
    return [];
  }
}

/**
 * List all files across all folders.
 */
export async function listAllMedia(userId?: string): Promise<MediaFile[]> {
  const allFiles: MediaFile[] = [];
  for (const folder of MEDIA_FOLDERS) {
    const files = await listMedia(folder.key, userId);
    allFiles.push(...files);
  }
  return allFiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listFolder(path: string): Promise<MediaFile[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(path, {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error || !data) return [];

  return data
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => {
      const fullPath = `${path}/${f.name}`;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
      return {
        name: f.name,
        path: fullPath,
        url: urlData.publicUrl,
        size: (f.metadata as Record<string, unknown>)?.size as number || 0,
        createdAt: f.created_at || '',
      };
    });
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
