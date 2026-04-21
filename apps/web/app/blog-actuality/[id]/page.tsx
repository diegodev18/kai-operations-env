"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  Loader2Icon,
  UserIcon,
  TagIcon,
  EditIcon,
  EyeOffIcon,
  EyeIcon,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchBlogPost, hideBlogPost, type BlogPost } from "@/services/blog-api";
import { useAuth } from "@/hooks/auth";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActualityPostPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const id = params.id as string;

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiding, setHiding] = useState(false);

  const userRole = (session?.user as { role?: string })?.role;
  const isAdmin = userRole === "admin";
  const isAuthor = post && session?.user?.id === post.authorId;
  const canEdit = isAuthor || isAdmin;

  const loadPost = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBlogPost(id);
      if (!data) {
        toast.error("Entrada no encontrada");
        router.push("/blog-actuality");
        return;
      }
      if (data.type !== "actuality") {
        toast.error("Entrada no encontrada");
        router.push("/blog-actuality");
        return;
      }
      setPost(data);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  const handleToggleHide = useCallback(async () => {
    if (!post) return;
    setHiding(true);
    try {
      const result = await hideBlogPost(id, !post.isHidden);
      if (result.ok) {
        setPost((prev) =>
          prev ? { ...prev, isHidden: !prev.isHidden } : null,
        );
        toast.success(post.isHidden ? "Entrada visible" : "Entrada oculta");
      } else {
        toast.error(result.error ?? "Error al cambiar visibilidad");
      }
    } finally {
      setHiding(false);
    }
  }, [id, post]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Entrada no encontrada</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-prose flex-1 px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
          <Link href="/blog-actuality">
            <ArrowLeftIcon className="h-4 w-4" />
            Lista
          </Link>
        </Button>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleToggleHide()}
                disabled={hiding}
              >
                {hiding ? (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                ) : post.isHidden ? (
                  <EyeIcon className="mr-2 h-4 w-4" />
                ) : (
                  <EyeOffIcon className="mr-2 h-4 w-4" />
                )}
                {post.isHidden ? "Mostrar" : "Ocultar"}
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/blog-actuality/${id}/edit`}>
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <article className="space-y-6">
        <header className="space-y-3 border-b border-border/50 pb-6">
          {post.isHidden ? (
            <Badge variant="secondary" className="text-[10px]">
              Oculto
            </Badge>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" />@{post.authorMention}
            </span>
            <span>·</span>
            <span>{formatDate(post.createdAt)}</span>
            {post.updatedAt !== post.createdAt ? (
              <>
                <span>·</span>
                <span className="text-xs">editado</span>
              </>
            ) : null}
          </div>
        </header>

        {post.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 font-normal">
                <TagIcon className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {post.images.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {post.images.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`Imagen ${i + 1}`}
                className="rounded-md border border-border/50"
              />
            ))}
          </div>
        ) : null}

        <div className="prose prose-stone dark:prose-invert max-w-none prose-headings:scroll-mt-20">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
