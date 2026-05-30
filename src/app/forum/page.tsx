"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Eye,
  Heart,
  MessageCircle,
  PenSquare,
  Flame,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

interface Board {
  id: string;
  name: string;
  description: string;
  icon: string;
  postCount: number;
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
  board: { name: string };
  boardId: string;
}

export default function ForumPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [boardsRes, postsRes] = await Promise.all([
        fetch("/api/forum/boards"),
        fetch("/api/forum/posts?limit=10"),
      ]);
      const boardsData = await boardsRes.json();
      const postsData = await postsRes.json();
      if (boardsData.success) setBoards(boardsData.data);
      if (postsData.success) setPosts(postsData.data.posts);
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // SSE：新帖子/评论时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "forum") fetchAll(true);
  }, [fetchAll]);
  useRealtime(handleRealtime, [fetchAll]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">校园贴吧</h1>
        <Link href="/forum/post">
          <Button>
            <PenSquare className="w-4 h-4 mr-1" />
            发帖
          </Button>
        </Link>
      </div>

      {/* Board Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        {boards.map((board) => (
          <Link key={board.id} href={`/forum/${board.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <span className="text-3xl">{board.icon || "💬"}</span>
                <h3 className="font-semibold text-sm">{board.name}</h3>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {board.description}
                </p>
                <Badge variant="secondary" className="text-xs">
                  {board.postCount} 帖子
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Hot Posts */}
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-bold">最新热帖</h2>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无帖子</div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/forum/${post.boardId}/${post.id}`}
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage
                        src={post.isAnonymous ? "" : post.author.avatar || ""}
                      />
                      <AvatarFallback>
                        {post.isAnonymous ? "匿" : post.author.nickname?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {post.isPinned && (
                          <Badge variant="destructive" className="text-xs">
                            置顶
                          </Badge>
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
                        <span className="text-gray-300">|</span>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {post.board.name}
                        </Badge>
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
          ))}
        </div>
      )}
    </div>
  );
}
