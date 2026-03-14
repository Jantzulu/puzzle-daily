import { supabase } from '../lib/supabase';
import type { NewsPost, NewsPostDraft, NewsStatus } from '../types/newsPost';

const LOCAL_NEWS_KEY = 'local_news_posts';

// ============================================
// LOCAL STORAGE FALLBACK
// ============================================

function getLocalPosts(): NewsPost[] {
  try {
    const raw = localStorage.getItem(LOCAL_NEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalPosts(posts: NewsPost[]): void {
  try {
    localStorage.setItem(LOCAL_NEWS_KEY, JSON.stringify(posts.slice(0, 50)));
  } catch { /* storage full */ }
}

function saveLocalPost(post: NewsPost): void {
  const posts = getLocalPosts();
  const idx = posts.findIndex(p => p.id === post.id);
  if (idx >= 0) {
    posts[idx] = post;
  } else {
    posts.unshift(post);
  }
  saveLocalPosts(posts);
}

function removeLocalPost(id: string): boolean {
  const posts = getLocalPosts();
  const filtered = posts.filter(p => p.id !== id);
  if (filtered.length === posts.length) return false;
  saveLocalPosts(filtered);
  return true;
}

// ============================================
// PUBLIC (read-only)
// ============================================

/**
 * Fetch published posts for the public Town Crier feed.
 */
export async function fetchPublishedPosts(): Promise<NewsPost[]> {
  let cloudPosts: NewsPost[] = [];

  try {
    const { data, error } = await supabase
      .from('news_posts')
      .select('*')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false });

    if (!error && data) {
      cloudPosts = data as NewsPost[];
    }
  } catch { /* cloud unavailable */ }

  // Merge with any local published posts
  const localPublished = getLocalPosts().filter(p => p.status === 'published' && !p.deleted_at);

  if (cloudPosts.length > 0) {
    const cloudIds = new Set(cloudPosts.map(p => p.id));
    const uniqueLocal = localPublished.filter(p => !cloudIds.has(p.id));
    const merged = [...cloudPosts, ...uniqueLocal];
    merged.sort((a, b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime());
    return merged;
  }

  return localPublished;
}

/**
 * Get the timestamp of the most recent published post.
 * Used for the unread badge in navigation.
 */
export async function getLatestPostTimestamp(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('news_posts')
      .select('published_at')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      return data[0].published_at;
    }
  } catch { /* cloud unavailable */ }

  // Fall back to local
  const localPublished = getLocalPosts().filter(p => p.status === 'published' && !p.deleted_at);
  if (localPublished.length > 0) {
    localPublished.sort((a, b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime());
    return localPublished[0].published_at || localPublished[0].created_at;
  }

  return null;
}

// ============================================
// ADMIN CRUD
// ============================================

/**
 * Fetch all posts (drafts + published) for admin view.
 */
export async function fetchAllPosts(filters?: { status?: NewsStatus }): Promise<NewsPost[]> {
  let cloudPosts: NewsPost[] = [];

  try {
    let query = supabase
      .from('news_posts')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (!error && data) {
      cloudPosts = data as NewsPost[];
    }
  } catch { /* cloud unavailable */ }

  // Merge with local posts
  let localPosts = getLocalPosts().filter(p => !p.deleted_at);
  if (filters?.status) {
    localPosts = localPosts.filter(p => p.status === filters.status);
  }

  if (cloudPosts.length > 0) {
    const cloudIds = new Set(cloudPosts.map(p => p.id));
    const uniqueLocal = localPosts.filter(p => !cloudIds.has(p.id));
    const merged = [...cloudPosts, ...uniqueLocal];
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  }

  return localPosts;
}

/**
 * Create a new news post as draft.
 */
export async function createNewsPost(draft: NewsPostDraft): Promise<NewsPost | null> {
  const now = new Date().toISOString();
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const post: NewsPost = {
    id: localId,
    title: draft.title,
    body: draft.body,
    summary: draft.summary || null,
    banner_url: draft.banner_url || null,
    category: draft.category,
    author: draft.author,
    status: 'draft',
    published_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  try {
    const { data, error } = await supabase
      .from('news_posts')
      .insert({
        title: draft.title,
        body: draft.body,
        summary: draft.summary || null,
        banner_url: draft.banner_url || null,
        category: draft.category,
        author: draft.author,
      })
      .select()
      .single();

    if (!error && data) {
      return data as NewsPost;
    }

    // Cloud failed — save locally
    saveLocalPost(post);
    return post;
  } catch {
    saveLocalPost(post);
    return post;
  }
}

/**
 * Update an existing news post.
 */
export async function updateNewsPost(
  id: string,
  updates: Partial<NewsPostDraft> & { status?: NewsStatus }
): Promise<boolean> {
  const now = new Date().toISOString();

  // Handle local posts
  if (id.startsWith('local_')) {
    const posts = getLocalPosts();
    const idx = posts.findIndex(p => p.id === id);
    if (idx < 0) return false;
    const post = posts[idx];
    posts[idx] = {
      ...post,
      ...updates,
      updated_at: now,
      published_at: updates.status === 'published' && !post.published_at ? now : post.published_at,
    };
    saveLocalPosts(posts);
    return true;
  }

  try {
    const row: Record<string, unknown> = { ...updates, updated_at: now };

    // Set published_at when publishing
    if (updates.status === 'published') {
      row.published_at = now;
    }

    const { error } = await supabase
      .from('news_posts')
      .update(row)
      .eq('id', id);

    if (error) {
      console.warn('[News] Failed to update:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Publish a draft post.
 */
export async function publishNewsPost(id: string): Promise<boolean> {
  return updateNewsPost(id, { status: 'published' });
}

/**
 * Unpublish a post (back to draft).
 */
export async function unpublishNewsPost(id: string): Promise<boolean> {
  if (id.startsWith('local_')) {
    const posts = getLocalPosts();
    const idx = posts.findIndex(p => p.id === id);
    if (idx < 0) return false;
    posts[idx] = { ...posts[idx], status: 'draft', updated_at: new Date().toISOString() };
    saveLocalPosts(posts);
    return true;
  }

  try {
    const { error } = await supabase
      .from('news_posts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', id);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Soft-delete a news post.
 */
export async function deleteNewsPost(id: string): Promise<boolean> {
  if (id.startsWith('local_')) {
    return removeLocalPost(id);
  }

  try {
    const { error } = await supabase
      .from('news_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('[News] Failed to delete:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
