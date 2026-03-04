import { supabase } from '../lib/supabase';

export interface AssetVersion {
  id: number;
  asset_id: string;
  asset_type: string;
  version_number: number;
  name: string;
  data: object;
  created_at: string;
  created_by?: string;
}

/**
 * Create a manual version snapshot of an asset or puzzle.
 */
export async function createVersionSnapshot(
  assetId: string,
  assetType: string,
  name: string,
  data: object
): Promise<{ success: boolean; versionNumber?: number }> {
  try {
    const nextVersion = await getLatestVersionNumber(assetId) + 1;

    let createdBy: string | undefined;
    try {
      const { data: userData } = await supabase.auth.getUser();
      createdBy = userData.user?.id;
    } catch { /* ignore */ }

    const { error } = await supabase
      .from('asset_versions')
      .insert({
        asset_id: assetId,
        asset_type: assetType,
        version_number: nextVersion,
        name,
        data,
        created_by: createdBy || null,
      });

    if (error) {
      console.error('[VersionService] Error creating snapshot:', error);
      return { success: false };
    }

    return { success: true, versionNumber: nextVersion };
  } catch (e) {
    console.error('[VersionService] Error creating snapshot:', e);
    return { success: false };
  }
}

/**
 * Fetch version history for an asset (newest first).
 */
export async function fetchVersionHistory(
  assetId: string,
  limit: number = 50
): Promise<AssetVersion[]> {
  const { data, error } = await supabase
    .from('asset_versions')
    .select('*')
    .eq('asset_id', assetId)
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[VersionService] Error fetching history:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch a specific version.
 */
export async function fetchVersion(
  assetId: string,
  versionNumber: number
): Promise<AssetVersion | null> {
  const { data, error } = await supabase
    .from('asset_versions')
    .select('*')
    .eq('asset_id', assetId)
    .eq('version_number', versionNumber)
    .maybeSingle();

  if (error) {
    console.error('[VersionService] Error fetching version:', error);
    return null;
  }

  return data;
}

/**
 * Get the latest (highest) version number for an asset. Returns 0 if no versions exist.
 */
export async function getLatestVersionNumber(assetId: string): Promise<number> {
  const { data } = await supabase
    .from('asset_versions')
    .select('version_number')
    .eq('asset_id', assetId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.version_number ?? 0;
}

/**
 * Get version count for an asset (for badge display).
 */
export async function getVersionCount(assetId: string): Promise<number> {
  const { count, error } = await supabase
    .from('asset_versions')
    .select('*', { count: 'exact', head: true })
    .eq('asset_id', assetId);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Delete a specific version.
 */
export async function deleteVersion(assetId: string, versionNumber: number): Promise<boolean> {
  const { error } = await supabase
    .from('asset_versions')
    .delete()
    .eq('asset_id', assetId)
    .eq('version_number', versionNumber);

  if (error) {
    console.error('[VersionService] Error deleting version:', error);
    return false;
  }

  return true;
}
