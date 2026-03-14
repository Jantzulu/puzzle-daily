import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAllPosts,
  createNewsPost,
  updateNewsPost,
  publishNewsPost,
  unpublishNewsPost,
  deleteNewsPost,
} from '../../services/newsService';
import type { NewsPost, NewsPostDraft, NewsCategory } from '../../types/newsPost';

const CATEGORIES: NewsCategory[] = ['Update', 'New Feature', 'Bug Fix', 'Event'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-900/50 text-amber-300 border border-amber-700/50',
  published: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const NewsEditor: React.FC = () => {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [category, setCategory] = useState<NewsCategory>('Update');
  const [author, setAuthor] = useState('Dev Team');
  const [showPreview, setShowPreview] = useState(false);

  const loadPosts = useCallback(async () => {
    const data = await fetchAllPosts();
    setPosts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const selectedPost = posts.find(p => p.id === selectedId) || null;

  // Populate form when selecting a post
  useEffect(() => {
    if (selectedPost) {
      setTitle(selectedPost.title);
      setBody(selectedPost.body);
      setSummary(selectedPost.summary || '');
      setBannerUrl(selectedPost.banner_url || '');
      setCategory(selectedPost.category);
      setAuthor(selectedPost.author);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setTitle('');
    setBody('');
    setSummary('');
    setBannerUrl('');
    setCategory('Update');
    setAuthor('Dev Team');
    setSelectedId(null);
    setShowPreview(false);
  };

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const draft: NewsPostDraft = {
      title: title.trim(),
      body: body.trim(),
      summary: summary.trim() || undefined,
      banner_url: bannerUrl.trim() || undefined,
      category,
      author: author.trim() || 'Dev Team',
    };
    const post = await createNewsPost(draft);
    if (post) {
      resetForm();
      await loadPosts();
      setSelectedId(post.id);
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!selectedId || !title.trim() || !body.trim()) return;
    setSaving(true);
    await updateNewsPost(selectedId, {
      title: title.trim(),
      body: body.trim(),
      summary: summary.trim() || undefined,
      banner_url: bannerUrl.trim() || undefined,
      category,
      author: author.trim() || 'Dev Team',
    });
    await loadPosts();
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!selectedId) return;
    setSaving(true);
    await publishNewsPost(selectedId);
    await loadPosts();
    setSaving(false);
  };

  const handleUnpublish = async () => {
    if (!selectedId) return;
    setSaving(true);
    await unpublishNewsPost(selectedId);
    await loadPosts();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setSaving(true);
    await deleteNewsPost(selectedId);
    resetForm();
    await loadPosts();
    setSaving(false);
  };

  return (
    <div className="flex h-full">
      {/* Post list sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-stone-700 flex flex-col">
        <div className="p-3 border-b border-stone-700 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-300">Posts</h3>
          <button
            onClick={resetForm}
            className="px-2 py-1 text-xs bg-arcane-600 hover:bg-arcane-500 text-white rounded transition-colors"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto dungeon-scrollbar">
          {loading ? (
            <div className="p-4 text-stone-500 text-sm animate-pulse">Loading...</div>
          ) : posts.length === 0 ? (
            <div className="p-4 text-stone-500 text-sm text-center">
              No posts yet. Click "+ New" to create one.
            </div>
          ) : (
            posts.map(post => (
              <button
                key={post.id}
                onClick={() => setSelectedId(post.id)}
                className={`w-full text-left p-3 border-b border-stone-800 transition-colors ${
                  selectedId === post.id
                    ? 'bg-stone-700/50'
                    : 'hover:bg-stone-800/50'
                }`}
              >
                <div className="text-sm text-parchment-200 truncate">{post.title || 'Untitled'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[post.status]}`}>
                    {post.status}
                  </span>
                  <span className="text-[10px] text-stone-500">
                    {formatDate(post.updated_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 overflow-y-auto dungeon-scrollbar p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <h3 className="text-sm font-medium text-stone-300 mb-3">
            {selectedId ? 'Edit Post' : 'New Post'}
            {selectedPost && (
              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[selectedPost.status]}`}>
                {selectedPost.status}
              </span>
            )}
          </h3>

          {/* Title */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Post title..."
              className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-arcane-500"
            />
          </div>

          {/* Category & Author row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-stone-400 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as NewsCategory)}
                className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 focus:outline-none focus:ring-1 focus:ring-arcane-500"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-stone-400 mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="Dev Team"
                className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-arcane-500"
              />
            </div>
          </div>

          {/* Banner URL */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Banner Image URL (optional)</label>
            <input
              type="text"
              value={bannerUrl}
              onChange={e => setBannerUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-arcane-500"
            />
            {bannerUrl && (
              <div className="mt-2 rounded overflow-hidden border border-stone-600">
                <img src={bannerUrl} alt="Banner preview" className="w-full h-32 object-cover" />
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Summary (optional, shown as footnote)</label>
            <input
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Brief summary..."
              className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-arcane-500"
            />
          </div>

          {/* Body editor with preview toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-stone-400">Body (HTML)</label>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-arcane-400 hover:text-arcane-300 transition-colors"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>

            {showPreview ? (
              <div
                className="min-h-[200px] p-3 bg-stone-700 rounded text-sm text-stone-300 border border-stone-600
                  [&_a]:text-arcane-400 [&_a]:underline
                  [&_strong]:text-parchment-200
                  [&_ul]:list-disc [&_ul]:pl-5
                  [&_ol]:list-decimal [&_ol]:pl-5
                  [&_li]:text-stone-300
                  [&_h3]:text-parchment-200 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1
                  [&_h4]:text-parchment-200 [&_h4]:text-sm [&_h4]:font-bold [&_h4]:mt-2 [&_h4]:mb-1
                  [&_p]:mb-2"
                dangerouslySetInnerHTML={{ __html: body || '<span class="text-stone-500">Nothing to preview</span>' }}
              />
            ) : (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="<p>Write your announcement here...</p>"
                rows={10}
                className="w-full px-3 py-2 bg-stone-700 rounded text-sm text-parchment-100 placeholder-stone-500 font-mono focus:outline-none focus:ring-1 focus:ring-arcane-500 resize-y"
              />
            )}
            <div className="text-[10px] text-stone-600 mt-1">
              Supported: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a href&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;li&gt;, &lt;h3&gt;, &lt;h4&gt;, &lt;br&gt;
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-stone-700">
            {selectedId ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !title.trim() || !body.trim()}
                  className="px-4 py-2 text-sm bg-arcane-600 hover:bg-arcane-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {selectedPost?.status === 'draft' ? (
                  <button
                    onClick={handlePublish}
                    disabled={saving || !title.trim() || !body.trim()}
                    className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                  >
                    Publish
                  </button>
                ) : (
                  <button
                    onClick={handleUnpublish}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                  >
                    Unpublish
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-red-800 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors ml-auto"
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                onClick={handleCreate}
                disabled={saving || !title.trim() || !body.trim()}
                className="px-4 py-2 text-sm bg-arcane-600 hover:bg-arcane-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {saving ? 'Creating...' : 'Create Draft'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
