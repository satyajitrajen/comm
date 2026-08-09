'use client';

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

interface LinkPreviewData {
  title: string;
  description: string;
  image: string;
  url: string;
}

export default function LinkPreview({ url, onLoadSuccess, isOwn }: { url: string, onLoadSuccess?: () => void, isOwn?: boolean }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchMetadata() {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Failed to fetch link preview');
        const json = await res.json();
        
        if (isMounted) {
          setData(json);
          setLoading(false);
          if (json.title || json.description || json.image) {
            onLoadSuccess?.();
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchMetadata();
    
    return () => {
      isMounted = false;
    };
  }, [url]);

  if (error) return null;

  if (loading) {
    return (
      <div className="mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm animate-pulse">
        <div className="h-36 w-full bg-slate-200 rounded-lg mb-3"></div>
        <div className="h-4 w-3/4 bg-slate-200 rounded mb-2"></div>
        <div className="h-3 w-1/2 bg-slate-200 rounded"></div>
      </div>
    );
  }

  if (!data || (!data.title && !data.description && !data.image)) return null;

  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    domain = url;
  }

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`mt-2 block w-full max-w-md overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md group ${
        isOwn 
          ? 'border-transparent bg-blue-600 hover:bg-blue-700' 
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {data.image && (
        <div className={`relative h-40 w-full overflow-hidden border-b ${isOwn ? 'bg-blue-800/50 border-blue-700/50' : 'bg-slate-100 border-slate-100'}`}>
          <img 
            src={data.image} 
            alt={data.title || 'Link preview'} 
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-3.5">
        {data.title && (
          <h4 className={`line-clamp-1 text-sm font-semibold mb-1 leading-snug ${isOwn ? 'text-white' : 'text-slate-900'}`}>{data.title}</h4>
        )}
        {data.description && (
          <p className={`line-clamp-2 text-xs mb-2.5 leading-relaxed ${isOwn ? 'text-blue-100' : 'text-slate-500'}`}>
            {data.description}
          </p>
        )}
        <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
          <ExternalLink className="h-3 w-3" />
          <span>{domain}</span>
        </div>
      </div>
    </a>
  );
}
