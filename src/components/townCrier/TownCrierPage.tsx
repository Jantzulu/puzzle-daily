import React, { useState, useEffect, useCallback } from 'react';
import { fetchPublishedPosts } from '../../services/newsService';
import type { NewsPost, NewsCategory } from '../../types/newsPost';

const CATEGORIES: { id: NewsCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Update', label: 'Update' },
  { id: 'New Feature', label: 'New Feature' },
  { id: 'Bug Fix', label: 'Bug Fix' },
  { id: 'Event', label: 'Event' },
];

const CATEGORY_COLORS: Record<NewsCategory, string> = {
  'Update': 'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  'New Feature': 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
  'Bug Fix': 'bg-red-900/50 text-red-300 border border-red-700/50',
  'Event': 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export const TownCrierPage: React.FC = () => {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all'>('all');

  const loadPosts = useCallback(async () => {
    const data = await fetchPublishedPosts();
    setPosts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const filtered = activeCategory === 'all'
    ? posts
    : posts.filter(p => p.category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-400">
        <div className="animate-pulse">Loading announcements...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-parchment-100 mb-1">
          <span className="mr-2">📣</span>Town Crier
        </h1>
        <p className="text-sm text-stone-400">Hear ye, hear ye! The latest news from the realm.</p>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activeCategory === cat.id
                ? 'bg-arcane-600 text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Posts */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-3">📜</div>
          <div className="text-lg">The town crier has no news to share... yet.</div>
          <div className="text-xs mt-1 text-stone-600">Check back soon for announcements!</div>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(post => (
            <article
              key={post.id}
              className="bg-stone-800/60 rounded-lg border border-stone-700/50 overflow-hidden"
            >
              {/* Banner */}
              {post.banner_url && (
                <div className="w-full h-48 overflow-hidden">
                  <img
                    src={post.banner_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-5">
                {/* Category badge */}
                <div className="mb-2">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${CATEGORY_COLORS[post.category]}`}>
                    {post.category}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-lg font-bold text-parchment-100 mb-1">{post.title}</h2>

                {/* Author & date */}
                <div className="text-xs text-stone-500 mb-3">
                  {post.author} &mdash; {formatDate(post.published_at || post.created_at)}
                </div>

                {/* Body */}
                <div
                  className="prose prose-sm prose-invert max-w-none text-stone-300
                    [&_a]:text-arcane-400 [&_a]:underline
                    [&_strong]:text-parchment-200
                    [&_ul]:list-disc [&_ul]:pl-5
                    [&_ol]:list-decimal [&_ol]:pl-5
                    [&_li]:text-stone-300
                    [&_h3]:text-parchment-200 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1
                    [&_h4]:text-parchment-200 [&_h4]:text-sm [&_h4]:font-bold [&_h4]:mt-2 [&_h4]:mb-1
                    [&_p]:mb-2"
                  dangerouslySetInnerHTML={{ __html: post.body }}
                />

                {/* Summary */}
                {post.summary && (
                  <div className="mt-3 pt-3 border-t border-stone-700/50 text-xs text-stone-500 italic">
                    {post.summary}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
