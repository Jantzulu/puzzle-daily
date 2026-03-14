export type NewsCategory = 'Update' | 'New Feature' | 'Bug Fix' | 'Event';
export type NewsStatus = 'draft' | 'published';

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  banner_url: string | null;
  category: NewsCategory;
  author: string;
  status: NewsStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NewsPostDraft {
  title: string;
  body: string;
  summary?: string;
  banner_url?: string;
  category: NewsCategory;
  author: string;
}
