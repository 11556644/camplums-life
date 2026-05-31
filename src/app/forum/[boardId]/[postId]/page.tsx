"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth";
import { toast } from "sonner";
import {
  Heart,
  Star,
  Share2,
  MessageCircle,
  Send,
  ArrowLeft,
  Eye,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

interface Comment {
  id: string;
  content: string;
  isAnonymous: boolean;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
  author: { id: string; nickname: string; avatar: string | null };
  replies: Comment[];
}

interface Post {
  id: string;
  title: string;
  content: string;
  images: string[];
  isAnonymous: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isFavorited: boolean;
  createdAt: string;
  author: { id: string; nickname: string; avatar: string | null; department: string | null };
  board: { id: string; name: string };
  comments: Comment[];
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const boardId = params.boardId as string;
  const postId = params.postId as string;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [favorited, setFavorited] = useState(false);

  // Comment form
  const [commentContent, setCommentContent] = useState("");
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);

  const fetchPost = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/forum/posts/${postId}`);
      const d = await res.json();
      if (d.success) {
        setPost(d.data);
        setLiked(d.data.isLiked);
        setLikeCount(d.data.likeCount);
        setFavorited(d.data.isFavorited);
      }
    } catch { /* silent */ }
    if (!silent) setLoading(false);
  }, [postId]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  // SSE：本帖子有新评论时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "forum" && event.targetId === postId) fetchPost(true);
  }, [postId, fetchPost]);
  useRealtime(handleRealtime, [postId]);

  const handleLike = async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    try {
      const res = await fetch(`/api/forum/posts/${postId}/like`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success !== false) {
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      }
    } catch {
      toast.error("操作失败");
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    try {
      const res = await fetch(`/api/forum/posts/${postId}/favorite`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success !== false) {
        setFavorited(data.favorited);
        toast.success(data.favorited ? "已收藏" : "已取消收藏");
      }
    } catch {
      toast.error("操作失败");
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("链接已复制");
    });
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此帖子？")) return;
    try {
      const res = await fetch(`/api/forum/posts/${postId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("已删除");
        router.push(`/forum/${boardId}`);
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleSubmitComment = async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    if (!commentContent.trim()) {
      toast.error("请输入评论内容");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/posts/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentContent.trim(),
          isAnonymous: commentAnonymous,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("评论成功");
        setCommentContent("");
        setCommentAnonymous(false);
        // Refresh post to get new comments
        const refresh = await fetch(`/api/forum/posts/${postId}`);
        const refreshData = await refresh.json();
        if (refreshData.success) setPost(refreshData.data);
      } else {
        toast.error(data.error || "评论失败");
      }
    } catch {
      toast.error("评论失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    if (!replyContent.trim()) {
      toast.error("请输入回复内容");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/posts/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
          isAnonymous: replyAnonymous,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("回复成功");
        setReplyContent("");
        setReplyTo(null);
        setReplyAnonymous(false);
        const refresh = await fetch(`/api/forum/posts/${postId}`);
        const refreshData = await refresh.json();
        if (refreshData.success) setPost(refreshData.data);
      } else {
        toast.error(data.error || "回复失败");
      }
    } catch {
      toast.error("回复失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    try {
      const res = await fetch(`/api/forum/comments/${commentId}/like`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success !== false) {
        // Refresh to update like state
        const refresh = await fetch(`/api/forum/posts/${postId}`);
        const refreshData = await refresh.json();
        if (refreshData.success) setPost(refreshData.data);
      }
    } catch {
      toast.error("操作失败");
    }
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div
      key={comment.id}
      className={`${isReply ? "ml-10 pl-3 border-l-2 border-gray-100" : ""}`}
    >
      <div className="flex gap-3 py-3">
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarImage
            src={comment.isAnonymous ? "" : comment.author.avatar || ""}
          />
          <AvatarFallback className="text-xs">
            {comment.isAnonymous ? "匿" : comment.author.nickname?.[0] || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">
              {comment.isAnonymous ? "匿名用户" : comment.author.nickname}
            </span>
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </span>
          </div>
          <p className="text-sm text-gray-700 mb-1">{comment.content}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleCommentLike(comment.id)}
              className={`flex items-center gap-1 text-xs ${
                comment.isLiked
                  ? "text-red-500"
                  : "text-gray-400 hover:text-red-500"
              }`}
            >
              <Heart
                className="w-3.5 h-3.5"
                fill={comment.isLiked ? "currentColor" : "none"}
              />
              {comment.likeCount > 0 && comment.likeCount}
            </button>
            {!isReply && (
              <button
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyContent("");
                  setReplyAnonymous(false);
                }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                回复
              </button>
            )}
          </div>

          {/* Inline Reply Form */}
          {replyTo === comment.id && (
            <div className="mt-2 space-y-2">
              <Textarea
                placeholder={`回复 ${comment.isAnonymous ? "匿名用户" : comment.author.nickname}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] text-sm"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replyAnonymous}
                    onChange={(e) => setReplyAnonymous(e.target.checked)}
                    className="w-3 h-3"
                  />
                  匿名
                </label>
                <Button
                  size="sm"
                  onClick={() => handleSubmitReply(comment.id)}
                  disabled={submitting || !replyContent.trim()}
                >
                  <Send className="w-3 h-3 mr-1" />
                  {submitting ? "发送中..." : "回复"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReplyTo(null)}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* Nested Replies (楼中楼) */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-1">
              {comment.replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-5 max-w-3xl">
        <div className="space-y-4">
          <div className="h-8 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-1/3 bg-gray-200 rounded animate-pulse" />
          <div className="h-40 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-gray-400">
        帖子不存在
      </div>
    );
  }

  const images = post.images ?? [];

  return (
    <div className="container mx-auto px-4 py-5 max-w-3xl">
      {/* Back */}
      <Link
        href={`/forum/${boardId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回 {post.board.name}
      </Link>

      {/* Post Content */}
      <Card>
        <CardHeader className="pb-3">
          <h1 className="text-xl font-bold">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Avatar className="w-7 h-7">
              <AvatarImage
                src={post.isAnonymous ? "" : post.author.avatar || ""}
              />
              <AvatarFallback className="text-xs">
                {post.isAnonymous ? "匿" : post.author.nickname?.[0] || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">
              {post.isAnonymous ? "匿名用户" : post.author.nickname}
            </span>
            {post.author.department && !post.isAnonymous && (
              <Badge variant="outline" className="text-xs">
                {post.author.department}
              </Badge>
            )}
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(post.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </div>

          {/* Images */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`图片 ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(url, "_blank")}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ))}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center gap-1 pt-3 border-t flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-400 mr-3">
              <Eye className="w-4 h-4" />
              {post.viewCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              className={liked ? "text-red-500" : "text-gray-500"}
            >
              <Heart
                className="w-4 h-4 mr-1"
                fill={liked ? "currentColor" : "none"}
              />
              {likeCount > 0 && likeCount}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFavorite}
              className={favorited ? "text-yellow-500" : "text-gray-500"}
            >
              <Star
                className="w-4 h-4 mr-1"
                fill={favorited ? "currentColor" : "none"}
              />
              {favorited ? "已收藏" : "收藏"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="text-gray-500"
            >
              <Share2 className="w-4 h-4 mr-1" />
              分享
            </Button>
            {user && (user.id === post.author.id || user.roles?.includes("admin")) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                删除
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comments Section */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-bold">
            评论 ({post.comments?.length || 0})
          </h2>
        </div>

        {post.comments && post.comments.length > 0 ? (
          <Card>
            <CardContent className="divide-y divide-gray-100 px-4">
              {post.comments.map((comment) => renderComment(comment))}
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无评论，快来抢沙发吧！
          </div>
        )}
      </div>

      {/* Comment Form */}
      <div className="mt-6">
        {user ? (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user.avatar || ""} />
                  <AvatarFallback className="text-xs">
                    {user.nickname?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user.nickname}</span>
              </div>
              <Textarea
                placeholder="写下你的评论..."
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commentAnonymous}
                    onChange={(e) => setCommentAnonymous(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  匿名评论
                </label>
                <Button
                  onClick={handleSubmitComment}
                  disabled={submitting || !commentContent.trim()}
                >
                  <Send className="w-4 h-4 mr-1" />
                  {submitting ? "发送中..." : "发表评论"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 mb-3">登录后即可评论</p>
              <Link href="/login">
                <Button>去登录</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
