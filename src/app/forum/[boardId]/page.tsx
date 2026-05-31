"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Eye,
  Heart,
  MessageCircle,
  Pin,
  PenSquare,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

interface Board {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
  isAnonymous: boolean;
  isPinned: boolean;
  isTop: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: { nickname: string; avatar: string | null; department: string | null };
}

export default function BoardPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const [board, setBoard] = useState<Board | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("boardId", boardId);
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (searchQuery) params.set("q", searchQuery);

      const [boardRes, postsRes] = await Promise.all([
        fetch(`/api/forum/boards`),
        fetch(`/api/forum/posts?${params}`),
      ]);
      const boardData = await boardRes.json();
      const postsData = await postsRes.json();

      if (boardData.success) {
        const found = boardData.data.find((b: Board) => b.id === boardId);
        if (found) setBoard(found);
      }
      if (postsData.success) {
        setPosts(postsData.data.posts);
        setTotal(postsData.data.total);
      }
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, [boardId, page, limit, searchQuery]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // SSE：新帖子/评论时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "forum") fetchPosts(true);
  }, [fetchPosts]);
  useRealtime(handleRealtime, [fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const totalPages = Math.ceil(total / limit);

  // Separate pinned and regular posts
  const pinnedPosts = posts.filter((p) => p.isPinned || p.isTop);
  const regularPosts = posts.filter((p) => !p.isPinned && !p.isTop);

  const renderPostCard = (post: Post) => (
    <Link key={post.id} href={`/forum/${boardId}/${post.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="shrink-0">
              <AvatarImage
                src={post.isAnonymous ? "" : post.author.avatar || ""}
              />
              <AvatarFallback>
                {post.isAnonymous ? "匿" : post.author.nickname?.[0] || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {(post.isPinned || post.isTop) && (
                  <Pin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                )}
                <h3 className="font-semibold text-sm line-clamp-1">
                  {post.title}
                </h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-1 mb-2">
                {post.content.slice(0, 100)}
                {post.content.length > 100 ? "..." : ""}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span>
                  {post.isAnonymous ? "匿名用户" : post.author.nickname}
                </span>
                {post.author.department && !post.isAnonymous && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span>{post.author.department}</span>
                  </>
                )}
                <span className="text-gray-300">|</span>
                <span className="flex items-center gap-0.5">
                  <Eye className="w-3 h-3" />
                  {post.viewCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <Heart className="w-3 h-3" />
                  {post.likeCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <MessageCircle className="w-3 h-3" />
                  {post.commentCount}
                </span>
                <span className="ml-auto">
                  {formatDistanceToNow(new Date(post.createdAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <div className="container mx-auto px-4 py-5">
      {/* Board Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/forum" className="text-sm text-gray-500 hover:text-gray-700">
            校园贴吧
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium">{board?.name || "版块"}</span>
        </div>
        {board && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{board.icon || "💬"}</span>
            <div>
              <h1 className="text-xl font-bold">{board.name}</h1>
              <p className="text-sm text-gray-500">{board.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <Input
          placeholder="搜索帖子..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="default">
          <Search className="w-4 h-4 mr-1" />
          搜索
        </Button>
        {searchQuery && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSearchInput("");
              setPage(1);
            }}
          >
            清除
          </Button>
        )}
      </form>

      {/* Post List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchQuery ? "没有找到相关帖子" : "暂无帖子，快来发第一帖吧！"}
        </div>
      ) : (
        <div className="space-y-3">
          {pinnedPosts.length > 0 && (
            <>
              {pinnedPosts.map(renderPostCard)}
              <div className="border-t my-4" />
            </>
          )}
          {regularPosts.map(renderPostCard)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Floating Post Button */}
      <Link href={`/forum/post?boardId=${boardId}`}>
        <Button
          className="fixed bottom-20 right-6 rounded-full w-14 h-14 shadow-lg z-40"
          size="icon"
        >
          <PenSquare className="w-5 h-5" />
        </Button>
      </Link>
    </div>
  );
}
