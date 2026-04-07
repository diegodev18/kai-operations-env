"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SearchIcon, PlusIcon, Loader2Icon, TagIcon, UserIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchBlogPosts, searchBlogPosts, type BlogPost } from "@/lib/blog-api";
import { useAuth } from "@/hooks/auth";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BlogPage() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBlogPosts();
      setPosts(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      void loadPosts();
      return;
    }
    setSearching(true);
    try {
      const data = await searchBlogPosts(q);
      setPosts(data ?? []);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, loadPosts]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        void handleSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSearch]);

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Inicia sesión para ver el blog.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
          <p className="mt-1 text-muted-foreground">
            Comparte soluciones, papers técnicos y conocimientos
          </p>
        </div>
        <Button asChild>
          <Link href="/blog/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Nuevo post
          </Link>
        </Button>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, contenido, etiquetas o autor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">
            {searchQuery ? "No se encontraron resultados." : "No hay posts todavía. ¡Crea el primero!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.id}`} className="block">
              <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xl hover:text-primary">
                      {post.title}
                    </CardTitle>
                    {post.isHidden && (
                      <Badge variant="secondary">Oculto</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" />
                      @{post.authorMention}
                    </span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </CardHeader>
                <CardContent className="gap-4">
                  <div className="line-clamp-3 text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {post.content.slice(0, 300)}
                    </ReactMarkdown>
                  </div>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="gap-1">
                          <TagIcon className="h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}