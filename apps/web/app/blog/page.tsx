"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SearchIcon,
  PlusIcon,
  Loader2Icon,
  TagIcon,
  UserIcon,
  FilterIcon,
  XIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchBlogPosts, searchBlogPosts, type BlogPost } from "@/services/blog-api";
import { BLOG_TAGS } from "@/lib/blog-tags";
import { useAuth } from "@/hooks/auth";
import { useUserRole } from "@/hooks/useUserRole";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BlogPage() {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setSearching] = useState(false);
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "visible" | "hidden" | "all"
  >("visible");
  const [showFilters, setShowFilters] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBlogPosts("lessons", { includeHidden: isAdmin });
      setPosts(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      void loadPosts();
      return;
    }
    setSearching(true);
    try {
      const data = await searchBlogPosts(q, "lessons", {
        includeHidden: isAdmin,
      });
      setPosts(data ?? []);
    } finally {
      setSearching(false);
    }
  }, [isAdmin, searchQuery, loadPosts]);

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

  const authors = useMemo(() => {
    const authorSet = new Map<
      string,
      { id: string; mention: string; name: string }
    >();
    posts.forEach((post) => {
      if (!authorSet.has(post.authorId)) {
        authorSet.set(post.authorId, {
          id: post.authorId,
          mention: post.authorMention,
          name: post.authorName,
        });
      }
    });
    return Array.from(authorSet.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (visibilityFilter === "visible" && post.isHidden) {
        return false;
      }
      if (visibilityFilter === "hidden" && !post.isHidden) {
        return false;
      }
      if (selectedAuthor && post.authorId !== selectedAuthor) {
        return false;
      }
      if (selectedTag && !post.tags.includes(selectedTag)) {
        return false;
      }
      return true;
    });
  }, [posts, selectedAuthor, selectedTag, visibilityFilter]);

  const hasActiveFilters =
    selectedAuthor ||
    selectedTag ||
    searchQuery ||
    (isAdmin && visibilityFilter !== "visible");

  const clearFilters = useCallback(() => {
    setSelectedAuthor("");
    setSelectedTag("");
    setSearchQuery("");
    setVisibilityFilter("visible");
    void loadPosts();
  }, [loadPosts]);

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-muted-foreground">
          Inicia sesión para ver las lecciones.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lecciones aprendidas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documenta problemas, soluciones y prevenciones
          </p>
        </div>
        <Button asChild>
          <Link href="/blog/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Nueva lección
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedAuthor || "__all__"}
              onValueChange={(v) =>
                setSelectedAuthor(v === "__all__" ? "" : v)
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por autor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los autores</SelectItem>
                {authors.map((author) => (
                  <SelectItem key={author.id} value={author.id}>
                    {author.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedTag || "__all__"}
              onValueChange={(v) => setSelectedTag(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por etiqueta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las etiquetas</SelectItem>
                {BLOG_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin ? (
              <Select
                value={visibilityFilter}
                onValueChange={(v) =>
                  setVisibilityFilter(v as "visible" | "hidden" | "all")
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Visibilidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">Solo visibles</SelectItem>
                  <SelectItem value="hidden">Solo ocultos</SelectItem>
                  <SelectItem value="all">Todos (visibles y ocultos)</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1"
              >
                <XIcon className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No se encontraron resultados."
              : "No hay lecciones todavía. ¡Crea la primera!"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
          {filteredPosts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/blog/${post.id}`}
                className="block px-4 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium leading-snug text-foreground">
                        {post.title}
                      </span>
                      {post.isHidden ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Oculto
                        </Badge>
                      ) : null}
                    </div>
                    <div className="line-clamp-2 text-sm text-muted-foreground prose prose-sm dark:prose-invert prose-p:my-0 max-w-prose">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ children }) => <>{children}</>,
                        }}
                      >
                        {post.content.slice(0, 220)}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" />@
                      {post.authorMention}
                    </span>
                    <span className="mt-0.5 block">{formatDate(post.createdAt)}</span>
                  </div>
                </div>
                {post.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="gap-1 text-[11px] font-normal"
                      >
                        <TagIcon className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
