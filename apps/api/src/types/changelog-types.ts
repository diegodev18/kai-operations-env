export interface ChangelogPayload {
  projectId: string;
  registerDate: string;
  implementationDate: string;
  version: string;
  author: { name: string; email: string };
  collaborators: { name: string; email: string }[];
  description: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
    improved?: string[];
  };
  attachments: { name: string; url: string; type: string }[];
  ticketUrl?: string;
  createTicket: boolean;
  tags?: string[];
  status: "draft" | "published";
  internalNotes?: string;
}
