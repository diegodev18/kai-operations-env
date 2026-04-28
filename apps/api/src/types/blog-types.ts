export interface BlogPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorMention: string;
  tags: string[];
  images: string[];
  mentions: string[];
  isHidden: boolean;
  type?: string;
  createdAt: number;
  updatedAt: number;
}
